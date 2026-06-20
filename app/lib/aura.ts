// Server-only — import ONLY from API routes
import { supabaseServer } from "./supabase-server";
import { creditAuraMilestones } from "./coins";

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
 * Award aura to a user via the award_aura_event SECURITY DEFINER RPC.
 * The RPC handles insert + profile increment atomically.
 *
 * SECURITY: always called with the service-role key — never the user's JWT.
 * The aura amount is derived server-side here (AURA_AMOUNTS / validated
 * overrides), so EXECUTE on award_aura_event must be revoked from the
 * `authenticated`/`public` roles (see supabase/lock-aura-rpc.sql). Otherwise a
 * client could call the RPC directly with an arbitrary p_amount and mint aura.
 * Returns { awarded: true } if new, { awarded: false } if already awarded (dedup).
 */
export async function awardAura(
  userId: string,
  eventType: string,
  relatedId: string,
  amountOverride?: number
): Promise<{ awarded: boolean; amount: number; reason?: string }> {
  const amount = amountOverride ?? AURA_AMOUNTS[eventType];
  if (!amount) return { awarded: false, amount: 0, reason: "no_amount" };

  const { data, error } = await supabaseServer.rpc("award_aura_event", {
    p_user_id:    userId,
    p_event_type: eventType,
    p_related_id: relatedId,
    p_amount:     amount,
  });

  if (error) {
    console.error("[awardAura]", error.code, error.message);
    return { awarded: false, amount: 0, reason: error.message };
  }

  // data is true if inserted, false if deduped
  const awarded = data === true;

  // Crossing a 1k/10k aura threshold pays out coins. Runs on the user
  // whose aura just changed; non-fatal so a coin hiccup never blocks aura.
  if (awarded) {
    try {
      await creditAuraMilestones(userId);
    } catch (e) {
      console.error("[awardAura] milestone credit failed", e instanceof Error ? e.message : e);
    }
  }

  return { awarded, amount: awarded ? amount : 0, reason: awarded ? "ok" : "dedup" };
}
