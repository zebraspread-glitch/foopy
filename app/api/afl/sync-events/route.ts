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
  const last = lastSync.get(gameId) ?? 0;

  if (now - last < COOLDOWN_MS) {
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
  const apiRows = rawEvents.map((e: any) => ({
    api_game_id: gameId,
    period: e.period ?? e.quarter ?? null,
    minute: e.minute ?? null,
    type: e.type ?? null,
    team_id: e.team?.id ?? null,
    player_id: e.player?.id ?? null,
    player_name: e.player?.name ?? null,
    home_score: e.homeScore ?? e.home_score ?? e.score?.home ?? e.scores?.home ?? null,
    away_score: e.awayScore ?? e.away_score ?? e.score?.away ?? e.scores?.away ?? null,
  }));

  const key = (r: any) =>
    `${r.period}|${r.minute}|${r.type}|${r.team_id}|${r.player_id}|${r.home_score}|${r.away_score}`;

  const uniqueRows = Array.from(new Map(apiRows.map((row) => [key(row), row])).values());

  const { data: existing, error: fetchError } = await supabase
    .from("live_game_feed")
    .select("id, period, minute, type, team_id, player_id, home_score, away_score, inferred")
    .eq("api_game_id", gameId)
    .order("period", { ascending: true })
    .order("minute", { ascending: true });

  if (fetchError) {
    lastSync.delete(gameId);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Compare only against real (non-inferred) rows to avoid unnecessary replaces
  const uniqueKeys = new Set(uniqueRows.map(key));
  const realExisting = (existing ?? []).filter((row: any) => !row.inferred);
  const alreadyMatches =
    realExisting.length === uniqueRows.length &&
    realExisting.every((row: any) => uniqueKeys.has(key(row)));

  if (alreadyMatches) {
    return NextResponse.json({ synced: true, inserted: 0 });
  }

  // Delete inferred events that are now covered by a real event (same team+type+score)
  const realCoverageKeys = new Set(
    uniqueRows.map((r) => `${r.team_id}|${r.type}|${r.home_score}|${r.away_score}`)
  );
  const inferredToDelete = (existing ?? [])
    .filter((r: any) => r.inferred && realCoverageKeys.has(`${r.team_id}|${r.type}|${r.home_score}|${r.away_score}`))
    .map((r: any) => r.id);

  if (inferredToDelete.length > 0) {
    await supabase.from("live_game_feed").delete().in("id", inferredToDelete);
  }

  // Delete all real (non-inferred) events for this game, then reinsert fresh from API
  const { error: deleteError } = await supabase
    .from("live_game_feed")
    .delete()
    .eq("api_game_id", gameId)
    .eq("inferred", false);

  if (deleteError) {
    lastSync.delete(gameId);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("live_game_feed").insert(uniqueRows);

  if (insertError) {
    lastSync.delete(gameId);
    console.error("[sync-events] insert error:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ synced: true, replaced: true, total: uniqueRows.length });
}
