import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { calcPendingRewards } from "@/app/api/passes/route";
import { dedupePlayerPasses } from "@/app/lib/passes";
import type { TeamPass, PlayerPass, PassReward, PendingReward } from "@/app/lib/passes";
import { incrementProfileCurrency } from "@/app/lib/passRewardCredits";
import { awardAura } from "@/app/lib/aura";
import { logCoinEvent } from "@/app/lib/coins";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

export const dynamic = "force-dynamic";

type ClaimResult = { claimed: number; totalAura: number; totalCoins: number; rewards: PendingReward[] };

/**
 * Claims all pending pass rewards for a single user. Safe to call repeatedly
 * (and from a cron) — the pass_rewards UNIQUE constraint dedupes, so already
 * claimed rewards are silently skipped. Used by both the user-triggered
 * POST handler below and the automatic /api/cron/claim-pass-rewards job.
 */
export async function claimPassRewardsForUser(userId: string): Promise<ClaimResult> {
  try {
    await syncPassXpFromCards(userId);
  } catch (err) {
    console.error("[passes/claim sync card xp]", err instanceof Error ? err.message : err);
  }

  // Load current passes
  const [{ data: teamPassRows }, { data: playerPassRows }, { data: rewardRows }] =
    await Promise.all([
      supabaseServer
        .from("user_team_passes")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabaseServer
        .from("user_player_passes")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true),
      supabaseServer
        .from("pass_rewards")
        .select("*")
        .eq("user_id", userId)
        .gte("claimed_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const teamPasses    = (teamPassRows   as TeamPass[]) ?? [];
  const playerPasses  = dedupePlayerPasses((playerPassRows as PlayerPass[]) ?? []);
  const claimedSoFar  = (rewardRows     as PassReward[]) ?? [];

  // Calculate what's still pending
  const pending = await calcPendingRewards(userId, teamPasses, playerPasses, claimedSoFar);

  if (pending.length === 0) {
    return { claimed: 0, totalAura: 0, totalCoins: 0, rewards: [] };
  }

  let totalAura  = 0;
  let totalCoins = 0;
  const claimed: PendingReward[] = [];

  for (const reward of pending) {
    // Attempt insert — UNIQUE constraint silently rejects duplicates
    const { error: insErr } = await supabaseServer
      .from("pass_rewards")
      .insert({
        user_id:     userId,
        pass_type:   reward.pass_type,
        pass_id:     reward.pass_id,
        match_id:    reward.match_id,
        aura_reward: reward.aura_reward,
        coin_reward: reward.coin_reward,
      });

    if (insErr) {
      if (insErr.code === "23505") continue; // already claimed — skip silently
      console.error("[passes/claim insert]", insErr.message);
      continue;
    }

    totalAura  += reward.aura_reward;
    totalCoins += reward.coin_reward;
    claimed.push(reward);
  }

  // Award aura: awardAura inserts into aura_events; the DB trigger updates profiles.aura.
  // Dedup via unique constraint means repeated calls are always safe.
  for (const reward of claimed) {
    const passName = (reward as any).player_name || (reward as any).team_name || reward.pass_id;
    const relatedId = `pass_reward:${reward.pass_type}:${passName}:${reward.match_id}`;
    await awardAura(userId, "pass_reward", relatedId, reward.aura_reward);
    // Ledger entry so the coin gain shows in coins history (balance credited below).
    if (reward.coin_reward > 0) {
      await logCoinEvent(userId, "pass_reward", relatedId, reward.coin_reward);
    }
  }

  // Award coins directly
  if (totalCoins > 0) {
    try {
      await incrementProfileCurrency(userId, "coins", totalCoins, "increment_coins");
    } catch (err) {
      console.error("[passes/claim coins]", err instanceof Error ? err.message : err);
    }
  }

  return { claimed: claimed.length, totalAura, totalCoins, rewards: claimed };
}

// POST /api/passes/claim — claim all pending rewards for the signed-in user
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await claimPassRewardsForUser(user.id);
  return NextResponse.json(result);
}
