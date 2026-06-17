import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scrapeLineups } from "@/app/lib/footywireLineups.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/sync-lineups
 *
 * Scrapes FootyWire's named teams (Ins/Outs + full lineups) and stores each
 * game's lineup in match_cache keyed by its Squiggle game id, so the match
 * preview can show Ins/Outs without scraping on every request. Runs often so
 * lineups appear automatically as they're released through the week.
 *
 * Protected by CRON_SECRET env var.
 */

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
function teamsMatch(a: string, b: string) {
  const ak = norm(a), bk = norm(b);
  return !!ak && !!bk && (ak === bk || ak.includes(bk) || bk.includes(ak));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let games;
  try {
    games = await scrapeLineups();
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
  if (!games.length) return NextResponse.json({ ok: true, scraped: 0, note: "no named teams yet" });

  // Map each scraped game to its Squiggle game id via team names (upcoming/recent).
  const year = new Date().getFullYear();
  let squiggleGames: any[] = [];
  try {
    const sq = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
      headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store",
    });
    if (sq.ok) squiggleGames = (await sq.json()).games ?? [];
  } catch {}

  const supabase = adminSupabase();
  const results: any[] = [];

  for (const game of games) {
    // Prefer an incomplete (upcoming) fixture; fall back to the latest matching one.
    const candidates = squiggleGames.filter(
      (g) => teamsMatch(g.hteam, game.home) && teamsMatch(g.ateam, game.away)
    );
    const fixture =
      candidates.find((g) => Number(g.complete ?? 0) < 100) ??
      candidates.sort((a, b) => Number(b.round) - Number(a.round))[0];

    if (!fixture) {
      results.push({ game: `${game.home} v ${game.away}`, matched: false });
      continue;
    }

    const gameId = String(fixture.id);
    const payload = {
      ...game,
      squiggleGameId: gameId,
      round: Number(fixture.round),
      scrapedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from("match_cache").upsert(
      {
        game_id: gameId,
        data_type: "lineups",
        payload,
        fetched_at: new Date().toISOString(),
        is_final: false,
      },
      { onConflict: "game_id,data_type" }
    );

    results.push({
      game: `${game.home} v ${game.away}`,
      gameId,
      round: Number(fixture.round),
      ins: Object.values(game.teams).reduce((n: number, t: any) => n + t.ins.length, 0),
      outs: Object.values(game.teams).reduce((n: number, t: any) => n + t.outs.length, 0),
      saved: !error,
      error: error?.message,
    });
  }

  return NextResponse.json({ ok: true, scraped: games.length, results });
}
