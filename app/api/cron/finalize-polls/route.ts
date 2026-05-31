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
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  // Only process games that are complete
  const finalGames = games.filter(
    g => Number(g.complete ?? 0) >= 100 || g.is_final === 1
  );

  const origin = new URL(req.url).origin;
  const results: { game_id: number; result: any }[] = [];

  for (const game of finalGames) {
    const gameId = Number(game.id);
    if (!gameId) continue;

    try {
      const res = await fetch(`${origin}/api/polls/finalize?game_id=${gameId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      // Only log games where we actually awarded something
      if (data.awarded > 0) {
        results.push({ game_id: gameId, result: data });
      }
    } catch (e: any) {
      results.push({ game_id: gameId, result: { error: e.message } });
    }
  }

  // Also resolve any completed duels
  try {
    await fetch(`${origin}/api/cron/resolve-duels`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "foopy-cron" },
      cache: "no-store",
    });
  } catch {}

  return NextResponse.json({ ok: true, processed: finalGames.length, awarded: results });
}
