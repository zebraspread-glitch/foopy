import { NextResponse } from "next/server";
import { withCache, readCacheOnly } from "@/app/lib/matchCache";

export const dynamic = "force-dynamic";

const API_BASE = "https://v1.afl.api-sports.io";

async function fetchEvents(gameId: string) {
  const res = await fetch(`${API_BASE}/games/events?id=${gameId}`, {
    headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API-Sports events failed: ${res.status}`);

  const data = await res.json();
  const rawEvents: any[] = data?.response?.[0]?.events ?? [];

  const events = rawEvents.map((event: any) => ({
    quarter: `Q${event.period}`,
    period: event.period,
    minute: event.minute,
    type: event.type,
    teamId: event.team?.id,
    playerId: event.player?.id,
    playerName: event.player?.name ?? null,
    text: `${String(event.type || "event").toUpperCase()} · Team ID ${event.team?.id ?? "-"} · Player ID ${event.player?.id ?? "-"}`,
  }));

  return { gameId, events, total: events.length };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";

  if (!gameId) return NextResponse.json({ error: "Missing game id" }, { status: 400 });

  // Only the sync cron may hit API-Sports; users are served cache-only so their
  // traffic never burns the upstream quota. See team-stats for the same pattern.
  const syncSecret = process.env.CRON_SECRET;
  const isSyncCall = !!syncSecret && req.headers.get("x-sync-secret") === syncSecret;

  try {
    const { data: payload, fromCache } = isSyncCall
      ? await withCache(gameId, "events", 10, () => fetchEvents(gameId), isFinal)
      : await (async () => {
          const { data, found } = await readCacheOnly<any>(gameId, "events");
          return { data: found ? data : { gameId, events: [], total: 0 }, fromCache: true };
        })();

    const knownTotal = searchParams.get("knownTotal");
    if (knownTotal !== null && parseInt(knownTotal) === (payload as any).total) {
      return NextResponse.json({ total: (payload as any).total, unchanged: true });
    }

    return NextResponse.json({ ...(payload as any), cached: fromCache });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
