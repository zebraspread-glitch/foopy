import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    offer_items,   // cards the sender is giving
    request_items, // cards the sender wants
  } = body as {
    receiver_id: string;
    message?: string;
    offer_items: TradeItem[];
    request_items: TradeItem[];
  };

  if (!receiver_id) return NextResponse.json({ error: "Missing receiver_id" }, { status: 400 });
  if (receiver_id === user.id) return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  if ((!offer_items?.length && !request_items?.length))
    return NextResponse.json({ error: "Trade must include at least one card" }, { status: 400 });

  const admin = adminSupabase();

  // Verify the sender actually owns all offered cards
  if (offer_items?.length) {
    const offerIds = offer_items.map((i) => i.card_id);
    const { data: senderCards } = await admin
      .from("user_cards")
      .select("id, duplicate_count")
      .eq("user_id", user.id)
      .in("id", offerIds);

    for (const item of offer_items) {
      const owned = (senderCards ?? []).find((c: any) => c.id === item.card_id);
      if (!owned || owned.duplicate_count < 1) {
        return NextResponse.json({ error: `You don't own: ${item.player_name} (${item.rarity})` }, { status: 400 });
      }
    }
  }

  // Verify the receiver owns all requested cards
  if (request_items?.length) {
    const requestIds = request_items.map((i) => i.card_id);
    const { data: receiverCards } = await admin
      .from("user_cards")
      .select("id, duplicate_count")
      .eq("user_id", receiver_id)
      .in("id", requestIds);

    for (const item of request_items) {
      const owned = (receiverCards ?? []).find((c: any) => c.id === item.card_id);
      if (!owned || owned.duplicate_count < 1) {
        return NextResponse.json({ error: `Receiver doesn't own: ${item.player_name} (${item.rarity})` }, { status: 400 });
      }
    }
  }

  // Create the trade offer
  const { data: trade, error: tradeErr } = await admin
    .from("trade_offers")
    .insert({ sender_id: user.id, receiver_id, message: message ?? null })
    .select("id")
    .single();

  if (tradeErr || !trade) {
    console.error("[trades] insert error:", tradeErr?.message);
    return NextResponse.json({ error: "Failed to create trade offer" }, { status: 500 });
  }

  // Insert all items
  const allItems = [
    ...(offer_items ?? []).map((i) => ({ ...i, trade_offer_id: trade.id, direction: "offer" })),
    ...(request_items ?? []).map((i) => ({ ...i, trade_offer_id: trade.id, direction: "request" })),
  ];

  if (allItems.length) {
    const { error: itemsErr } = await admin.from("trade_offer_items").insert(allItems);
    if (itemsErr) {
      console.error("[trades] items insert error:", itemsErr.message);
      // Roll back the trade offer
      await admin.from("trade_offers").delete().eq("id", trade.id);
      return NextResponse.json({ error: "Failed to create trade items" }, { status: 500 });
    }
  }

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

  // Attach profile info for sender/receiver
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
