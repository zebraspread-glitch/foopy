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
  tackles: number;
  marks: number;
  hitouts: number;
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
          tackles: Number(stats.tackles) || 0,
          marks: Number(stats.marks) || 0,
          hitouts: Number(stats.hitouts) || 0,
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
      .select("id, period, minute, type, team_id, player_id, home_score, away_score, inferred, player_fp, player_foopy, player_disposals, player_goals, player_tackles, player_marks, player_hitouts")
      .eq("api_game_id", gameId);

    const realExisting = (existing ?? []).filter((r: any) => !r.inferred);
    const existingSnapshotMap = new Map<string, Partial<PlayerSnapshot>>(
      realExisting.map((r: any) => [key(r), {
        // Everything on an event box is frozen at first write and read back here
        // on later syncs so the stored values are reused verbatim, never changed.
        fp: r.player_fp ?? null,
        foopy: r.player_foopy ?? null,
        disposals: r.player_disposals ?? null,
        goals: r.player_goals ?? null,
        tackles: r.player_tackles ?? null,
        marks: r.player_marks ?? null,
        hitouts: r.player_hitouts ?? null,
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

    // The goal count on an event box must reflect the moment the event happened
    // and then stay frozen: Jasper's FIRST goal box must always read "1 GOAL",
    // even after he kicks his second. So we derive each event's goal tally
    // purely from event ORDER — events arrive chronologically, so the Nth GOAL
    // event for a player is that player's Nth goal. This count is identical on
    // every sync, so the box never drifts.
    //
    // We deliberately do NOT fold in the player's cumulative goal total from the
    // games/statistics/players snapshot. That total reflects *now*: if the first
    // goal's row is first synced after the second goal is already on the board
    // (the events feed and the stats snapshot can both lag), the cumulative total
    // is 2 and the first goal box would wrongly read "2 GOALS".
    const goalCounter = new Map<number, number>();

    const apiRows = rawRows.map((row) => {
      const k = key(row);
      const stored = existingSnapshotMap.get(k);
      const isNew = !existingSnapshotMap.has(k);
      const snapshot = row.player_id != null ? statsMap.get(Number(row.player_id)) : undefined;

      let runningGoals: number | null = null;
      if (row.player_id != null) {
        const pid = Number(row.player_id);
        const prev = goalCounter.get(pid) ?? 0;
        // The events API reports types lower-case ("goal"/"behind"), so we must
        // normalise before counting — a raw === "GOAL" never matches and the
        // tally would stay stuck at 0, showing every goal box as "0 GOALS".
        const isGoal = String(row.type ?? "").toUpperCase() === "GOAL";
        const next = isGoal ? prev + 1 : prev;
        goalCounter.set(pid, next);
        runningGoals = next;
      }

      return {
        ...row,
        // FP / foopy / disposals are snapshotted once, when the event is first
        // seen, then frozen (existing rows keep their stored value) so the box
        // never changes as the player accumulates more during the game.
        player_fp: isNew ? (snapshot?.fp ?? null) : (stored?.fp ?? null),
        player_foopy: isNew ? (snapshot?.foopy ?? null) : (stored?.foopy ?? null),
        player_disposals: isNew ? (snapshot?.disposals ?? null) : (stored?.disposals ?? null),
        // Tackles / marks / hitouts are snapshotted and frozen the same way, so
        // the box can show whichever the player had most of at the time (T/M/HO).
        player_tackles: isNew ? (snapshot?.tackles ?? null) : (stored?.tackles ?? null),
        player_marks: isNew ? (snapshot?.marks ?? null) : (stored?.marks ?? null),
        player_hitouts: isNew ? (snapshot?.hitouts ?? null) : (stored?.hitouts ?? null),
        // A new row records the event-order tally at the moment it's scored;
        // existing rows keep their stored value untouched, so the count is frozen
        // for good and the box can never change. (A legacy row with no stored
        // count falls back to the deterministic tally to backfill it once.)
        player_goals: isNew ? runningGoals : (stored?.goals ?? runningGoals),
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

    // Real rows are always replaced by the freshly-inserted apiRows. Inferred
    // rows are placeholders created instantly from Squiggle score changes:
    // delete only the ones now COVERED by a real event (the first realCount per
    // team+type, oldest first) and keep the rest, so not-yet-synced goals and
    // rushed behinds (which never get a real event) survive. This mirrors the
    // count-based matching the client uses to display the feed.
    const realCountByKey = new Map<string, number>();
    for (const r of apiRows) {
      const k = `${r.team_id}|${String(r.type ?? "").toUpperCase()}`;
      realCountByKey.set(k, (realCountByKey.get(k) ?? 0) + 1);
    }

    const inferredByKey = new Map<string, any[]>();
    const oldRealIds: any[] = [];
    for (const r of existing ?? []) {
      if (r.id == null) continue;
      if (!r.inferred) { oldRealIds.push(r.id); continue; }
      const k = `${r.team_id}|${String(r.type ?? "").toUpperCase()}`;
      const list = inferredByKey.get(k) ?? [];
      list.push(r);
      inferredByKey.set(k, list);
    }

    const coveredInferredIds: any[] = [];
    for (const [k, list] of inferredByKey) {
      list.sort((a: any, b: any) => Number(a.id ?? 0) - Number(b.id ?? 0));
      const cover = Math.min(realCountByKey.get(k) ?? 0, list.length);
      for (let i = 0; i < cover; i++) coveredInferredIds.push(list[i].id);
    }

    const oldIds = [...oldRealIds, ...coveredInferredIds];
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
