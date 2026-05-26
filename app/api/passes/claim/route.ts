import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { calcPendingRewards } from "@/app/api/passes/route";
import type { TeamPass, PlayerPass, PassReward } from "@/app/lib/passes";
import { incrementProfileCurrency } from "@/app/lib/passRewardCredits";
import { awardAura } from "@/app/lib/aura";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

export const dynamic = "force-dynamic";

// POST /api/passes/claim — claim all pending rewards
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await syncPassXpFromCards(user.id);
  } catch (err) {
    console.error("[passes/claim sync card xp]", err instanceof Error ? err.message : err);
  }

  // Load current passes
  const [{ data: teamPassRows }, { data: playerPassRows }, { data: rewardRows }] =
    await Promise.all([
      supabaseServer
        .from("user_team_passes")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabaseServer
        .from("user_player_passes")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true),
      supabaseServer
        .from("pass_rewards")
        .select("*")
        .eq("user_id", user.id)
        .gte("claimed_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const teamPasses    = (teamPassRows   as TeamPass[]) ?? [];
  const playerPasses  = (playerPassRows as PlayerPass[]) ?? [];
  const claimedSoFar  = (rewardRows     as PassReward[]) ?? [];

  // Calculate what's still pending
  const pending = await calcPendingRewards(user.id, teamPasses, playerPasses, claimedSoFar);

  if (pending.length === 0) {
    return NextResponse.json({ claimed: 0, totalAura: 0, totalCoins: 0, rewards: [] });
  }

  let totalAura  = 0;
  let totalCoins = 0;
  const claimed: typeof pending = [];

  for (const reward of pending) {
    // Attempt insert — UNIQUE constraint silently rejects duplicates
    const { error: insErr } = await supabaseServer
      .from("pass_rewards")
      .insert({
        user_id:     user.id,
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
    const relatedId = `pass_reward:${reward.pass_type}:${reward.pass_id}:${reward.match_id}`;
    await awardAura(user.id, "pass_reward", relatedId, reward.aura_reward);
  }

  // Award coins directly
  if (totalCoins > 0) {
    try {
      await incrementProfileCurrency(user.id, "coins", totalCoins, "increment_coins");
    } catch (err) {
      console.error("[passes/claim coins]", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    claimed:    claimed.length,
    totalAura,
    totalCoins,
    rewards:    claimed,
  });
}
