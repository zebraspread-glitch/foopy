import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const API_BASE = "https://v1.afl.api-sports.io";

const lastSync = new Map<string, number>();
const COOLDOWN_MS = 10_000;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");
  if (!gameId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const now = Date.now();
  if (now - (lastSync.get(gameId) ?? 0) < COOLDOWN_MS) {
    return NextResponse.json({ synced: false, reason: "cooldown" });
  }
  lastSync.set(gameId, now);

  const res = await fetch(`${API_BASE}/games/events?id=${gameId}`, {
    headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
    cache: "no-store",
  });

  if (!res.ok) {
    lastSync.delete(gameId);
    return NextResponse.json({ error: "External API failed" }, { status: 502 });
  }

  const data = await res.json();
  const rawEvents: any[] = data?.response?.[0]?.events ?? [];

  if (rawEvents.length === 0) {
    return NextResponse.json({ synced: true, inserted: 0 });
  }

  const supabase = adminSupabase();

  // Build deduplicated real event rows from API-Sports
  const key = (r: any) =>
    `${r.period}|${r.minute}|${r.type}|${r.team_id}|${r.player_id}|${r.home_score}|${r.away_score}`;

  const apiRows = Array.from(
    new Map(
      rawEvents.map((e: any) => {
        const row = {
          api_game_id: gameId,
          period: e.period ?? e.quarter ?? null,
          minute: e.minute ?? null,
          type: e.type ?? null,
          team_id: e.team?.id ?? null,
          player_id: e.player?.id ?? null,
          player_name: e.player?.name ?? null,
          home_score: e.homeScore ?? e.home_score ?? e.score?.home ?? e.scores?.home ?? null,
          away_score: e.awayScore ?? e.away_score ?? e.score?.away ?? e.scores?.away ?? null,
        };
        return [key(row), row];
      })
    ).values()
  );

  // Fetch all current events for this game
  const { data: existing } = await supabase
    .from("live_game_feed")
    .select("id, period, minute, type, team_id, player_id, home_score, away_score, inferred")
    .eq("api_game_id", gameId);

  const realExisting = (existing ?? []).filter((r: any) => !r.inferred);

  // Skip if real events are already identical
  const apiKeys = new Set(apiRows.map(key));
  if (
    realExisting.length === apiRows.length &&
    realExisting.every((r: any) => apiKeys.has(key(r)))
  ) {
    return NextResponse.json({ synced: true, inserted: 0 });
  }

  // Delete inferred events that a real event now covers.
  // Match by (team_id, type, home_score, away_score) when scores are known,
  // or by (team_id, type) in order (chronologically) when real event has no score.
  const inferred = (existing ?? []).filter((r: any) => r.inferred);
  const toDeleteIds: number[] = [];

  for (const real of apiRows) {
    if (real.home_score != null && real.away_score != null) {
      // Exact score match
      const match = inferred.find(
        (r: any) =>
          !toDeleteIds.includes(r.id) &&
          r.team_id === real.team_id &&
          r.type === real.type &&
          Number(r.home_score) === Number(real.home_score) &&
          Number(r.away_score) === Number(real.away_score)
      );
      if (match) toDeleteIds.push(match.id);
    } else {
      // No score on real event — match the earliest unclaimed inferred event of same team+type
      const match = inferred
        .filter((r: any) => !toDeleteIds.includes(r.id) && r.team_id === real.team_id && r.type === real.type)
        .sort((a: any, b: any) => (Number(a.home_score) || 0) - (Number(b.home_score) || 0))[0];
      if (match) toDeleteIds.push(match.id);
    }
  }

  if (toDeleteIds.length > 0) {
    await supabase.from("live_game_feed").delete().in("id", toDeleteIds);
  }

  // Replace all real events with fresh data from API-Sports
  await supabase.from("live_game_feed").delete().eq("api_game_id", gameId).eq("inferred", false);
  const { error } = await supabase.from("live_game_feed").insert(apiRows);

  if (error) {
    lastSync.delete(gameId);
    console.error("[sync-events] insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: true, replaced: true, total: apiRows.length });
}
