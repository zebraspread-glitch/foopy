import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { calcPendingRewards } from "@/app/api/passes/route";
import type { TeamPass, PlayerPass, PassReward } from "@/app/lib/passes";
import { TEAM_PASS_XP_PER_WIN, PLAYER_PASS_XP_PER_GAME } from "@/app/lib/passes";

export const dynamic = "force-dynamic";

// POST /api/passes/claim — claim all pending rewards
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load current passes
  const [{ data: teamPassRow }, { data: playerPassRows }, { data: rewardRows }] =
    await Promise.all([
      supabaseServer
        .from("user_team_passes")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle(),
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

  const teamPass      = (teamPassRow   as TeamPass   | null) ?? null;
  const playerPasses  = (playerPassRows as PlayerPass[]) ?? [];
  const claimedSoFar  = (rewardRows    as PassReward[]) ?? [];

  // Calculate what's still pending
  const pending = await calcPendingRewards(user.id, teamPass, playerPasses, claimedSoFar);

  if (pending.length === 0) {
    return NextResponse.json({ claimed: 0, totalAura: 0, totalCoins: 0, rewards: [] });
  }

  let totalAura  = 0;
  let totalCoins = 0;
  let teamXpToAdd = 0;
  // player_id → xp accumulated this claim
  const playerXpMap: Record<string, number> = {};
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

    // Accumulate XP
    if (reward.pass_type === "team") {
      teamXpToAdd += TEAM_PASS_XP_PER_WIN;
    } else if (reward.pass_type === "player" && reward.pass_id) {
      playerXpMap[reward.pass_id] = (playerXpMap[reward.pass_id] ?? 0) + PLAYER_PASS_XP_PER_GAME;
    }
  }

  // Award XP to team pass
  if (teamXpToAdd > 0 && teamPass) {
    const { error: teamXpErr } = await supabaseServer.rpc("add_team_pass_xp", {
      user_id_param:   user.id,
      team_name_param: teamPass.team_name,
      xp_param:        teamXpToAdd,
    });
    if (teamXpErr) console.error("[passes/claim team xp rpc]", teamXpErr.message);
  }

  // Award XP to each player pass (keyed by pass_id, so look up player_id)
  for (const [passId, xp] of Object.entries(playerXpMap)) {
    const pass = playerPasses.find((p) => p.id === passId);
    if (!pass) continue;
    const { error: playerXpErr } = await supabaseServer.rpc("add_player_pass_xp", {
      user_id_param:   user.id,
      player_id_param: pass.player_id,
      xp_param:        xp,
    });
    if (playerXpErr) console.error("[passes/claim player xp rpc]", playerXpErr.message);
  }

  // Apply rewards to the profile in a single update per currency
  if (totalAura > 0) {
    const { error: auraErr } = await supabaseServer.rpc("increment_aura", {
      user_id_param: user.id,
      amount_param:  totalAura,
    });
    if (auraErr) console.error("[passes/claim aura rpc]", auraErr.message);
  }

  if (totalCoins > 0) {
    const { error: coinErr } = await supabaseServer.rpc("increment_coins", {
      user_id_param: user.id,
      amount_param:  totalCoins,
    });
    if (coinErr) console.error("[passes/claim coins rpc]", coinErr.message);
  }

  return NextResponse.json({
    claimed:    claimed.length,
    totalAura,
    totalCoins,
    rewards:    claimed,
  });
}
