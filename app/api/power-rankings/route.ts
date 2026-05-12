import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type PlayerRank = {
  id: string;
  name: string;
  team: string;
  totalFoopy: number;
  avgFoopy: number;
  games: number;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function foopyRating(p: {
  goals: number; goalAssists: number; behinds: number;
  kicks: number; handballs: number; marks: number; tackles: number;
  hitouts: number; disposals: number; clearances: number;
  freesFor: number; freesAgainst: number;
}): number {
  let score =
    p.goals * 5.5 + p.goalAssists * 1.5 + p.behinds * 1.2 +
    p.kicks * 0.75 + p.handballs * 0.55 + p.marks * 1.0 +
    p.tackles * 1.8 + p.hitouts * 0.35 + p.clearances * 0.5 +
    p.freesFor * 0.3 - p.freesAgainst * 0.4;

  if (p.goals >= 3)        score += 3;
  if (p.goals >= 5)        score += 5;
  if (p.goals >= 7)        score += 10;
  if (p.goals >= 10)       score += 18;
  if (p.goalAssists >= 3)  score += 1;
  if (p.disposals >= 25)   score += 3;
  if (p.disposals >= 30)   score += 4;
  if (p.tackles >= 8)      score += 4;
  if (p.clearances >= 7)   score += 1;
  if (p.marks >= 10)       score += 3;
  if (p.hitouts >= 25)     score += 3;
  if (p.freesAgainst >= 4) score -= 1;

  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(2));
}

/* ── Season rankings: from player-season-stats.json ── */
function buildSeasonRankings(seasonStats: {
  id: string; name: string; team: string; games?: number; goals?: number; goalAssists?: number;
  behinds?: number; totalKicks?: number; totalHandballs?: number; totalMarks?: number;
  totalTackles?: number; totalHitouts?: number; totalClearances?: number;
  freesFor?: number; freesAgainst?: number; disposals?: number; kicks?: number;
  handballs?: number; marks?: number; tackles?: number; hitouts?: number;
  clearances?: number; goalAvg?: number;
}[]): PlayerRank[] {
  const result: PlayerRank[] = [];
  for (const p of seasonStats) {
    const games = num(p.games);
    if (games === 0) continue;
    const avgGoals       = num(p.goalAvg  ?? (num(p.goals) / games));
    const avgGoalAssists = num(p.goalAssists) / games;
    const avgBehinds     = num(p.behinds) / games;
    const avgKicks       = num(p.kicks    ?? (num(p.totalKicks)      / games));
    const avgHandballs   = num(p.handballs ?? (num(p.totalHandballs) / games));
    const avgMarks       = num(p.marks    ?? (num(p.totalMarks)      / games));
    const avgTackles     = num(p.tackles  ?? (num(p.totalTackles)    / games));
    const avgHitouts     = num(p.hitouts  ?? (num(p.totalHitouts)    / games));
    const avgDisposals   = num(p.disposals ?? 0);
    const avgClearances  = num(p.clearances ?? (num(p.totalClearances) / games));
    const avgFreesFor    = num(p.freesFor)    / games;
    const avgFreesAgainst = num(p.freesAgainst) / games;

    const avgFoopy = foopyRating({
      goals: avgGoals, goalAssists: avgGoalAssists, behinds: avgBehinds,
      kicks: avgKicks, handballs: avgHandballs, marks: avgMarks,
      tackles: avgTackles, hitouts: avgHitouts, disposals: avgDisposals,
      clearances: avgClearances, freesFor: avgFreesFor, freesAgainst: avgFreesAgainst,
    });
    if (avgFoopy === 0) continue;

    result.push({
      id:         p.id,
      name:       p.name,
      team:       p.team ?? "",
      avgFoopy:   Number(avgFoopy.toFixed(1)),
      totalFoopy: Number((avgFoopy * games).toFixed(1)),
      games,
    });
  }
  return result.sort((a, b) => b.totalFoopy - a.totalFoopy);
}

/* ── Period rankings: from game-stats.json with date filter ── */
function buildPeriodRankings(
  gameStats: Record<string, {
    gameId: number; date: string;
    teams: { team: { id: number }; players: {
      player: { id: number; number: number };
      goals: { total: number; assists: number };
      behinds: number; disposals: number; kicks: number; handballs: number;
      marks: number; tackles: number; hitouts: number; clearances: number;
      free_kicks: { for: number; against: number };
    }[] }[];
  }>,
  playerLookup: Map<number, { id: string; name: string; team: string }>,
  cutoffDays: number
): PlayerRank[] {
  const cutoff = new Date(Date.now() - cutoffDays * 86_400_000);
  const totals = new Map<string, { id: string; name: string; team: string; totalFoopy: number; games: number }>();

  for (const game of Object.values(gameStats)) {
    const gameDate = new Date(game.date);
    if (gameDate < cutoff) continue;

    for (const teamData of game.teams ?? []) {
      for (const ps of teamData.players ?? []) {
        const info = playerLookup.get(ps.player?.id);
        if (!info) continue;

        const gf = foopyRating({
          goals:        num(ps.goals?.total),
          goalAssists:  num(ps.goals?.assists),
          behinds:      num(ps.behinds),
          kicks:        num(ps.kicks),
          handballs:    num(ps.handballs),
          marks:        num(ps.marks),
          tackles:      num(ps.tackles),
          hitouts:      num(ps.hitouts),
          disposals:    num(ps.disposals),
          clearances:   num(ps.clearances),
          freesFor:     num(ps.free_kicks?.for),
          freesAgainst: num(ps.free_kicks?.against),
        });
        if (gf === 0) continue;

        const key = `${info.name}||${info.team}`;
        const cur = totals.get(key) ?? { id: info.id, name: info.name, team: info.team, totalFoopy: 0, games: 0 };
        cur.totalFoopy += gf;
        cur.games      += 1;
        totals.set(key, cur);
      }
    }
  }

  return [...totals.values()]
    .filter(p => p.totalFoopy > 0)
    .map(p => ({
      id:         p.id,
      name:       p.name,
      team:       p.team,
      totalFoopy: Number(p.totalFoopy.toFixed(1)),
      avgFoopy:   Number((p.totalFoopy / p.games).toFixed(1)),
      games:      p.games,
    }))
    .sort((a, b) => b.totalFoopy - a.totalFoopy);
}

export async function GET() {
  const [seasonMod, gameStatsMod, playersMod] = await Promise.all([
    import("@/app/data/player-season-stats.json"),
    import("@/app/data/game-stats.json"),
    import("@/app/data/players.json"),
  ]);

  // Build player ID → {id, name, team} lookup from players.json
  const playerLookup = new Map<number, { id: string; name: string; team: string }>();
  for (const p of playersMod.default as { id: string; name: string; team: string; apiSportsId?: number | null }[]) {
    if (p.apiSportsId) playerLookup.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team ?? "" });
  }

  const season = buildSeasonRankings(seasonMod.default as Parameters<typeof buildSeasonRankings>[0]);
  const sevenDay  = buildPeriodRankings(gameStatsMod.default as Parameters<typeof buildPeriodRankings>[0], playerLookup, 7);
  const thirtyDay = buildPeriodRankings(gameStatsMod.default as Parameters<typeof buildPeriodRankings>[0], playerLookup, 30);

  return NextResponse.json({ "7d": sevenDay, "30d": thirtyDay, season });
}
