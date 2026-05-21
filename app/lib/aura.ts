// Server-only — import ONLY from API routes
import { supabaseServer } from "./supabase-server";

const AURA_AMOUNTS: Record<string, number> = {
  comment_post:    5,
  like_given:      1,
  like_received:   2,
  winner_pick:     3,
  daily_login:     10,
  live_game_view:  10,
};

export async function awardAura(
  userId: string,
  eventType: string,
  relatedId: string
): Promise<{ awarded: boolean; amount: number }> {
  const amount = AURA_AMOUNTS[eventType];
  if (!amount) return { awarded: false, amount: 0 };

  const { error } = await supabaseServer.from("aura_events").insert({
    user_id: userId,
    event_type: eventType,
    related_id: relatedId,
    amount,
  });

  if (error) {
    if (error.code === "23505") return { awarded: false, amount: 0 }; // already awarded
    console.error("[awardAura]", error.message);
    return { awarded: false, amount: 0 };
  }

  const { error: rpcError } = await supabaseServer.rpc("increment_aura", {
    user_id_param: userId,
    amount_param: amount,
  });

  if (rpcError) console.error("[awardAura rpc]", rpcError.message);

  return { awarded: true, amount };
}
