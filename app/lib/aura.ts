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
 * Insert an aura_events row for the user.
 * The DB trigger `on_aura_event_insert` automatically increments profiles.aura.
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

  // profiles.aura is updated automatically by the on_aura_event_insert DB trigger
  return { awarded: true, amount };
}
