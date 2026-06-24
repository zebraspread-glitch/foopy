/**
 * buildSeasonStatsFromGames.ts
 *
 * Regenerates app/data/player-season-stats.json by aggregating per-game data
 * from app/data/game-stats.json — the SAME source and logic as the hourly
 * sync-player-season-stats cron, so the committed static fallback matches what
 * the live endpoint serves. Run this after updateGameStatsFromApiSports.ts
 * pulls in new games.
 *
 *   tsx scripts/buildSeasonStatsFromGames.ts
 *
 * Player identity/photo/jersey/position come from players.json + the existing
 * season file (per-game data doesn't carry them), so metadata is preserved.
 */
import fs from "fs";
import path from "path";
import { foopyRating } from "../app/lib/foopyRating";

const SEASON = new Date().getFullYear().toString();
const dataDir = path.join(process.cwd(), "app", "data");

function readJson(file: string, fallback: any) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  } catch {
    return fallback;
  }
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

const sourcePlayers: any[] = readJson("players.json", []);
const staticSeason: any[] = readJson("player-season-stats.json", []);
const staticStats: Record<string, any> = readJson("game-stats.json", {});

const infoByApiId = new Map<number, { id: string; name: string; team: string }>();
for (const p of sourcePlayers) {
  if (p.apiSportsId) infoByApiId.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team });
}
const metaById = new Map<string, any>();
for (const p of staticSeason) if (p.id) metaById.set(p.id, p);

type Agg = {
  games: number; goals: number; goalAssists: number; behinds: number;
  kicks: number; handballs: number; disposals: number; marks: number;
  tackles: number; hitouts: number; clearances: number;
  freesFor: number; freesAgainst: number; foopyTotal: number;
};
const aggs = new Map<number, Agg>();

for (const game of Object.values(staticStats) as any[]) {
  if (!String(game.date ?? "").startsWith(SEASON)) continue;
  for (const td of game.teams ?? []) {
    for (const pe of td.players ?? []) {
      const pid = Number(pe.player?.id ?? 0);
      if (!pid) continue;
      const s = pe.statistics ?? pe;
      const goals       = n(s.goals?.total ?? s.goals);
      const goalAssists = n(s.goals?.assists ?? s.goalAssists ?? 0);
      const behinds     = n(s.behinds);
      const kicks       = n(s.kicks);
      const handballs   = n(s.handballs);
      const marks       = n(s.marks);
      const tackles     = n(s.tackles);
      const hitouts     = n(s.hitouts);
      const disposals   = n(s.disposals) || (kicks + handballs);
      const clearances  = n(s.clearances?.total ?? s.clearances);
      const ff = n(s.free_kicks?.for ?? s.freesFor ?? 0);
      const fa = n(s.free_kicks?.against ?? s.freesAgainst ?? 0);
      if (goals + kicks + handballs + marks + tackles + hitouts + clearances === 0) continue;
      const gf = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor: ff, freesAgainst: fa });
      const a = aggs.get(pid) ?? { games: 0, goals: 0, goalAssists: 0, behinds: 0, kicks: 0, handballs: 0, disposals: 0, marks: 0, tackles: 0, hitouts: 0, clearances: 0, freesFor: 0, freesAgainst: 0, foopyTotal: 0 };
      a.games++; a.goals += goals; a.goalAssists += goalAssists; a.behinds += behinds;
      a.kicks += kicks; a.handballs += handballs; a.disposals += disposals;
      a.marks += marks; a.tackles += tackles; a.hitouts += hitouts; a.clearances += clearances;
      a.freesFor += ff; a.freesAgainst += fa; a.foopyTotal += gf;
      aggs.set(pid, a);
    }
  }
}

const round1 = (v: number) => Number(v.toFixed(1));
const players: any[] = [];
for (const [apiSportsId, a] of aggs.entries()) {
  if (a.games <= 0) continue;
  const info = infoByApiId.get(apiSportsId);
  if (!info?.name || !info?.team) continue;
  const meta = metaById.get(info.id);
  players.push({
    id: info.id, name: info.name, team: info.team, apiSportsId,
    photoUrl: meta?.photoUrl ?? null,
    jerseyNumber: meta?.jerseyNumber ?? null,
    position: meta?.position ?? null,
    games: a.games,
    goals: a.goals, goalAssists: a.goalAssists, behinds: a.behinds,
    totalDisposals: a.disposals, totalKicks: a.kicks, totalHandballs: a.handballs,
    totalMarks: a.marks, totalTackles: a.tackles, totalHitouts: a.hitouts,
    totalClearances: a.clearances, freesFor: a.freesFor, freesAgainst: a.freesAgainst,
    disposals: round1(a.disposals / a.games), kicks: round1(a.kicks / a.games),
    handballs: round1(a.handballs / a.games), marks: round1(a.marks / a.games),
    tackles: round1(a.tackles / a.games), hitouts: round1(a.hitouts / a.games),
    clearances: round1(a.clearances / a.games), goalAvg: round1(a.goals / a.games),
    freesForAvg: round1(a.freesFor / a.games),
    avgFoopy: round1(a.foopyTotal / a.games),
    fetchedAt: new Date().toISOString(),
  });
}

const MIN_PLAYERS = 200;
if (players.length < MIN_PLAYERS) {
  console.error(`Only aggregated ${players.length} players (< ${MIN_PLAYERS}); refusing to overwrite. Is game-stats.json populated?`);
  process.exit(1);
}

players.sort((a, b) => b.totalDisposals - a.totalDisposals);
const out = path.join(dataDir, "player-season-stats.json");
fs.writeFileSync(`${out}.tmp`, JSON.stringify(players, null, 2));
fs.renameSync(`${out}.tmp`, out);
console.log(`✅ Wrote ${players.length} players → app/data/player-season-stats.json`);
console.log("Top 3 disposals:", players.slice(0, 3).map(p => `${p.name} ${p.totalDisposals}`).join(", "));
