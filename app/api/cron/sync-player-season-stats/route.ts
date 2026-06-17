import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { foopyRating } from "@/app/lib/foopyRating";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-player-season-stats
 *
 * Runs every hour via Vercel Cron.
 * Aggregates season player stats from per-game data (game-stats.json +
 * match_cache) — the same source as the player profile page and global
 * Foopy rank — and stores the combined results in match_cache so
 * /api/player-season-stats can serve fresh data without re-aggregating.
 * No external API calls, so it can't be rate-limited or partially fail.
 *
 * Protected by CRON_SECRET env var.
 */

const SEASON = new Date().getFullYear().toString();

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Season stats are aggregated entirely from per-game data (game-stats.json +
  // match_cache) — the SAME source as the player profile page and the global
  // Foopy rank. This avoids the API-Sports /players/statistics endpoint, which
  // both rejects the `team` param AND rate-limits per-player fan-out (a 200 with
  // a body-level rateLimit error), so only a handful of players ever came back.
  // Game-data aggregation is free, instant, complete (~625 players), and keeps
  // every surface consistent.
  const dataDir = path.join(process.cwd(), "app", "data");
  const sourcePlayers: any[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "players.json"), "utf8")
  );
  // Identity + metadata lookup by apiSportsId. Position/jersey/photo aren't in
  // the per-game data, so fall back to the static season file for those.
  let staticSeason: any[] = [];
  try {
    staticSeason = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  } catch {}
  const metaById = new Map<string, any>();
  for (const p of staticSeason) if (p.id) metaById.set(p.id, p);

  const infoByApiId = new Map<number, { id: string; name: string; team: string }>();
  for (const p of sourcePlayers) {
    if (p.apiSportsId) infoByApiId.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team });
  }

  const errors: string[] = [];

  // Build a unified game list: game-stats.json + match_cache games not in it.
  const staticStats: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
  );
  const staticIds = new Set(Object.keys(staticStats));

  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const db2 = adminSupabase();
  const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
    db2.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
    db2.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false).gte("fetched_at", yesterdayStr),
  ]);
  const allCacheRows = [
    ...(finalRows ?? []),
    ...(recentRows ?? []).filter(r => !(finalRows ?? []).some((f: any) => String(f.game_id) === String(r.game_id))),
  ];

  type RawPlayer = { pid: number; s: any };
  const allGames: { players: RawPlayer[] }[] = [];

  for (const game of Object.values(staticStats) as any[]) {
    if (!String(game.date ?? "").startsWith(SEASON)) continue;
    for (const td of game.teams ?? []) {
      allGames.push({ players: (td.players ?? []).map((pe: any) => ({ pid: Number(pe.player?.id ?? 0), s: pe.statistics ?? pe })) });
    }
  }
  for (const row of allCacheRows) {
    const gameId = String((row as any).game_id);
    if (staticIds.has(gameId)) continue;
    const payload = (row as any).payload as any;
    const responseItems: any[] = payload?.response ?? [];
    const date: string = responseItems[0]?.game?.date?.slice(0, 10) ?? "";
    if (!date.startsWith(SEASON)) continue;
    for (const td of responseItems[0]?.teams ?? []) {
      allGames.push({ players: (td.players ?? []).map((pe: any) => ({ pid: Number(pe.player?.id ?? 0), s: pe.statistics ?? pe })) });
    }
  }

  // Aggregate per player: game count, stat totals, and Foopy total.
  type Agg = {
    games: number; goals: number; goalAssists: number; behinds: number;
    kicks: number; handballs: number; disposals: number; marks: number;
    tackles: number; hitouts: number; clearances: number;
    freesFor: number; freesAgainst: number; foopyTotal: number;
  };
  const aggs = new Map<number, Agg>();

  for (const game of allGames) {
    for (const { pid, s } of game.players) {
      if (!pid) continue;
      const goals      = n(s.goals?.total ?? s.goals);
      const goalAssists = n(s.goals?.assists ?? s.goalAssists ?? 0);
      const behinds    = n(s.behinds);
      const kicks      = n(s.kicks);
      const handballs  = n(s.handballs);
      const marks      = n(s.marks);
      const tackles    = n(s.tackles);
      const hitouts    = n(s.hitouts);
      const disposals  = n(s.disposals) || (kicks + handballs);
      const clearances = n(s.clearances?.total ?? s.clearances);
      const ff = n(s.free_kicks?.for ?? s.freesFor ?? 0);
      const fa = n(s.free_kicks?.against ?? s.freesAgainst ?? 0);
      // Only count games the player actually featured in.
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

  const players: any[] = [];
  const round1 = (v: number) => Number(v.toFixed(1));
  for (const [apiSportsId, a] of aggs.entries()) {
    if (a.games <= 0) continue;
    const info = infoByApiId.get(apiSportsId);
    if (!info?.name || !info?.team) continue; // skip players we can't identify
    const meta = metaById.get(info.id);
    players.push({
      id:            info.id,
      name:          info.name,
      team:          info.team,
      apiSportsId,
      photoUrl:      meta?.photoUrl ?? null,
      jerseyNumber:  meta?.jerseyNumber ?? null,
      position:      meta?.position ?? null,
      games:         a.games,
      goals:         a.goals,
      totalGoals:    a.goals,
      goalAssists:   a.goalAssists,
      behinds:       a.behinds,
      totalDisposals:  a.disposals,
      totalKicks:      a.kicks,
      totalHandballs:  a.handballs,
      totalMarks:      a.marks,
      totalTackles:    a.tackles,
      totalHitouts:    a.hitouts,
      totalClearances: a.clearances,
      freesFor:        a.freesFor,
      freesAgainst:    a.freesAgainst,
      disposals:   round1(a.disposals / a.games),
      kicks:       round1(a.kicks / a.games),
      handballs:   round1(a.handballs / a.games),
      marks:       round1(a.marks / a.games),
      tackles:     round1(a.tackles / a.games),
      hitouts:     round1(a.hitouts / a.games),
      clearances:  round1(a.clearances / a.games),
      goalAvg:     round1(a.goals / a.games),
      freesForAvg: round1(a.freesFor / a.games),
      avgFoopy:    round1(a.foopyTotal / a.games),
      fetchedAt:   new Date().toISOString(),
    });
  }

  // Guard against a partial/corrupt write poisoning the page. A healthy AFL
  // season has ~600+ players with game time; refuse to overwrite the cache
  // (and the static fallback it sits in front of) with an implausibly small set.
  const MIN_PLAYERS = 200;
  if (players.length < MIN_PLAYERS) {
    return NextResponse.json(
      { ok: false, error: `Only aggregated ${players.length} players (< ${MIN_PLAYERS}); refusing to overwrite cache`, errors },
      { status: 502 }
    );
  }

  // Store combined results in match_cache using a synthetic game_id = 0
  // so /api/player-season-stats can read without re-aggregating.
  const db = adminSupabase();
  const { error: upsertErr } = await db
    .from("match_cache")
    .upsert(
      {
        game_id:    "0",
        data_type:  `player_season_${SEASON}`,
        payload:    { players, season: SEASON, generated_at: new Date().toISOString() },
        fetched_at: new Date().toISOString(),
        is_final:   false,
      },
      { onConflict: "game_id,data_type" }
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, players: players.length, errors });
}
