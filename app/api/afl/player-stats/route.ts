import { NextResponse } from "next/server";
import { withCache, readCacheOnly } from "@/app/lib/matchCache";
import { findGameByTeamIds, gameHasTeamIds } from "@/app/lib/apiSportsTeams";

export const dynamic = "force-dynamic";

async function fetchPlayerStats(gameId: string) {
  const res = await fetch(
    `https://v1.afl.api-sports.io/games/statistics/players?id=${gameId}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`API-Sports player stats failed: ${res.status}`);
  return res.json();
}

// All of a date's games' player stats in one call. Used to re-resolve a game
// when the static (offset-guessed) id is wrong — API-Sports assigns per-game
// ids in its own order, so the guess drifts for recent fixtures.
async function fetchPlayerStatsByDate(date: string) {
  const res = await fetch(
    `https://v1.afl.api-sports.io/games/statistics/players?date=${date}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`API-Sports player stats (by date) failed: ${res.status}`);
  return res.json();
}

function hasTeams(data: any): boolean {
  return !!data?.response?.[0]?.teams?.length;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";
  // Sync-only re-resolution hints: the game's date + the two stable API-Sports
  // TEAM ids, so we can match the real game by date when the id guess is empty.
  const date = searchParams.get("date") || "";
  const home = Number(searchParams.get("home") || 0);
  const away = Number(searchParams.get("away") || 0);

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Only the sync cron (which presents the secret) may hit API-Sports. Every
  // other caller — i.e. real users — is served from cache, so user traffic can
  // never burn the upstream request quota. See team-stats for the same pattern.
  const syncSecret = process.env.CRON_SECRET;
  const isSyncCall = !!syncSecret && req.headers.get("x-sync-secret") === syncSecret;

  try {
    if (!isSyncCall) {
      const { data, found } = await readCacheOnly(id, "player_stats");
      const res = NextResponse.json({ ...((found ? data : { response: [] }) as any), cached: true });
      res.headers.set("x-from-cache", "1");
      return res;
    }

    // Sync (cron) path. Resolve by date+teams when hints are present, then
    // cache the matched game under the mapped id the page already reads.
    // If the date sweep cannot find the game, fall back to the id endpoint,
    // but never cache a non-empty id response for the wrong two teams.
    const fetchWithDateFallback = async () => {
      if (date && home && away) {
        try {
          // Cache the per-date sweep briefly so multiple games on the same date
          // in one cron run reuse a single upstream call.
          const { data: dateData } = await withCache(
            `apidate:${date}`,
            "player_stats_by_date",
            30,
            () => fetchPlayerStatsByDate(date)
          );
          const matched = findGameByTeamIds((dateData as any)?.response ?? [], home, away);
          if (matched?.teams?.length) {
            return { get: "games/statistics/players", results: 1, response: [matched], resolvedBy: "date" };
          }
        } catch {
          // Non-fatal: fall through to the id endpoint below.
        }
      }
      const byId = await fetchPlayerStats(id);
      if (date && home && away && hasTeams(byId) && !gameHasTeamIds(byId?.response?.[0], home, away)) {
        return { ...byId, results: 0, response: [], ignoredWrongId: true };
      }

      return byId;
    };

    const { data, fromCache } = await withCache(
      id, "player_stats", isFinal ? 90 : 10, fetchWithDateFallback, isFinal
    );
    const res = NextResponse.json({ ...(data as any), cached: fromCache });
    res.headers.set("x-from-cache", fromCache ? "1" : "0");
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
