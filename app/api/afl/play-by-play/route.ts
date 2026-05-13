import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = "https://v1.afl.api-sports.io";
const CACHE_MS = 60_000;

const cache = new Map<string, { time: number; data: any }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");

  if (!gameId) {
    return NextResponse.json({ error: "Missing game id" }, { status: 400 });
  }

  const now = Date.now();
  const cached = cache.get(gameId);

  // Serve from cache if still fresh
  const payload = cached && now - cached.time < CACHE_MS
    ? cached.data
    : await fetchAndCache(gameId, now);

  // If the client already has this many events, skip sending the full payload
  const knownTotal = searchParams.get("knownTotal");
  if (knownTotal !== null && parseInt(knownTotal) === payload.total) {
    return NextResponse.json({ total: payload.total, unchanged: true });
  }

  return NextResponse.json(payload);
}

async function fetchAndCache(gameId: string, now: number) {
  const res = await fetch(`${API_BASE}/games/events?id=${gameId}`, {
    headers: {
      "x-apisports-key": process.env.API_SPORTS_AFL_KEY || "",
    },
    cache: "no-store",
  });

  const data = await res.json();
  const rawEvents = data?.response?.[0]?.events ?? [];

  const events = rawEvents.map((event: any) => ({
    quarter: `Q${event.period}`,
    period: event.period,
    minute: event.minute,
    type: event.type,
    teamId: event.team?.id,
    playerId: event.player?.id,
    playerName: event.player?.name ?? null,
    text: `${String(event.type || "event").toUpperCase()} · Team ID ${
      event.team?.id ?? "-"
    } · Player ID ${event.player?.id ?? "-"}`,
  }));

  const payload = {
    gameId,
    events,
    total: events.length,
    cached: false,
  };

  cache.set(gameId, { time: now, data: payload });
  return payload;
}
