import { NextResponse } from "next/server";
import { withCache, readCacheOnly } from "@/app/lib/matchCache";

export const dynamic = "force-dynamic";

async function fetchQuarters(gameId: string) {
  const res = await fetch(
    `https://v1.afl.api-sports.io/games/quarters?id=${gameId}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? process.env.API_SPORTS_KEY ?? "" },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`API-Sports quarters failed: ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";

  if (!id) return NextResponse.json({ error: "Missing game id" }, { status: 400 });

  // Only the sync cron may hit API-Sports; users are served cache-only so their
  // traffic never burns the upstream quota. See team-stats for the same pattern.
  const syncSecret = process.env.CRON_SECRET;
  const isSyncCall = !!syncSecret && req.headers.get("x-sync-secret") === syncSecret;

  try {
    if (!isSyncCall) {
      const { data, found } = await readCacheOnly(id, "quarters");
      return NextResponse.json({ ...((found ? data : { response: [] }) as any), cached: true });
    }

    const { data, fromCache } = await withCache(
      id, "quarters", isFinal ? 90 : 30, () => fetchQuarters(id), isFinal
    );
    return NextResponse.json({ ...(data as any), cached: fromCache });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
