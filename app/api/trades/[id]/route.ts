import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

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
  if (userId === actorId) return;
  await admin.from("notifications").insert({
    user_id: userId, type, actor_id: actorId, data, read: false,
  });
}

/** Move one copy of a card from one user to another using the service-role client. */
async function transferCard(
  cardId: string,
  fromUserId: string,
  toUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Read the card
  const { data: card, error: readErr } = await supabaseServer
    .from("user_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", fromUserId)
    .single();

  if (readErr || !card)
    return { ok: false, error: `Card not found for user (id: ${cardId})` };

  // Remove one copy from sender
  if (card.duplicate_count <= 1) {
    const { error } = await supabaseServer.from("user_cards").delete().eq("id", cardId);
    if (error) return { ok: false, error: `Failed to remove card from sender: ${error.message}` };
  } else {
    const { error } = await supabaseServer
      .from("user_cards")
      .update({ duplicate_count: card.duplicate_count - 1 })
      .eq("id", cardId);
    if (error) return { ok: false, error: `Failed to decrement card: ${error.message}` };
  }

  // Check if receiver already owns a copy of this card
  const { data: existing } = await supabaseServer
    .from("user_cards")
    .select("id, duplicate_count")
    .eq("user_id", toUserId)
    .eq("player_id", card.player_id)
    .eq("rarity", card.rarity)
    .maybeSingle();

  if (existing) {
    // Increment existing copy
    const { error } = await supabaseServer
      .from("user_cards")
      .update({ duplicate_count: existing.duplicate_count + 1 })
      .eq("id", existing.id);
    if (error) return { ok: false, error: `Failed to increment receiver card: ${error.message}` };
  } else {
    // Give them a new copy
    const { error } = await supabaseServer.from("user_cards").insert({
      user_id:         toUserId,
      player_id:       card.player_id,
      player_name:     card.player_name,
      team:            card.team,
      team_logo:       card.team_logo,
      rarity:          card.rarity,
      rating:          card.rating,
      duplicate_count: 1,
      pack_type:       "trade",
    });
    if (error) return { ok: false, error: `Failed to insert card for receiver: ${error.message}` };
  }

  return { ok: true };
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

  const admin  = adminSupabase();
  const authed = userSupabase(token);

  // Fetch the trade (user JWT so RLS passes)
  const { data: trade, error: fetchErr } = await authed
    .from("trade_offers")
    .select("id, sender_id, receiver_id, status")
    .eq("id", tradeId)
    .single();

  if (fetchErr || !trade)
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });

  if (trade.status !== "pending")
    return NextResponse.json({ error: "Trade is no longer pending" }, { status: 400 });

  // ── ACCEPT ────────────────────────────────────────────────────────────────
  if (action === "accept") {
    if (trade.receiver_id !== user.id)
      return NextResponse.json({ error: "Only the receiver can accept" }, { status: 403 });

    // Fetch all items for this trade
    const { data: items, error: itemsErr } = await supabaseServer
      .from("trade_offer_items")
      .select("*")
      .eq("trade_offer_id", tradeId);

    if (itemsErr) {
      console.error("[accept] items fetch error:", itemsErr.message);
      return NextResponse.json({ error: `DB error fetching items: ${itemsErr.message}` }, { status: 500 });
    }
    if (!items || items.length === 0)
      return NextResponse.json({ error: "Trade has no items" }, { status: 400 });

    const offerItems   = items.filter((i: any) => i.direction === "offer");   // sender → receiver
    const requestItems = items.filter((i: any) => i.direction === "request"); // receiver → sender

    // Validate sender still owns every offered card
    for (const item of offerItems) {
      if (!item.card_id) {
        await supabaseServer.from("trade_offers").update({ status: "cancelled" }).eq("id", tradeId);
        return NextResponse.json({ error: `Sender no longer owns: ${item.player_name}` }, { status: 400 });
      }
      const { data: card, error: cardErr } = await supabaseServer
        .from("user_cards")
        .select("id, duplicate_count")
        .eq("id", item.card_id)
        .eq("user_id", trade.sender_id)
        .maybeSingle();
      if (cardErr) {
        console.error("[accept] sender card lookup error:", cardErr.message);
        return NextResponse.json({ error: `DB error checking card: ${cardErr.message}` }, { status: 500 });
      }
      if (!card || card.duplicate_count < 1) {
        await supabaseServer.from("trade_offers").update({ status: "cancelled" }).eq("id", tradeId);
        return NextResponse.json({ error: `Sender no longer owns: ${item.player_name}` }, { status: 400 });
      }
    }

    // Validate receiver still owns every requested card
    for (const item of requestItems) {
      if (!item.card_id) {
        await supabaseServer.from("trade_offers").update({ status: "cancelled" }).eq("id", tradeId);
        return NextResponse.json({ error: `You no longer own: ${item.player_name}` }, { status: 400 });
      }
      const { data: card, error: cardErr } = await supabaseServer
        .from("user_cards")
        .select("id, duplicate_count")
        .eq("id", item.card_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cardErr) {
        console.error("[accept] receiver card lookup error:", cardErr.message);
        return NextResponse.json({ error: `DB error checking card: ${cardErr.message}` }, { status: 500 });
      }
      if (!card || card.duplicate_count < 1) {
        await supabaseServer.from("trade_offers").update({ status: "cancelled" }).eq("id", tradeId);
        return NextResponse.json({ error: `You no longer own: ${item.player_name}` }, { status: 400 });
      }
    }

    // Transfer offered cards: sender → receiver
    for (const item of offerItems) {
      const result = await transferCard(item.card_id, trade.sender_id, user.id);
      if (!result.ok) {
        console.error("[trades accept] offer transfer failed:", result.error);
        return NextResponse.json({ error: result.error ?? "Card transfer failed" }, { status: 500 });
      }
    }

    // Transfer requested cards: receiver → sender
    for (const item of requestItems) {
      const result = await transferCard(item.card_id, user.id, trade.sender_id);
      if (!result.ok) {
        console.error("[trades accept] request transfer failed:", result.error);
        return NextResponse.json({ error: result.error ?? "Card transfer failed" }, { status: 500 });
      }
    }

    // Mark trade accepted
    const { error: acceptErr } = await supabaseServer
      .from("trade_offers")
      .update({ status: "accepted" })
      .eq("id", tradeId);
    if (acceptErr) {
      console.error("[accept] status update failed:", acceptErr.message);
      return NextResponse.json({ error: `Failed to mark trade accepted: ${acceptErr.message}` }, { status: 500 });
    }

    // Auto-decline any other pending trades that used the same cards
    const transferredCardIds = [
      ...offerItems.map((i: any) => i.card_id),
      ...requestItems.map((i: any) => i.card_id),
    ].filter(Boolean);

    if (transferredCardIds.length > 0) {
      // Find pending trades (excluding this one) that reference any of those card IDs
      const { data: conflictItems } = await supabaseServer
        .from("trade_offer_items")
        .select("trade_offer_id")
        .in("card_id", transferredCardIds);

      if (conflictItems && conflictItems.length > 0) {
        const conflictIds = [...new Set(
          conflictItems.map((i: any) => i.trade_offer_id).filter((id: string) => id !== tradeId)
        )];

        if (conflictIds.length > 0) {
          // Only decline ones that are still pending
          const { data: toDecline } = await supabaseServer
            .from("trade_offers")
            .select("id, sender_id, receiver_id")
            .in("id", conflictIds)
            .eq("status", "pending");

          if (toDecline && toDecline.length > 0) {
            await supabaseServer
              .from("trade_offers")
              .update({ status: "declined" })
              .in("id", toDecline.map((t: any) => t.id));

            // Notify each sender their trade was auto-declined
            for (const t of toDecline) {
              await insertNotification(admin, t.sender_id, "trade_declined", user.id, { trade_id: t.id }).catch(() => {});
            }
          }
        }
      }
    }

    // Notify sender
    await insertNotification(admin, trade.sender_id, "trade_accepted", user.id, { trade_id: tradeId });

    // Sync pass XP for both users (non-fatal)
    await Promise.allSettled([
      syncPassXpFromCards(trade.sender_id),
      syncPassXpFromCards(trade.receiver_id),
    ]);

    return NextResponse.json({ ok: true });
  }

  // ── DECLINE ───────────────────────────────────────────────────────────────
  if (action === "decline") {
    if (trade.receiver_id !== user.id)
      return NextResponse.json({ error: "Only the receiver can decline" }, { status: 403 });

    const { error } = await supabaseServer
      .from("trade_offers")
      .update({ status: "declined" })
      .eq("id", tradeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertNotification(admin, trade.sender_id, "trade_declined", user.id, { trade_id: tradeId });

    return NextResponse.json({ ok: true });
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (trade.sender_id !== user.id)
      return NextResponse.json({ error: "Only the sender can cancel" }, { status: 403 });

    const { error } = await supabaseServer
      .from("trade_offers")
      .update({ status: "cancelled" })
      .eq("id", tradeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }
}
