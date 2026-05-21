import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function userSupabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function insertNotification(
  admin: ReturnType<typeof adminSupabase>,
  userId: string,
  type: string,
  actorId: string,
  data: Record<string, unknown> = {}
) {
  if (userId === actorId) return; // no self-notifications
  await admin.from("notifications").insert({
    user_id: userId,
    type,
    actor_id: actorId,
    data,
    read: false,
  });
}

// PATCH /api/trades/[id] — accept | decline | cancel
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tradeId } = await params;
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json().catch(() => ({}));
  if (!["accept", "decline", "cancel"].includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const admin = adminSupabase();
  const authed = userSupabase(token);

  // Fetch the trade to verify permissions
  const { data: trade, error: fetchErr } = await admin
    .from("trade_offers")
    .select("id, sender_id, receiver_id, status")
    .eq("id", tradeId)
    .single();

  if (fetchErr || !trade)
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });

  if (trade.status !== "pending")
    return NextResponse.json({ error: "Trade is no longer pending" }, { status: 400 });

  if (action === "accept") {
    if (trade.receiver_id !== user.id)
      return NextResponse.json({ error: "Only the receiver can accept" }, { status: 403 });

    const { data, error } = await authed.rpc("accept_trade", { trade_id: tradeId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.ok) return NextResponse.json({ error: data?.error ?? "Failed to accept" }, { status: 400 });

    // Notify the sender their trade was accepted
    await insertNotification(admin, trade.sender_id, "trade_accepted", user.id, { trade_id: tradeId });

    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (trade.receiver_id !== user.id)
      return NextResponse.json({ error: "Only the receiver can decline" }, { status: 403 });

    const { error } = await authed.from("trade_offers").update({ status: "declined" }).eq("id", tradeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify the sender their trade was declined
    await insertNotification(admin, trade.sender_id, "trade_declined", user.id, { trade_id: tradeId });

    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (trade.sender_id !== user.id)
      return NextResponse.json({ error: "Only the sender can cancel" }, { status: 403 });

    const { error } = await authed.from("trade_offers").update({ status: "cancelled" }).eq("id", tradeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }
}
