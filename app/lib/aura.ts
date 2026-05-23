// Server-only — import ONLY from API routes
import { supabaseServer } from "./supabase-server";

const AURA_AMOUNTS: Record<string, number> = {
  comment_post:    5,
  like_given:      1,
  like_received:   2,
  winner_pick:     3,
  daily_login:     10,
  live_game_view:  10,
  poll_correct:    20, // default; overridden per-poll based on option count / rarity
};

/**
 * Insert an aura_events row for the user and increment profiles.aura via RPC.
 * Returns { awarded: true } if the row was new, { awarded: false } if already exists (dedup).
 */
export async function awardAura(
  userId: string,
  eventType: string,
  relatedId: string,
  amountOverride?: number
): Promise<{ awarded: boolean; amount: number }> {
  const amount = amountOverride ?? AURA_AMOUNTS[eventType];
  if (!amount) return { awarded: false, amount: 0 };

  const { error } = await supabaseServer.from("aura_events").insert({
    user_id: userId,
    event_type: eventType,
    related_id: relatedId,
    amount,
  });

  if (error) {
    if (error.code === "23505") return { awarded: false, amount: 0 }; // already awarded (dedup)
    console.error("[awardAura]", error.message);
    return { awarded: false, amount: 0 };
  }

  // Increment profiles.aura via RPC, with read-then-write fallback
  const { error: rpcError } = await supabaseServer.rpc("increment_aura", {
    user_id_param: userId,
    amount_param: amount,
  });
  if (rpcError) {
    console.error("[awardAura increment_aura rpc]", rpcError.message, "— trying direct update");
    const { data: profileData, error: readErr } = await supabaseServer
      .from("profiles")
      .select("aura")
      .eq("id", userId)
      .single();
    if (readErr) {
      console.error("[awardAura read profile]", readErr.message);
    } else {
      const currentAura = Number((profileData as any)?.aura ?? 0);
      const { error: writeErr } = await supabaseServer
        .from("profiles")
        .update({ aura: currentAura + amount })
        .eq("id", userId);
      if (writeErr) console.error("[awardAura write profile]", writeErr.message);
    }
  }

  return { awarded: true, amount };
}
