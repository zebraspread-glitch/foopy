// Server-only — import ONLY from API routes
import { createClient } from "@supabase/supabase-js";
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
 * Insert an aura_events row and increment profiles.aura.
 * Pass userJwt when available so the insert uses the user's own session
 * (satisfies RLS INSERT policy). Falls back to service role for the profile update.
 */
export async function awardAura(
  userId: string,
  eventType: string,
  relatedId: string,
  amountOverride?: number,
  userJwt?: string
): Promise<{ awarded: boolean; amount: number; reason?: string }> {
  const amount = amountOverride ?? AURA_AMOUNTS[eventType];
  if (!amount) return { awarded: false, amount: 0, reason: "no_amount" };

  // Use the user's own JWT for the insert so RLS is satisfied even if
  // SUPABASE_SERVICE_ROLE_KEY is misconfigured in the environment.
  const insertClient = userJwt
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${userJwt}` } } }
      )
    : supabaseServer;

  const { error } = await insertClient.from("aura_events").insert({
    user_id: userId,
    event_type: eventType,
    related_id: relatedId,
    amount,
  });

  if (error) {
    if (error.code === "23505") return { awarded: false, amount: 0, reason: "dedup" };
    console.error("[awardAura]", error.code, error.message);
    return { awarded: false, amount: 0, reason: error.message };
  }

  // Increment profiles.aura via RPC (SECURITY DEFINER — bypasses RLS regardless of key)
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

  return { awarded: true, amount, reason: "ok" };
}
