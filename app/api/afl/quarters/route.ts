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

  const syncSecret = process.env.CRON_SECRET;
  const isSyncCall = syncSecret && req.headers.get("x-sync-secret") === syncSecret;

  try {
    if (isSyncCall) {
      const { data, fromCache } = await withCache(id, "quarters", isFinal ? 90 : 65, () => fetchQuarters(id), isFinal);
      return NextResponse.json({ ...(data as any), cached: fromCache });
    }

    const { data, found } = await readCacheOnly(id, "quarters");
    if (!found) return NextResponse.json({ response: [] });
    return NextResponse.json({ ...(data as any), cached: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
