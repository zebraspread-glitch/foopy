import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { claimSync, markSyncFinal } from "@/app/lib/matchCache";
import { foopyRating, rawPlayerToStats } from "@/app/lib/foopyRating";

export const dynamic = "force-dynamic";

const API_BASE = "https://v1.afl.api-sports.io";
const COOLDOWN_S = 10;

const inFlightSync = new Set<string>();

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

interface PlayerSnapshot {
  fp: number;
  foopy: number;
  disposals: number;
  goals: number;
}

async function fetchPlayerStatsMap(gameId: string): Promise<Map<number, PlayerSnapshot>> {
  const snapshotMap = new Map<number, PlayerSnapshot>();
  try {
    const res = await fetch(
      `${API_BASE}/games/statistics/players?id=${gameId}`,
      {
        headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
        cache: "no-store",
      }
    );
    if (!res.ok) return snapshotMap;

    const data = await res.json();
    const teams: any[] = data?.response?.[0]?.teams ?? [];

    for (const team of teams) {
      for (const playerEntry of team.players ?? []) {
        const pid = playerEntry?.player?.id;
        if (!pid) continue;
        const stats = rawPlayerToStats(playerEntry);
        snapshotMap.set(Number(pid), {
          fp: computeFP(stats),
          foopy: foopyRating(stats),
          disposals: Number(stats.disposals) || (Number(stats.kicks) + Number(stats.handballs)),
          goals: Number(stats.goals),
        });
      }
    }
  } catch {
    // Non-fatal
  }
  return snapshotMap;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");
  const isFinal = searchParams.get("final") === "true";

  if (!gameId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (inFlightSync.has(gameId)) {
    return NextResponse.json({ synced: false, reason: "in-flight" });
  }

  const shouldProceed = await claimSync(gameId, COOLDOWN_S);
  if (!shouldProceed) {
    return NextResponse.json({ synced: false, reason: "cooldown" });
  }

  inFlightSync.add(gameId);

  try {
    const res = await fetch(`${API_BASE}/games/events?id=${gameId}`, {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "External API failed" }, { status: 502 });
    }

    const data = await res.json();
    const rawEvents: any[] = data?.response?.[0]?.events ?? [];

    if (rawEvents.length === 0) {
      if (isFinal) await markSyncFinal(gameId);
      return NextResponse.json({ synced: true, inserted: 0 });
    }

    const statsMapPromise = fetchPlayerStatsMap(gameId);
    const supabase = adminSupabase();

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

    const { data: existing } = await supabase
      .from("live_game_feed")
      .select("id, period, minute, type, team_id, player_id, home_score, away_score, inferred, player_fp, player_foopy, player_disposals, player_goals")
      .eq("api_game_id", gameId);

    const realExisting = (existing ?? []).filter((r: any) => !r.inferred);
    const existingSnapshotMap = new Map<string, Partial<PlayerSnapshot>>(
      realExisting.map((r: any) => [key(r), {
        fp: r.player_fp ?? null,
        foopy: r.player_foopy ?? null,
        disposals: r.player_disposals ?? null,
        goals: r.player_goals ?? null,
      }])
    );

    const apiKeys = new Set(rawRows.map(key));
    if (
      realExisting.length === rawRows.length &&
      realExisting.every((r: any) => apiKeys.has(key(r)))
    ) {
      if (isFinal) await markSyncFinal(gameId);
      return NextResponse.json({ synced: true, inserted: 0 });
    }

    const statsMap = await statsMapPromise;

    // The games/statistics/players snapshot can lag behind games/events — a
    // goal might appear in the events feed before the stats API has updated
    // the player's goal tally. Track a running per-player goal count from the
    // events themselves (which are in chronological order) and use whichever
    // is higher, so a freshly-kicked goal is never shown as "0 GOAL/S".
    const goalCounter = new Map<number, number>();

    const apiRows = rawRows.map((row) => {
      const k = key(row);
      const stored = existingSnapshotMap.get(k);
      const isNew = !existingSnapshotMap.has(k);
      const snapshot = row.player_id != null ? statsMap.get(Number(row.player_id)) : undefined;

      let runningGoals: number | undefined;
      if (row.player_id != null) {
        const pid = Number(row.player_id);
        const prev = goalCounter.get(pid) ?? 0;
        const next = row.type === "GOAL" ? prev + 1 : prev;
        goalCounter.set(pid, next);
        runningGoals = next;
      }

      // The running count is deterministic from event order alone, so it's safe
      // to apply even to previously-synced rows — it only ever corrects a stale
      // 0/low snapshot up to the true cumulative count, never changes a correct one.
      const goals = isNew
        ? Math.max(snapshot?.goals ?? 0, runningGoals ?? 0)
        : Math.max(stored?.goals ?? 0, runningGoals ?? 0);

      return {
        ...row,
        player_fp: isNew ? (snapshot?.fp ?? null) : (stored?.fp ?? null),
        player_foopy: isNew ? (snapshot?.foopy ?? null) : (stored?.foopy ?? null),
        player_disposals: isNew ? (snapshot?.disposals ?? null) : (stored?.disposals ?? null),
        player_goals: goals,
      };
    });

    // Insert the fresh rows first, then delete the old ones — if the insert
    // fails (e.g. schema mismatch), the existing rows are left intact instead
    // of being wiped out.
    const { error: insertError } = await supabase.from("live_game_feed").insert(apiRows);

    if (insertError) {
      console.error("[sync-events] insert error:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const oldIds = (existing ?? []).map((r: any) => r.id).filter((id: any) => id != null);
    if (oldIds.length) {
      const { error: deleteError } = await supabase.from("live_game_feed").delete().in("id", oldIds);
      if (deleteError) console.error("[sync-events] delete error:", deleteError.message);
    }

    if (isFinal) await markSyncFinal(gameId);
    return NextResponse.json({ synced: true, replaced: true, total: apiRows.length });

  } finally {
    inFlightSync.delete(gameId);
  }
}
