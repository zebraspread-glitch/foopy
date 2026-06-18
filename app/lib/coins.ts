// Server-only — import ONLY from API routes.
// Mirrors app/lib/aura.ts: a deduped coin faucet backed by the
// award_coins_event SECURITY DEFINER RPC (see supabase/coin-earning.sql).
import { supabaseServer } from "./supabase-server";

const MILESTONE_1K = 1000;
const MILESTONE_10K = 10000;
const COINS_PER_1K = 50;
const COINS_PER_10K_BONUS = 200;

/**
 * Award coins to a user via award_coins_event. The RPC inserts a
 * coin_events row + increments profiles.coins atomically, deduped on
 * (user, event_type, related_id). Returns whether coins were newly
 * awarded (false = duplicate or non-positive amount).
 */
export async function awardCoins(
  userId: string,
  eventType: string,
  relatedId: string,
  amount: number
): Promise<{ awarded: boolean; amount: number }> {
  if (!amount || amount <= 0) return { awarded: false, amount: 0 };

  const { data, error } = await supabaseServer.rpc("award_coins_event", {
    p_user_id:    userId,
    p_event_type: eventType,
    p_related_id: relatedId,
    p_amount:     amount,
  });

  if (error) {
    console.error("[awardCoins]", error.code, error.message);
    return { awarded: false, amount: 0 };
  }

  const awarded = data === true;
  return { awarded, amount: awarded ? amount : 0 };
}

/**
 * Record a coin movement in the ledger WITHOUT changing the balance.
 * Use for spends (negative amount) and for gains already applied through
 * another path (e.g. pass rewards), so the coins-history page can show
 * both sides. `relatedId` must be unique per movement — callers append a
 * timestamp. Failures are non-fatal: a missing ledger row must never break
 * a purchase.
 */
export async function logCoinEvent(
  userId: string,
  eventType: string,
  relatedId: string,
  amount: number
): Promise<void> {
  if (!amount) return;
  const { error } = await supabaseServer
    .from("coin_events")
    .insert({ user_id: userId, event_type: eventType, related_id: relatedId, amount });
  if (error && error.code !== "23505") {
    console.error("[logCoinEvent]", error.code, error.message);
  }
}

/**
 * Credit coin rewards for aura milestones the user has newly crossed.
 * Each 1,000 aura → COINS_PER_1K; each 10,000 → an extra COINS_PER_10K_BONUS.
 * Only counts aura earned since `coin_milestone_aura` (seeded to each
 * user's balance at migration time, so it's going-forward only).
 *
 * Safe to call after every aura award: each milestone is deduped in
 * coin_events by its index, and the baseline advances monotonically.
 */
export async function creditAuraMilestones(userId: string): Promise<void> {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("aura, coin_milestone_aura")
    .eq("id", userId)
    .single();

  if (error || !data) {
    if (error) console.error("[creditAuraMilestones]", error.message);
    return;
  }

  const aura = Number((data as any).aura ?? 0);
  const baseline = Number((data as any).coin_milestone_aura ?? 0);
  if (aura <= baseline) return;

  // 1k milestones crossed: indexes (baseline/1k, aura/1k].
  const from1k = Math.floor(baseline / MILESTONE_1K);
  const to1k = Math.floor(aura / MILESTONE_1K);
  for (let m = from1k + 1; m <= to1k; m++) {
    await awardCoins(userId, "aura_milestone_1k", String(m), COINS_PER_1K);
  }

  // 10k bonus milestones crossed.
  const from10k = Math.floor(baseline / MILESTONE_10K);
  const to10k = Math.floor(aura / MILESTONE_10K);
  for (let m = from10k + 1; m <= to10k; m++) {
    await awardCoins(userId, "aura_milestone_10k", String(m), COINS_PER_10K_BONUS);
  }

  // Advance the baseline so the same milestones never recompute.
  if (to1k > from1k || to10k > from10k) {
    await supabaseServer
      .from("profiles")
      .update({ coin_milestone_aura: aura })
      .eq("id", userId);
  }
}
