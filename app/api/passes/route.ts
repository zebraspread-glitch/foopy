import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import {
  teamPassReward,
  playerPassReward,
  teamsMatch,
  dedupePlayerPasses,
  normalizePassPlayerIdentity,
  type PendingReward,
  type TeamPass,
  type PlayerPass,
  type PassReward,
} from "@/app/lib/passes";
import { foopyRatingFromRaw } from "@/app/lib/foopyRating";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import matchStatsRaw from "@/app/data/game-stats.json";
import playersRaw from "@/app/data/players.json";

// ── Supabase match_cache lookup ───────────────────────────────────────────────
// Batch-fetch cached player stats for multiple fixture IDs in one query.
// The payload stored by withCache is the full API-Sports response object.
async function loadCachedPlayerStats(fixtureIds: string[]): Promise<Map<string, any>> {
  if (fixtureIds.length === 0) return new Map();
  const { data } = await supabaseServer
    .from("match_cache")
    .select("game_id, payload")
    .in("game_id", fixtureIds)
    .eq("data_type", "player_stats");
  return new Map((data ?? []).map((row: any) => [String(row.game_id), row.payload]));
}

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
function getPlayerApiSportsId(playerSlug: string, playerName?: string | null): number | null {
  const players = playersRaw as any[];
  const player = players.find(
    (p) => String(p.id ?? "") === playerSlug
  );
  if (player?.apiSportsId) return player.apiSportsId;

  const nameKey = normalizePassPlayerIdentity(playerName);
  if (!nameKey) return null;

  const byName = players.find((p) => (
    normalizePassPlayerIdentity(String(p.name ?? p.player ?? "")) === nameKey
  ));
  return byName?.apiSportsId ?? null;
}

// ── Look up a player's raw stats for a fixture ───────────────────────────────
// Checks static game-stats.json first, then falls back to match_cache from Supabase.
function getPlayerStatsForFixture(
  fixtureId: string,
  apiSportsPlayerId: number,
  cacheMap?: Map<string, any>
): ReturnType<typeof foopyRatingFromRaw> | null {
  // Helper: scan a teams array for this player
  function findInTeams(teams: any[]): ReturnType<typeof foopyRatingFromRaw> | null {
    for (const team of teams) {
      for (const p of (team.players ?? []) as any[]) {
        if (Number(p?.player?.id) === apiSportsPlayerId) {
          return foopyRatingFromRaw(p);
        }
      }
    }
    return null;
  }

  // 1. Static JSON (bundled at build time — older games)
  const staticData = (matchStatsRaw as Record<string, any>)[fixtureId];
  if (staticData) {
    const result = findInTeams(staticData.teams ?? []);
    if (result !== null) return result;
  }

  // 2. match_cache (auto-populated by cron / match page visits)
  if (cacheMap) {
    const cached = cacheMap.get(fixtureId);
    if (cached) {
      // Payload may be the full API response {response:[{teams:[...]}]} or unwrapped
      const teams: any[] =
        cached?.response?.[0]?.teams ??
        cached?.teams ??
        [];
      const result = findInTeams(teams);
      if (result !== null) return result;
    }
  }

  return null;
}

// ── Calculate all pending rewards for a user ─────────────────────────────────
export async function calcPendingRewards(
  userId: string,
  teamPasses: TeamPass[],
  playerPasses: PlayerPass[],
  claimedRewards: PassReward[],
  prefetchedGames?: SquiggleGame[]
): Promise<PendingReward[]> {
  let games: SquiggleGame[] = prefetchedGames ?? [];

  if (!prefetchedGames) {
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
  }

  const finalGames = games.filter(isGameFinal);

  // Build a set of already-claimed keys for O(1) lookup
  const claimedKeys = new Set(
    claimedRewards.map((r) => `${r.pass_type}:${r.pass_id}:${r.match_id}`)
  );

  // ── Pre-load match_cache for all fixture IDs needed by player passes ───────
  // One batch query instead of N individual lookups — avoids N×latency hits.
  const neededFixtureIds = playerPasses.length > 0
    ? [...new Set(
        finalGames
          .map((g) => getFixtureId(g.id))
          .filter((id): id is string => id !== null)
      )]
    : [];
  const cacheMap = await loadCachedPlayerStats(neededFixtureIds);

  const pending: PendingReward[] = [];

  // ── Team passes (up to MAX_TEAM_PASSES active simultaneously) ─────────────
  for (const teamPass of teamPasses) {
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
    const apiId = getPlayerApiSportsId(pass.player_id, pass.player_name);
    if (!apiId) continue;

    for (const game of finalGames) {
      const key = `player:${pass.id}:${String(game.id)}`;
      if (claimedKeys.has(key)) continue;
      if (new Date(game.date) < new Date(pass.created_at)) continue;

      const fixtureId = getFixtureId(game.id);
      if (!fixtureId) continue;

      // Uses static JSON first, then match_cache fallback
      const rating = getPlayerStatsForFixture(fixtureId, apiId, cacheMap);
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

  // Start Squiggle fetch immediately so it overlaps with DB queries
  const year = new Date().getFullYear();
  const squigglePromise = fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
    headers: { "User-Agent": "Foopy AFL App (foopy.app)" },
    next: { revalidate: 60 },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  // Fetch all DB data in parallel
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { data: teamPassRows },
    { data: playerPassRows },
    { data: rewardRows },
    { count: teamPassEverCount },
    { data: profile },
    squiggleData,
  ] = await Promise.all([
    supabaseServer.from("user_team_passes").select("*").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: true }),
    supabaseServer.from("user_player_passes").select("*").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: false }),
    supabaseServer.from("pass_rewards").select("*").eq("user_id", user.id).gte("claimed_at", since).order("claimed_at", { ascending: false }).limit(100),
    supabaseServer.from("user_team_passes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabaseServer.from("profiles").select("coins").eq("id", user.id).single(),
    squigglePromise,
  ]);

  const teamPasses     = (teamPassRows   as TeamPass[]) ?? [];
  const playerPasses   = dedupePlayerPasses((playerPassRows as PlayerPass[]) ?? []);
  const claimedRewards = (rewardRows     as PassReward[]) ?? [];

  const pending = await calcPendingRewards(
    user.id,
    teamPasses,
    playerPasses,
    claimedRewards,
    (squiggleData?.games ?? []) as SquiggleGame[]
  );

  return NextResponse.json({
    teamPasses,
    playerPasses,
    pendingRewards:    pending,
    recentRewards:     claimedRewards.slice(0, 20),
    playerPassCount:   playerPasses.length,
    hasBoughtTeamPass: (teamPassEverCount ?? 0) > 0,
    coins:             profile?.coins ?? 0,
  });
}
