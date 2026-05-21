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

/** Fantasy points formula */
function computeFP(stats: any): number {
  const n = (v: any) => Number(v ?? 0);
  return (
    n(stats.kicks)        * 3 +
    n(stats.handballs)    * 2 +
    n(stats.marks)        * 3 +
    n(stats.tackles)      * 4 +
    n(stats.freesFor)     * 1 +
    n(stats.freesAgainst) * -3 +
    n(stats.hitouts)      * 1 +
    n(stats.goals)        * 6 +
    n(stats.behinds)      * 1
  );
}

/** Fetch current player stats from API-Sports and return a map of player_id -> fp */
async function fetchPlayerFPMap(gameId: string): Promise<Map<number, number>> {
  const fpMap = new Map<number, number>();
  try {
    const res = await fetch(
      `${API_BASE}/games/statistics/players?id=${gameId}`,
      {
        headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
        cache: "no-store",
      }
    );
    if (!res.ok) return fpMap;

    const data = await res.json();
    const teams: any[] = data?.response?.[0]?.teams ?? [];

    for (const team of teams) {
      for (const playerEntry of team.players ?? []) {
        const pid = playerEntry?.player?.id;
        if (!pid) continue;

        // Stat fields may be nested under playerEntry.statistics or flat
        const s = playerEntry.statistics ?? playerEntry;
        const stats = {
          kicks:        s.kicks        ?? s.Kicks        ?? 0,
          handballs:    s.handballs    ?? s.Handballs    ?? 0,
          marks:        s.marks        ?? s.Marks        ?? 0,
          tackles:      s.tackles      ?? s.Tackles      ?? 0,
          freesFor:     s.freesFor     ?? s.frees_for    ?? s.FreesFor    ?? 0,
          freesAgainst: s.freesAgainst ?? s.frees_against ?? s.FreesAgainst ?? 0,
          hitouts:      s.hitouts      ?? s.Hitouts      ?? 0,
          goals:        s.goals        ?? s.Goals        ?? 0,
          behinds:      s.behinds      ?? s.Behinds      ?? 0,
        };
        fpMap.set(Number(pid), computeFP(stats));
      }
    }
  } catch {
    // If the stats fetch fails, we just won't have FP — not fatal
  }
  return fpMap;
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

  // Fetch player FP map in parallel with DB work below
  const fpMapPromise = fetchPlayerFPMap(gameId);

  const supabase = adminSupabase();

  // Build deduplicated real event rows from API-Sports
  const key = (r: any) =>
    `${r.period}|${r.minute}|${r.type}|${r.team_id}|${r.player_id}|${r.home_score}|${r.away_score}`;

  const rawRows = Array.from(
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
  const apiKeys = new Set(rawRows.map(key));
  if (
    realExisting.length === rawRows.length &&
    realExisting.every((r: any) => apiKeys.has(key(r)))
  ) {
    return NextResponse.json({ synced: true, inserted: 0 });
  }

  // Wait for FP map now that we know we'll need it
  const fpMap = await fpMapPromise;

  // Attach player_fp to each row
  const apiRows = rawRows.map((row) => ({
    ...row,
    player_fp: row.player_id != null ? (fpMap.get(Number(row.player_id)) ?? null) : null,
  }));

  // Delete inferred events that a real event now covers.
  const inferred = (existing ?? []).filter((r: any) => r.inferred);
  const toDeleteIds: number[] = [];

  for (const real of apiRows) {
    if (real.home_score != null && real.away_score != null) {
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
