import { NextResponse } from "next/server";
import { withCache, readCacheOnly } from "@/app/lib/matchCache";

export const dynamic = "force-dynamic";

async function fetchTeamStats(date: string) {
  const res = await fetch(
    `https://v1.afl.api-sports.io/games/statistics/teams?date=${date}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
      cache: "no-store",
    }
  );
  const data = await res.json();
  return data;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const cacheKey = `date_${date}`;
  const syncSecret = process.env.CRON_SECRET;
  const isSyncCall = syncSecret && req.headers.get("x-sync-secret") === syncSecret;

  try {
    if (isSyncCall) {
      const { data } = await withCache(cacheKey, "team_stats", 900, () => fetchTeamStats(date), false);
      return NextResponse.json(data);
    }

    const { data, found } = await readCacheOnly(cacheKey, "team_stats");
    if (!found) return NextResponse.json({ response: [] });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
