import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import {
  teamPassReward,
  playerPassReward,
  teamsMatch,
  type PendingReward,
  type TeamPass,
  type PlayerPass,
  type PassReward,
} from "@/app/lib/passes";
import { foopyRatingFromRaw } from "@/app/lib/foopyRating";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import matchStatsRaw from "@/app/data/game-stats.json";
import playersRaw from "@/app/data/players.json";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";
import { syncPassRewardBalances } from "@/app/lib/passRewardCredits";

export const dynamic = "force-dynamic";

// ── Squiggle game shape ──────────────────────────────────────────────────────
interface SquiggleGame {
  id: number;
  round: number;
  hteam: string;
  ateam: string;
  hscore: number | null;
  ascore: number | null;
  complete: number | null;
  is_final: number | null;
  date: string;
  year: number;
}

function isGameFinal(g: SquiggleGame) {
  return (Number(g.complete ?? 0) >= 100) || g.is_final === 1;
}

// ── Resolve API-Sports fixture ID from Squiggle game ID ──────────────────────
function getFixtureId(squiggleId: number): string | null {
  return (API_SPORTS_MATCH_IDS as Record<string, string>)[String(squiggleId)] ?? null;
}

// ── Find player API-Sports ID from our players.json slug ────────────────────
function getPlayerApiSportsId(playerSlug: string): number | null {
  const player = (playersRaw as any[]).find(
    (p) => String(p.id ?? "") === playerSlug
  );
  return player?.apiSportsId ?? null;
}

// ── Look up a player's raw stats for a fixture in game-stats.json ────────────
function getPlayerStatsForFixture(
  fixtureId: string,
  apiSportsPlayerId: number
): ReturnType<typeof foopyRatingFromRaw> | null {
  const gameData = (matchStatsRaw as Record<string, any>)[fixtureId];
  if (!gameData) return null;

  for (const team of (gameData.teams ?? []) as any[]) {
    for (const p of (team.players ?? []) as any[]) {
      if (Number(p?.player?.id) === apiSportsPlayerId) {
        return foopyRatingFromRaw(p);
      }
    }
  }
  return null;
}

// ── Calculate all pending rewards for a user ─────────────────────────────────
export async function calcPendingRewards(
  userId: string,
  teamPass: TeamPass | null,
  playerPasses: PlayerPass[],
  claimedRewards: PassReward[]
): Promise<PendingReward[]> {
  // Fetch recent final games (current year)
  let games: SquiggleGame[] = [];
  try {
    const year = new Date().getFullYear();
    const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
      headers: { "User-Agent": "Foopy AFL App (foopy.app)" },
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      games = (data.games ?? []) as SquiggleGame[];
    }
  } catch {}

  const finalGames = games.filter(isGameFinal);

  // Build a set of already-claimed keys for O(1) lookup
  const claimedKeys = new Set(
    claimedRewards.map((r) => `${r.pass_type}:${r.pass_id}:${r.match_id}`)
  );

  const pending: PendingReward[] = [];

  // ── Team pass ──────────────────────────────────────────────────────────────
  if (teamPass) {
    for (const game of finalGames) {
      const key = `team:${teamPass.id}:${String(game.id)}`;
      if (claimedKeys.has(key)) continue;
      if (new Date(game.date) < new Date(teamPass.created_at)) continue;

      const homeMatch = teamsMatch(game.hteam, teamPass.team_name);
      const awayMatch = teamsMatch(game.ateam, teamPass.team_name);
      if (!homeMatch && !awayMatch) continue;

      const home = Number(game.hscore ?? 0);
      const away = Number(game.ascore ?? 0);
      if (home === away) continue; // draw — no reward

      const teamWon = homeMatch ? home > away : away > home;
      if (!teamWon) continue;

      const margin = Math.abs(home - away);
      const reward = teamPassReward(margin, teamPass.xp ?? 0);
      if (!reward) continue;

      const opponent = homeMatch ? game.ateam : game.hteam;
      pending.push({
        pass_type:   "team",
        pass_id:     teamPass.id,
        match_id:    String(game.id),
        team_name:   teamPass.team_name,
        opponent,
        margin,
        aura_reward: reward.aura,
        coin_reward: reward.coins,
        match_date:  game.date,
        description: `${teamPass.team_name} won vs ${opponent} by ${margin} pts`,
      });
    }
  }

  // ── Player passes ──────────────────────────────────────────────────────────
  for (const pass of playerPasses) {
    const apiId = getPlayerApiSportsId(pass.player_id);
    if (!apiId) continue;

    for (const game of finalGames) {
      const key = `player:${pass.id}:${String(game.id)}`;
      if (claimedKeys.has(key)) continue;
      if (new Date(game.date) < new Date(pass.created_at)) continue;

      const fixtureId = getFixtureId(game.id);
      if (!fixtureId) continue;

      const rating = getPlayerStatsForFixture(fixtureId, apiId);
      if (rating === null || rating <= 0) continue;

      const reward = playerPassReward(rating, pass.xp ?? 0);
      if (!reward) continue;

      pending.push({
        pass_type:   "player",
        pass_id:     pass.id,
        match_id:    String(game.id),
        player_name: pass.player_name,
        rating,
        aura_reward: reward.aura,
        coin_reward: reward.coins,
        match_date:  game.date,
        description: `${pass.player_name} rated ${rating} — ${game.hteam} vs ${game.ateam}`,
      });
    }
  }

  // Sort newest first
  return pending.sort(
    (a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime()
  );
}

// ── GET /api/passes ──────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await syncPassXpFromCards(user.id);
  } catch (err) {
    console.error("[passes GET sync card xp]", err instanceof Error ? err.message : err);
  }

  // Fetch team pass
  const { data: teamPassRows } = await supabaseServer
    .from("user_team_passes")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  // Fetch player passes
  const { data: playerPassRows } = await supabaseServer
    .from("user_player_passes")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  // Fetch claimed rewards (last 60 days for comparison + display)
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rewardRows } = await supabaseServer
    .from("pass_rewards")
    .select("*")
    .eq("user_id", user.id)
    .gte("claimed_at", since)
    .order("claimed_at", { ascending: false });

  const teamPass     = (teamPassRows   as TeamPass | null) ?? null;
  const playerPasses = (playerPassRows as PlayerPass[]) ?? [];
  const claimedRewards = (rewardRows as PassReward[]) ?? [];

  // Repair historical pass rewards that were recorded but not applied to the
  // profile balance because an older claim path depended only on RPC success.
  try {
    await syncPassRewardBalances(user.id, true);
  } catch (err) {
    console.error("[passes GET sync balances]", err instanceof Error ? err.message : err);
  }

  // Check if user has ever bought a team pass slot (for "buy vs switch" UI)
  const { count: teamPassEverCount } = await supabaseServer
    .from("user_team_passes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Fetch coin balance
  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  const pending = await calcPendingRewards(
    user.id,
    teamPass,
    playerPasses,
    claimedRewards
  );

  return NextResponse.json({
    teamPass,
    playerPasses,
    pendingRewards:    pending,
    recentRewards:     claimedRewards.slice(0, 20),
    playerPassCount:   playerPasses.length,
    hasBoughtTeamPass: (teamPassEverCount ?? 0) > 0,
    coins:             profile?.coins ?? 0,
  });
}
