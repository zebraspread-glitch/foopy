/**
 * seedMissingGamesToCache.ts
 *
 * One-off repair: pushes per-game rows from game-stats.json into the live
 * Supabase match_cache, then recomputes and upserts the season-stats cache —
 * the exact two writes the sync-stats-by-date and sync-player-season-stats
 * crons make. Use to backfill a round that API-Sports populated late (after the
 * cron's date window had moved on) without waiting for a redeploy + cron cycle.
 *
 *   tsx scripts/seedMissingGamesToCache.ts --since 2026-06-15
 *
 * --since  earliest game date to push as a final per-game row (default: all
 *          season games strictly before today). Live (today's) games are never
 *          touched, so this can't downgrade an in-progress game.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { foopyRating } from "../app/lib/foopyRating";

const SEASON = new Date().getFullYear().toString();
const TODAY = new Date().toISOString().slice(0, 10);
const dataDir = path.join(process.cwd(), "app", "data");

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] ?? null : null;
}
const SINCE = arg("--since");

function readJson(file: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")); }
  catch { return fallback; }
}
function n(v: any) { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase env in .env.local"); process.exit(1); }
const db = createClient(url, key);

const staticStats: Record<string, any> = readJson("game-stats.json", {});
const sourcePlayers: any[] = readJson("players.json", []);
const staticSeason: any[] = readJson("player-season-stats.json", []);

async function main() {
  // ── 1. Push missing per-game rows as final ──────────────────────────────
  const games = (Object.values(staticStats) as any[]).filter((g) => {
    const date = String(g.date ?? "");
    if (!date.startsWith(SEASON)) return false;
    if (date >= TODAY) return false;            // never touch live games
    if (SINCE && date < SINCE) return false;
    return true;
  });

  console.log(`Pushing ${games.length} per-game rows to match_cache…`);
  let pushed = 0;
  for (const g of games) {
    const gameId = String(g.gameId);
    const payload = { response: [{ game: { id: g.gameId, date: g.date }, teams: g.teams ?? [] }] };
    const { error } = await db.from("match_cache").upsert(
      { game_id: gameId, data_type: "player_stats", payload, fetched_at: new Date().toISOString(), is_final: true },
      { onConflict: "game_id,data_type" },
    );
    if (error) console.error(`  ✗ ${gameId}: ${error.message}`);
    else { pushed++; process.stdout.write(`  ✓ ${gameId} (${g.date})\n`); }
  }
  console.log(`Pushed ${pushed}/${games.length} games.\n`);

  // ── 2. Recompute season cache from game-stats.json (mirrors the cron) ────
  const infoByApiId = new Map<number, { id: string; name: string; team: string }>();
  for (const p of sourcePlayers) if (p.apiSportsId) infoByApiId.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team });
  const metaById = new Map<string, any>();
  for (const p of staticSeason) if (p.id) metaById.set(p.id, p);

  type Agg = { games: number; goals: number; goalAssists: number; behinds: number; kicks: number; handballs: number; disposals: number; marks: number; tackles: number; hitouts: number; clearances: number; freesFor: number; freesAgainst: number; foopyTotal: number };
  const aggs = new Map<number, Agg>();
  for (const game of Object.values(staticStats) as any[]) {
    if (!String(game.date ?? "").startsWith(SEASON)) continue;
    for (const td of game.teams ?? []) {
      for (const pe of td.players ?? []) {
        const pid = Number(pe.player?.id ?? 0);
        if (!pid) continue;
        const s = pe.statistics ?? pe;
        const goals = n(s.goals?.total ?? s.goals), goalAssists = n(s.goals?.assists ?? s.goalAssists ?? 0), behinds = n(s.behinds);
        const kicks = n(s.kicks), handballs = n(s.handballs), marks = n(s.marks), tackles = n(s.tackles), hitouts = n(s.hitouts);
        const disposals = n(s.disposals) || (kicks + handballs), clearances = n(s.clearances?.total ?? s.clearances);
        const ff = n(s.free_kicks?.for ?? s.freesFor ?? 0), fa = n(s.free_kicks?.against ?? s.freesAgainst ?? 0);
        if (goals + kicks + handballs + marks + tackles + hitouts + clearances === 0) continue;
        const gf = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor: ff, freesAgainst: fa });
        const a = aggs.get(pid) ?? { games: 0, goals: 0, goalAssists: 0, behinds: 0, kicks: 0, handballs: 0, disposals: 0, marks: 0, tackles: 0, hitouts: 0, clearances: 0, freesFor: 0, freesAgainst: 0, foopyTotal: 0 };
        a.games++; a.goals += goals; a.goalAssists += goalAssists; a.behinds += behinds; a.kicks += kicks; a.handballs += handballs; a.disposals += disposals; a.marks += marks; a.tackles += tackles; a.hitouts += hitouts; a.clearances += clearances; a.freesFor += ff; a.freesAgainst += fa; a.foopyTotal += gf;
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
      photoUrl: meta?.photoUrl ?? null, jerseyNumber: meta?.jerseyNumber ?? null, position: meta?.position ?? null,
      games: a.games, goals: a.goals, totalGoals: a.goals, goalAssists: a.goalAssists, behinds: a.behinds,
      totalDisposals: a.disposals, totalKicks: a.kicks, totalHandballs: a.handballs, totalMarks: a.marks,
      totalTackles: a.tackles, totalHitouts: a.hitouts, totalClearances: a.clearances, freesFor: a.freesFor, freesAgainst: a.freesAgainst,
      disposals: round1(a.disposals / a.games), kicks: round1(a.kicks / a.games), handballs: round1(a.handballs / a.games),
      marks: round1(a.marks / a.games), tackles: round1(a.tackles / a.games), hitouts: round1(a.hitouts / a.games),
      clearances: round1(a.clearances / a.games), goalAvg: round1(a.goals / a.games), freesForAvg: round1(a.freesFor / a.games),
      avgFoopy: round1(a.foopyTotal / a.games), fetchedAt: new Date().toISOString(),
    });
  }

  if (players.length < 200) { console.error(`Only ${players.length} players aggregated; refusing to write season cache.`); process.exit(1); }

  const { error } = await db.from("match_cache").upsert(
    { game_id: "0", data_type: `player_season_${SEASON}`, payload: { players, season: SEASON, generated_at: new Date().toISOString() }, fetched_at: new Date().toISOString(), is_final: false },
    { onConflict: "game_id,data_type" },
  );
  if (error) { console.error("Season cache upsert failed:", error.message); process.exit(1); }

  players.sort((a, b) => b.totalDisposals - a.totalDisposals);
  console.log(`✅ Season cache updated — ${players.length} players.`);
  console.log("Top 3 disposals:", players.slice(0, 3).map((p) => `${p.name} ${p.totalDisposals}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
