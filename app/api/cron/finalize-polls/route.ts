import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/finalize-polls
 *
 * Called by Vercel Cron (see vercel.json).
 * Fetches all AFL games from Squiggle, finds any that are FINAL and have
 * polls in the DB, and calls /api/polls/finalize for each one.
 *
 * Protected by CRON_SECRET env var (set same value in Vercel + vercel.json header).
 */
export async function GET(req: Request) {
  // Verify cron secret so random callers can't spam it
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all games this year from Squiggle
  const year = new Date().getFullYear();
  const squiggleRes = await fetch(
    `https://api.squiggle.com.au/?q=games;year=${year}`,
    { headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store" }
  );
  if (!squiggleRes.ok) {
    return NextResponse.json({ error: "Squiggle fetch failed" }, { status: 502 });
  }
  const squiggleData = await squiggleRes.json();
  const games: any[] = squiggleData.games ?? squiggleData ?? [];

  // Only process games that are complete AND finished in the last 14 days
  // (older games are already finalized — no need to reprocess every hour)
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const finalGames = games.filter(g =>
    (Number(g.complete ?? 0) >= 100 || g.is_final === 1) &&
    (g.date ?? "") >= cutoff
  );

  const origin = new URL(req.url).origin;

  // Process all recent final games in parallel so we don't time out
  const settled = await Promise.allSettled(
    finalGames.map(async (game) => {
      const gameId = Number(game.id);
      if (!gameId) return null;
      const res = await fetch(`${origin}/api/polls/finalize?game_id=${gameId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      return data.awarded > 0 ? { game_id: gameId, result: data } : null;
    })
  );

  const results = settled
    .filter(s => s.status === "fulfilled" && s.value !== null)
    .map(s => (s as PromiseFulfilledResult<any>).value);

  // Also resolve any completed duels and refresh player season stats
  try {
    await fetch(`${origin}/api/cron/resolve-duels`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    });
  } catch {}
  try {
    fetch(`${origin}/api/cron/sync-player-season-stats`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => {});
  } catch {}

  return NextResponse.json({ ok: true, processed: finalGames.length, awarded: results });
}
