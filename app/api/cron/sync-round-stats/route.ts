import { NextResponse } from "next/server";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { getApiTeamId } from "@/app/lib/apiSportsTeams";
import { createClient } from "@supabase/supabase-js";
import { acquireLiveLoopLock, releaseLiveLoopLock } from "@/app/lib/matchCache";
import { foopyRating, rawPlayerToStats } from "@/app/lib/foopyRating";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes — this fans out to multiple API calls and runs the
// live-stats polling loop below.
export const maxDuration = 300;

// The live loop runs for at most this long per invocation, well under the
// 1-minute cron tick, so the *next* tick is always free to take over (no
// invocations stacking up). Locked via acquireLiveLoopLock so two overlapping
// invocations can never run the loop at the same time.
const LIVE_LOOP_BUDGET_MS = 50_000;
const LIVE_LOOP_INTERVAL_MS = 15_000;
const LIVE_LOOP_LOCK_TTL_S = 55;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logLoop(...args: unknown[]) {
  console.log("[live-loop]", ...args);
}

function gameStatus(g: any): "LIVE" | "COMPLETED" | "UPCOMING" {
  const complete = Number(g.complete ?? 0);
  if (complete >= 100 || g.is_final === 1) return "COMPLETED";
  if (complete > 0) return "LIVE";
  return "UPCOMING";
}

async function fetchSquiggleGames(): Promise<any[]> {
  const year = new Date().getFullYear();
  const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
    headers: { "User-Agent": "Foopy AFL App" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Squiggle fetch failed");
  const data = await res.json();
  return data.games ?? data ?? [];
}

function resolveApiId(game: any) {
  const squiggleId = String(game.id);
  const apiId = (API_SPORTS_MATCH_IDS as Record<string, string>)[squiggleId] ?? squiggleId;
  const homeApiTeamId = getApiTeamId(game.hteam ?? game.hteamname);
  const awayApiTeamId = getApiTeamId(game.ateam ?? game.ateamname);
  const gameDate = String(game.date ?? "").slice(0, 10);
  const resolveParams =
    gameDate && homeApiTeamId && awayApiTeamId
      ? `&date=${gameDate}&home=${homeApiTeamId}&away=${awayApiTeamId}`
      : "";
  return { apiId, resolveParams };
}

interface LivePlayerRow {
  match_id: string;
  player_id: number;
  team_id: number | null;
  player_name: string | null;
  goals: number;
  goal_assists: number;
  behinds: number;
  kicks: number;
  handballs: number;
  disposals: number;
  marks: number;
  tackles: number;
  hitouts: number;
  clearances: number;
  inside50s: number;
  rebound50s: number;
  clangers: number;
  frees_for: number;
  frees_against: number;
  fp: number;
  foopy: number;
}

const STAT_FIELDS: (keyof LivePlayerRow)[] = [
  "team_id", "player_name", "goals", "goal_assists", "behinds", "kicks",
  "handballs", "disposals", "marks", "tackles", "hitouts", "clearances",
  "inside50s", "rebound50s", "clangers", "frees_for", "frees_against",
  "fp", "foopy",
];

function rowsDiffer(a: LivePlayerRow, b: LivePlayerRow): boolean {
  return STAT_FIELDS.some((f) => a[f] !== b[f]);
}

function computeFP(stats: any): number {
  const n = (v: any) => Number(v ?? 0);
  return (
    n(stats.kicks)        * 3 +
    n(stats.handballs)    * 2 +
    n(stats.marks)        * 3 +
    n(stats.tackles)      * 4 +
    n(stats.freesFor)     * 1 +
    n(stats.freesAgainst) * -3 +
    n(stats.hitouts)      * 1 +
    n(stats.goals)        * 6 +
    n(stats.behinds)      * 1
  );
}

function buildRow(matchId: string, playerEntry: any): LivePlayerRow | null {
  const pid = playerEntry?.player?.id;
  if (!pid) return null;
  const stats = rawPlayerToStats(playerEntry);
  return {
    match_id: matchId,
    player_id: Number(pid),
    team_id: playerEntry?.team_id ?? null,
    player_name: playerEntry?.player?.name ?? null,
    goals: Number(stats.goals) || 0,
    goal_assists: Number(stats.goalAssists) || 0,
    behinds: Number(stats.behinds) || 0,
    kicks: Number(stats.kicks) || 0,
    handballs: Number(stats.handballs) || 0,
    disposals: Number(stats.disposals) || (Number(stats.kicks) + Number(stats.handballs)),
    marks: Number(stats.marks) || 0,
    tackles: Number(stats.tackles) || 0,
    hitouts: Number(stats.hitouts) || 0,
    clearances: Number(stats.clearances) || 0,
    inside50s: Number(playerEntry?.insides50 ?? playerEntry?.inside50s) || 0,
    rebound50s: Number(playerEntry?.rebounds50 ?? playerEntry?.rebound50s) || 0,
    clangers: Number(playerEntry?.clangers) || 0,
    frees_for: Number(stats.freesFor) || 0,
    frees_against: Number(stats.freesAgainst) || 0,
    fp: computeFP(stats),
    foopy: foopyRating(stats),
  };
}

/** One poll of a single live game's player stats → diffed upsert into live_player_stats. */
async function pollLiveGameStats(
  origin: string,
  secret: string,
  supabase: ReturnType<typeof adminSupabase>,
  game: any,
  lastSeen: Map<string, Map<number, LivePlayerRow>>
) {
  const { apiId, resolveParams } = resolveApiId(game);
  // Keyed by the API-Sports id (matches live_game_feed.api_game_id and what
  // the client passes as apiSportsGameId) — NOT Squiggle's game.id, which is
  // a different number space and would never match the client's lookup.
  const matchId = apiId;

  try {
    const res = await fetch(
      `${origin}/api/afl/player-stats?id=${apiId}${resolveParams}`,
      { cache: "no-store", headers: { "x-sync-secret": secret } }
    );
    if (!res.ok) {
      logLoop(`${matchId} (api ${apiId}): player-stats fetch failed — HTTP ${res.status}`);
      return { matchId, ok: false };
    }

    const data = await res.json();
    const teams: any[] = data?.response?.[0]?.teams ?? [];

    // Seed from the DB (not an empty map) the first time this match is seen
    // in this invocation, so diffing is accurate across cron-tick boundaries
    // too — otherwise every new invocation would treat all players as
    // "changed" on its first iteration and rewrite rows that never moved.
    let seenForMatch = lastSeen.get(matchId);
    if (!seenForMatch) {
      seenForMatch = new Map<number, LivePlayerRow>();
      const { data: existingRows } = await supabase
        .from("live_player_stats")
        .select("*")
        .eq("match_id", matchId);
      for (const r of existingRows ?? []) {
        seenForMatch.set(Number(r.player_id), {
          match_id: r.match_id,
          player_id: Number(r.player_id),
          team_id: r.team_id,
          player_name: r.player_name,
          goals: r.goals,
          goal_assists: r.goal_assists,
          behinds: r.behinds,
          kicks: r.kicks,
          handballs: r.handballs,
          disposals: r.disposals,
          marks: r.marks,
          tackles: r.tackles,
          hitouts: r.hitouts,
          clearances: r.clearances,
          inside50s: r.inside50s,
          rebound50s: r.rebound50s,
          clangers: r.clangers,
          frees_for: r.frees_for,
          frees_against: r.frees_against,
          fp: r.fp,
          foopy: r.foopy,
        });
      }
    }

    const toUpsert: LivePlayerRow[] = [];
    let totalPlayers = 0;

    for (const team of teams) {
      for (const playerEntry of team.players ?? []) {
        totalPlayers++;
        const row = buildRow(matchId, { ...playerEntry, team_id: team?.team?.id ?? null });
        if (!row) continue;

        const prev = seenForMatch.get(row.player_id);
        if (!prev || rowsDiffer(prev, row)) {
          toUpsert.push(row);
          seenForMatch.set(row.player_id, row);
        }
      }
    }

    lastSeen.set(matchId, seenForMatch);

    if (toUpsert.length) {
      const { error } = await supabase
        .from("live_player_stats")
        .upsert(toUpsert, { onConflict: "match_id,player_id" });
      if (error) {
        logLoop(`${matchId}: upsert FAILED for ${toUpsert.length} row(s) — ${error.message}`);
        return { matchId, ok: false, error: error.message };
      }
    }

    const skipped = totalPlayers - toUpsert.length;
    logLoop(`${matchId} (api ${apiId}): updated=${toUpsert.length} skipped=${skipped} total=${totalPlayers}`);

    return { matchId, ok: true, updated: toUpsert.length, skipped, totalPlayers };
  } catch (err: any) {
    logLoop(`${matchId} (api ${apiId}): poll FAILED — ${err.message}`);
    return { matchId, ok: false, error: err.message };
  }
}

/**
 * GET /api/cron/sync-round-stats
 *
 * Triggered every minute by Vercel Cron — that's just a heartbeat, since
 * Vercel has no sub-minute schedule. The real work is a short-lived loop
 * inside this single invocation that polls every LIVE game's player stats
 * every 15s for up to ~50s, then hands off cleanly to the next tick. A TTL
 * lock (live_loop_lock) guarantees only one invocation runs that loop at a
 * time, even if two cron ticks overlap.
 *
 * - LIVE games:      polled every 15s (this invocation's loop) → live_player_stats
 * - COMPLETED games: fetched once with ?final=true (permanent cache)
 * - UPCOMING games:  skipped
 *
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // NOT new URL(req.url).origin — Vercel Cron invokes this route against the
  // deployment's internal alias URL (e.g. foopyfootyapp-xxxx-...vercel.app),
  // which has Vercel's deployment-protection wall in front of it. Self-fetches
  // to that origin come back as an HTML auth page instead of JSON. The custom
  // domain bypasses that wall, so route internal calls through it instead.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const supabase = adminSupabase();

  let allGames: any[];
  try {
    allGames = await fetchSquiggleGames();
  } catch (err: any) {
    console.error("[sync-round-stats] Squiggle fetch failed:", err.message);
    return NextResponse.json({ error: "Squiggle fetch failed" }, { status: 502 });
  }

  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const liveGames = allGames.filter((g) => gameStatus(g) === "LIVE");

  const liveGame = liveGames[0];
  let currentRound: number;
  if (liveGame) {
    currentRound = Number(liveGame.round);
  } else {
    const completedRounds = allGames
      .filter((g) => gameStatus(g) === "COMPLETED")
      .map((g) => Number(g.round))
      .filter((r) => r > 0);
    currentRound = completedRounds.length > 0 ? Math.max(...completedRounds) : 0;
  }

  if (!currentRound && liveGames.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no active round" });
  }

  const recentCompleted = allGames.filter(
    (g) =>
      gameStatus(g) === "COMPLETED" &&
      g.date &&
      g.date >= cutoff &&
      Number(g.round) !== currentRound
  );
  const roundGames = [
    ...allGames.filter((g) => Number(g.round) === currentRound),
    ...recentCompleted,
  ];

  // ── 1. Live-stats polling loop (15s cadence, ~50s budget, TTL-locked) ──────
  let loopIterations = 0;
  let lockAcquired = false;

  if (liveGames.length > 0) {
    lockAcquired = await acquireLiveLoopLock(LIVE_LOOP_LOCK_TTL_S);
    if (!lockAcquired) {
      logLoop(`lock already held by another invocation — skipping this tick (${liveGames.length} live game(s) seen)`);
    }
  }

  if (liveGames.length > 0 && !lockAcquired) {
    return NextResponse.json({ ok: true, skipped: "live loop lock held", live_games: liveGames.length });
  }

  if (lockAcquired) {
    const loopStartedAt = Date.now();
    const lastSeenStore = new Map<string, Map<number, LivePlayerRow>>();
    logLoop(`lock acquired — starting loop for ${liveGames.length} live game(s): ${liveGames.map((g) => g.id).join(", ")}`);

    try {
      while (Date.now() - loopStartedAt < LIVE_LOOP_BUDGET_MS) {
        const iterationStart = Date.now();

        // Re-check live status every iteration so the loop stops within one
        // 15s tick of a game going final — never polls a finished game. A
        // failed refresh here must not abort the whole cron tick (section 2
        // below still needs to run) — log it and end the loop early instead;
        // the next minute's tick will pick straight back up.
        let freshGames: any[];
        try {
          freshGames = loopIterations === 0 ? allGames : await fetchSquiggleGames();
        } catch (err: any) {
          logLoop(`Squiggle refresh failed mid-loop after ${loopIterations} iteration(s) — ending loop early: ${err.message}`);
          break;
        }

        const currentlyLive = freshGames.filter((g) => gameStatus(g) === "LIVE");

        if (currentlyLive.length === 0) {
          logLoop(`no live games remaining after ${loopIterations} iteration(s) — exiting loop`);
          break;
        }

        logLoop(`iteration ${loopIterations + 1}: polling ${currentlyLive.length} live game(s): ${currentlyLive.map((g) => g.id).join(", ")}`);

        const iterResults = await Promise.all(
          currentlyLive.map((g) => pollLiveGameStats(origin, secret, supabase, g, lastSeenStore))
        );
        loopIterations++;

        const okCount = iterResults.filter((r) => r.ok).length;
        const failCount = iterResults.length - okCount;
        logLoop(`iteration ${loopIterations} done: ${okCount} ok, ${failCount} failed`);

        const elapsed = Date.now() - iterationStart;
        const sleepMs = Math.max(0, LIVE_LOOP_INTERVAL_MS - elapsed);
        if (Date.now() + sleepMs - loopStartedAt >= LIVE_LOOP_BUDGET_MS) {
          logLoop(`budget exhausted after ${loopIterations} iteration(s) — handing off to next tick`);
          break;
        }
        await sleep(sleepMs);
      }
    } finally {
      await releaseLiveLoopLock();
      logLoop(`released lock after ${loopIterations} iteration(s), ${Date.now() - loopStartedAt}ms elapsed`);
    }
  }

  // ── 2. One-shot warm pass: quarters/play-by-play for all round games, plus
  //      final player-stats caching for completed games (unchanged cadence —
  //      these don't need 15s freshness). Live games' player-stats are fully
  //      handled by the loop above, so they're skipped here. ─────────────────
  const results: any[] = [];

  await Promise.all(
    roundGames.map(async (game) => {
      const status = gameStatus(game);
      if (status === "UPCOMING") return;

      const { apiId, resolveParams } = resolveApiId(game);
      const isFinal = status === "COMPLETED";

      const quartersUrl = `${origin}/api/afl/quarters?id=${apiId}${isFinal ? "&final=true" : ""}`;
      const pbpUrl = `${origin}/api/afl/play-by-play?id=${apiId}${isFinal ? "&final=true" : ""}`;
      const syncHeaders = { "x-sync-secret": secret };

      try {
        const fetches: Promise<Response | null>[] = [
          fetch(quartersUrl, { cache: "no-store", headers: syncHeaders }),
          fetch(pbpUrl, { cache: "no-store", headers: syncHeaders }),
        ];

        if (isFinal) {
          const statsUrl = `${origin}/api/afl/player-stats?id=${apiId}&final=true${resolveParams}`;
          fetches.push(fetch(statsUrl, { cache: "no-store", headers: syncHeaders }));
        } else if (status === "LIVE") {
          // Feed events sync only from cron/internal calls; browsers read cached rows.
          fetches.push(fetch(`${origin}/api/afl/sync-events?id=${apiId}`, { cache: "no-store", headers: syncHeaders }));
        }

        const settled = await Promise.all(fetches);
        const statsRes = isFinal ? settled[2] : null;

        if (isFinal) {
          // live_player_stats is a live-only mirror — final numbers are
          // already permanently cached in match_cache, and the client stops
          // reading this table once a game leaves LIVE status. Safe to drop;
          // idempotent no-op on subsequent ticks once already cleared.
          const { error: deleteError } = await supabase
            .from("live_player_stats")
            .delete()
            .eq("match_id", apiId);
          if (deleteError) {
            console.error(`[sync-round-stats] live_player_stats cleanup failed for ${apiId}:`, deleteError.message);
          }
        }

        results.push({
          game_id: game.id,
          api_id: apiId,
          status,
          stats_ok: statsRes ? statsRes.ok : true,
          stats_cached: statsRes ? statsRes.headers.get("x-from-cache") === "1" : false,
        });
      } catch (err: any) {
        results.push({ game_id: game.id, api_id: apiId, status, error: err.message });
      }
    })
  );

  const liveCount      = results.filter((r) => r.status === "LIVE").length;
  const finalCount     = results.filter((r) => r.status === "COMPLETED").length;
  const newlyFinalised = results.filter((r) => r.status === "COMPLETED" && r.stats_ok && !r.stats_cached);

  if (newlyFinalised.length > 0) {
    fetch(`${origin}/api/cron/sync-player-season-stats`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => {});
  }

  if (liveCount > 0 || finalCount > 0) {
    fetch(`${origin}/api/cron/resolve-duels`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    round: currentRound,
    live: liveCount,
    completed: finalCount,
    live_loop_ran: lockAcquired,
    live_loop_iterations: loopIterations,
    triggered_season_sync: newlyFinalised.length > 0,
    results,
  });
}
