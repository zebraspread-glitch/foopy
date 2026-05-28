import { NextResponse } from "next/server";
import { withCache } from "@/app/lib/matchCache";

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
    text: `${String(event.type || "event").toUpperCase()} · Team ID ${
      event.team?.id ?? "-"
    } · Player ID ${event.player?.id ?? "-"}`,
  }));

  return { gameId, events, total: events.length };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";

  if (!gameId) return NextResponse.json({ error: "Missing game id" }, { status: 400 });

  try {
    const { data: payload, fromCache } = await withCache(
      gameId,
      "events",
      10,
      () => fetchEvents(gameId),
      isFinal
    );

    const knownTotal = searchParams.get("knownTotal");
    if (knownTotal !== null && parseInt(knownTotal) === (payload as any).total) {
      return NextResponse.json({ total: (payload as any).total, unchanged: true });
    }

    return NextResponse.json({ ...(payload as any), cached: fromCache });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
