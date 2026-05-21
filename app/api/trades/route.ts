import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Admin client — bypasses RLS for ownership validation & reads */
function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Fall back to anon key if service role isn't configured (read-only checks still work)
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** User-authenticated client — respects RLS policies that match auth.uid() */
function userSupabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

type TradeItem = {
  card_id: string;
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  rarity: string;
  rating: number;
};

// POST /api/trades — create a trade offer
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    receiver_id,
    message,
    offer_items,
    request_items,
  } = body as {
    receiver_id: string;
    message?: string;
    offer_items: TradeItem[];
    request_items: TradeItem[];
  };

  if (!receiver_id) return NextResponse.json({ error: "Missing receiver_id" }, { status: 400 });
  if (receiver_id === user.id) return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  if (!offer_items?.length && !request_items?.length)
    return NextResponse.json({ error: "Trade must include at least one card" }, { status: 400 });

  const admin = adminSupabase();
  const authed = userSupabase(token);

  // Verify sender owns all offered cards (admin read bypasses RLS)
  if (offer_items?.length) {
    const { data: senderCards } = await admin
      .from("user_cards")
      .select("id, duplicate_count")
      .eq("user_id", user.id)
      .in("id", offer_items.map((i) => i.card_id));

    for (const item of offer_items) {
      const owned = (senderCards ?? []).find((c: any) => c.id === item.card_id);
      if (!owned || owned.duplicate_count < 1)
        return NextResponse.json({ error: `You don't own: ${item.player_name} (${item.rarity})` }, { status: 400 });
    }
  }

  // Verify receiver owns all requested cards
  if (request_items?.length) {
    const { data: receiverCards } = await admin
      .from("user_cards")
      .select("id, duplicate_count")
      .eq("user_id", receiver_id)
      .in("id", request_items.map((i) => i.card_id));

    for (const item of request_items) {
      const owned = (receiverCards ?? []).find((c: any) => c.id === item.card_id);
      if (!owned || owned.duplicate_count < 1)
        return NextResponse.json({ error: `Receiver doesn't own: ${item.player_name} (${item.rarity})` }, { status: 400 });
    }
  }

  // Insert trade offer using user's JWT so RLS policy "trades_insert" passes
  const { data: trade, error: tradeErr } = await authed
    .from("trade_offers")
    .insert({ sender_id: user.id, receiver_id, message: message ?? null })
    .select("id")
    .single();

  if (tradeErr || !trade) {
    console.error("[trades] insert error:", tradeErr?.message);
    return NextResponse.json({ error: tradeErr?.message ?? "Failed to create trade offer" }, { status: 500 });
  }

  // Insert items using user's JWT (trade_items_insert policy checks sender_id)
  const allItems = [
    ...(offer_items ?? []).map((i) => ({ ...i, trade_offer_id: trade.id, direction: "offer" })),
    ...(request_items ?? []).map((i) => ({ ...i, trade_offer_id: trade.id, direction: "request" })),
  ];

  if (allItems.length) {
    const { error: itemsErr } = await authed.from("trade_offer_items").insert(allItems);
    if (itemsErr) {
      console.error("[trades] items insert error:", itemsErr.message);
      await authed.from("trade_offers").delete().eq("id", trade.id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
  }

  // Notify the receiver they have a new trade offer (fallback if DB trigger isn't set up)
  await admin.from("notifications").upsert(
    { user_id: receiver_id, type: "trade_offer", actor_id: user.id, data: { trade_id: trade.id }, read: false },
    { onConflict: "user_id,type,actor_id", ignoreDuplicates: true }
  ).catch(() => {}); // non-fatal

  return NextResponse.json({ ok: true, trade_id: trade.id });
}

// GET /api/trades — list the current user's trade offers
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminSupabase();

  const { data: trades, error } = await admin
    .from("trade_offers")
    .select("id, sender_id, receiver_id, status, message, created_at, updated_at, items:trade_offer_items(id, direction, card_id, player_id, player_name, team, team_logo, rarity, rating)")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = Array.from(new Set((trades ?? []).flatMap((t: any) => [t.sender_id, t.receiver_id])));
  const { data: profiles } = await admin.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds);
  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));

  const enriched = (trades ?? []).map((t: any) => ({
    ...t,
    sender: profileMap[t.sender_id] ?? null,
    receiver: profileMap[t.receiver_id] ?? null,
  }));

  return NextResponse.json({ trades: enriched });
}
