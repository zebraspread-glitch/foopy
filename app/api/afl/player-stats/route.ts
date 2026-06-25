import { NextResponse } from "next/server";
import { withCache, readCacheOnly } from "@/app/lib/matchCache";

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";

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

    const { data, fromCache } = await withCache(
      id, "player_stats", isFinal ? 90 : 10, () => fetchPlayerStats(id), isFinal
    );
    const res = NextResponse.json({ ...(data as any), cached: fromCache });
    res.headers.set("x-from-cache", fromCache ? "1" : "0");
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
