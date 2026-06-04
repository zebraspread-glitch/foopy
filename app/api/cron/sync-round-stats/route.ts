import { NextResponse } from "next/server";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes — this fans out to multiple API calls
export const maxDuration = 300;

/**
 * GET /api/cron/sync-round-stats
 *
 * Runs every minute via Vercel Cron.
 * Proactively warms the match_cache for every game in the current round so
 * users NEVER trigger a live API-Sports call themselves — they always read from cache.
 *
 * - LIVE games:      fetches player stats (90s TTL) + syncs feed events
 * - COMPLETED games: fetches player stats with ?final=true (permanent cache)
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

  const origin = new URL(req.url).origin;

  // ── 1. Fetch current season games from Squiggle ───────────────────────────
  const year = new Date().getFullYear();
  const squiggleRes = await fetch(
    `https://api.squiggle.com.au/?q=games;year=${year}`,
    { headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store" }
  );
  if (!squiggleRes.ok) {
    return NextResponse.json({ error: "Squiggle fetch failed" }, { status: 502 });
  }
  const squiggleData = await squiggleRes.json();
  const allGames: any[] = squiggleData.games ?? squiggleData ?? [];

  function gameStatus(g: any): "LIVE" | "COMPLETED" | "UPCOMING" {
    const complete = Number(g.complete ?? 0);
    if (complete >= 100 || g.is_final === 1) return "COMPLETED";
    if (complete > 0) return "LIVE";
    return "UPCOMING";
  }

  // ── 2. Determine which games to warm ─────────────────────────────────────
  // Live games:      always warm (real-time data)
  // Completed games: warm if within last 60 days (covers pass reward windows)
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const liveGames = allGames.filter((g) => gameStatus(g) === "LIVE");

  // Current round = round of any live game, or highest completed round
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

  // Current round games (live or completed) + any recently-completed games across rounds
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

  // ── 3. Fan out: warm cache for each game ──────────────────────────────────
  const results: any[] = [];

  await Promise.all(
    roundGames.map(async (game) => {
      const status = gameStatus(game);
      if (status === "UPCOMING") return;

      const squiggleId = String(game.id);
      const apiId =
        (API_SPORTS_MATCH_IDS as Record<string, string>)[squiggleId] ?? squiggleId;

      const isFinal = status === "COMPLETED";
      const statsUrl = `${origin}/api/afl/player-stats?id=${apiId}${isFinal ? "&final=true" : ""}`;
      const quartersUrl = `${origin}/api/afl/quarters?id=${apiId}${isFinal ? "&final=true" : ""}`;
      try {
        const [statsRes] = await Promise.all([
          fetch(statsUrl, { cache: "no-store" }),
          fetch(quartersUrl, { cache: "no-store" }),
          // For live games also sync feed events
          status === "LIVE"
            ? fetch(`${origin}/api/afl/sync-events?id=${apiId}`, { cache: "no-store" })
            : Promise.resolve(null),
        ]);

        results.push({
          game_id: game.id,
          api_id: apiId,
          status,
          stats_ok: statsRes.ok,
          stats_cached: statsRes.headers.get("x-from-cache") === "1",
        });
      } catch (err: any) {
        results.push({ game_id: game.id, api_id: apiId, status, error: err.message });
      }
    })
  );

  const liveCount      = results.filter((r) => r.status === "LIVE").length;
  const finalCount     = results.filter((r) => r.status === "COMPLETED").length;
  const newlyFinalised = results.filter((r) => r.status === "COMPLETED" && r.stats_ok && !r.stats_cached);

  // When a game's final stats were just written (cache miss on a completed game)
  // it means the game recently finished — trigger a player season stats refresh
  // so the /stats page updates without anyone having to run a script.
  if (newlyFinalised.length > 0) {
    // Trigger season stats refresh and duel resolution when a game just finished
    fetch(`${origin}/api/cron/sync-player-season-stats`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => {});

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
    triggered_season_sync: newlyFinalised.length > 0,
    results,
  });
}
