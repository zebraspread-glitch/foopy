import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CACHE_MS = 30_000;
const cache = new Map<string, { time: number; data: any }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const now = Date.now();
  const cached = cache.get(id);

  if (cached && now - cached.time < CACHE_MS) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const res = await fetch(
    `https://v1.afl.api-sports.io/games/statistics/players?id=${id}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "API-Sports player stats failed", status: res.status },
      { status: 500 }
    );
  }

  const data = await res.json();
  cache.set(id, { time: now, data });

  return NextResponse.json(data);
}
