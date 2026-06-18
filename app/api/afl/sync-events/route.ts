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

    const statsMap = await statsMapPromise;

    // Score-independent identity for a player-attributed (real) event. We KEEP
    // each placeholder's Squiggle scores rather than overwrite them, so the
    // per-event scores can't be used for matching across syncs — but period /
    // minute / type / team / player are stable.
    const matchKey = (r: any) =>
      `${r.period}|${r.minute}|${r.type}|${r.team_id}|${r.player_id}`;

    // Rows already attributed to a player. Everything on these is frozen at
    // first write, so we leave them completely untouched on later syncs.
    const realByKey = new Map<string, any>();
    for (const r of existing ?? []) {
      if (r.player_id != null) realByKey.set(matchKey(r), r);
    }

    // Squiggle-created placeholders still awaiting a player, grouped by
    // team+type, oldest first. API-Sports UPDATES one of these in place (keeping
    // its row id) when the matching play arrives, instead of inserting a
    // parallel row — so comments/reactions made on the placeholder ride along
    // onto the now player-attributed event.
    const placeholdersByTeamType = new Map<string, any[]>();
    for (const r of existing ?? []) {
      if (r.player_id != null) continue;
      const k = `${r.team_id}|${String(r.type ?? "").toUpperCase()}`;
      const list = placeholdersByTeamType.get(k) ?? [];
      list.push(r);
      placeholdersByTeamType.set(k, list);
    }
    for (const list of placeholdersByTeamType.values()) {
      list.sort((a: any, b: any) => Number(a.id ?? 0) - Number(b.id ?? 0));
    }
    const placeholderCursor = new Map<string, number>();

    // Nothing new to attribute → done.
    if (rawRows.every((row) => realByKey.has(matchKey(row)))) {
      if (isFinal) await markSyncFinal(gameId);
      return NextResponse.json({ synced: true, updated: 0, inserted: 0 });
    }

    // The goal count on an event box reflects the moment it happened, then stays
    // frozen. We derive each event's tally purely from event ORDER (events arrive
    // chronologically), counted over ALL events every sync so it never drifts.
    const goalCounter = new Map<number, number>();
    const toUpdate: { id: any; patch: Record<string, unknown> }[] = [];
    const toInsert: Record<string, unknown>[] = [];

    for (const row of rawRows) {
      let runningGoals: number | null = null;
      if (row.player_id != null) {
        const pid = Number(row.player_id);
        const prev = goalCounter.get(pid) ?? 0;
        // The events API reports types lower-case ("goal"/"behind").
        const isGoal = String(row.type ?? "").toUpperCase() === "GOAL";
        const next = isGoal ? prev + 1 : prev;
        goalCounter.set(pid, next);
        runningGoals = next;
      }

      // Already attributed in a prior sync → frozen, leave it alone.
      if (realByKey.has(matchKey(row))) continue;

      // Snapshot the player's stat line once, the moment they're attributed.
      const snapshot = row.player_id != null ? statsMap.get(Number(row.player_id)) : undefined;
      const playerFields: Record<string, unknown> = {
        player_id: row.player_id,
        player_name: row.player_name,
        period: row.period,
        minute: row.minute,
        inferred: false,
        player_fp: snapshot?.fp ?? null,
        player_foopy: snapshot?.foopy ?? null,
        player_disposals: snapshot?.disposals ?? null,
        player_tackles: snapshot?.tackles ?? null,
        player_marks: snapshot?.marks ?? null,
        player_hitouts: snapshot?.hitouts ?? null,
        player_goals: runningGoals,
      };

      // Attach to a waiting Squiggle placeholder (UPDATE in place — keeps the
      // row id and its comments/reactions). If none is waiting (e.g. the goal
      // happened before anyone opened the match, so no placeholder was ever
      // created), INSERT a fresh row.
      const ttKey = `${row.team_id}|${String(row.type ?? "").toUpperCase()}`;
      const list = placeholdersByTeamType.get(ttKey) ?? [];
      const cursor = placeholderCursor.get(ttKey) ?? 0;
      if (cursor < list.length) {
        placeholderCursor.set(ttKey, cursor + 1);
        toUpdate.push({ id: list[cursor].id, patch: playerFields });
      } else {
        toInsert.push({
          api_game_id: gameId,
          type: row.type,
          team_id: row.team_id,
          home_score: row.home_score,
          away_score: row.away_score,
          ...playerFields,
        });
      }
    }

    for (const u of toUpdate) {
      const { error } = await supabase.from("live_game_feed").update(u.patch).eq("id", u.id);
      if (error) console.error("[sync-events] update error:", error.message);
    }
    if (toInsert.length) {
      const { error: insertError } = await supabase.from("live_game_feed").insert(toInsert);
      if (insertError) console.error("[sync-events] insert error:", insertError.message);
    }

    if (isFinal) await markSyncFinal(gameId);
    return NextResponse.json({ synced: true, updated: toUpdate.length, inserted: toInsert.length });

  } finally {
    inFlightSync.delete(gameId);
  }
}
