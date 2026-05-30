import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { claimSync, markSyncFinal } from "@/app/lib/matchCache";

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

async function fetchPlayerFPMap(gameId: string): Promise<Map<number, number>> {
  const fpMap = new Map<number, number>();
  try {
    const res = await fetch(`${API_BASE}/games/statistics/players?id=${gameId}`, {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return fpMap;
    const data = await res.json();
    for (const team of data?.response?.[0]?.teams ?? []) {
      for (const entry of team.players ?? []) {
        const pid = entry?.player?.id;
        if (!pid) continue;
        const s = entry.statistics ?? entry;
        fpMap.set(Number(pid), computeFP({
          kicks:        s.kicks        ?? s.Kicks        ?? 0,
          handballs:    s.handballs    ?? s.Handballs    ?? 0,
          marks:        s.marks        ?? s.Marks        ?? 0,
          tackles:      s.tackles      ?? s.Tackles      ?? 0,
          freesFor:     s.freesFor     ?? s.frees_for    ?? s.FreesFor    ?? 0,
          freesAgainst: s.freesAgainst ?? s.frees_against ?? s.FreesAgainst ?? 0,
          hitouts:      s.hitouts      ?? s.Hitouts      ?? 0,
          goals:        s.goals        ?? s.Goals        ?? 0,
          behinds:      s.behinds      ?? s.Behinds      ?? 0,
        }));
      }
    }
  } catch { /* non-fatal */ }
  return fpMap;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId  = searchParams.get("id");
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
    // ── 1. Fetch APISports events ─────────────────────────────────────────────
    const res = await fetch(`${API_BASE}/games/events?id=${gameId}`, {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[sync-events] APISports ${res.status} for game ${gameId}`);
      return NextResponse.json({ error: "External API failed" }, { status: 502 });
    }

    const data     = await res.json();
    const rawEvents: any[] = data?.response?.[0]?.events ?? [];

    if (rawEvents.length === 0) {
      if (isFinal) await markSyncFinal(gameId);
      return NextResponse.json({ synced: true, confirmed: 0 });
    }

    // ── 2. Deduplicate APISports events by a composite key ───────────────────
    const eventKey = (e: any) =>
      `${e.period ?? e.quarter}|${e.minute}|${e.type}|${e.team?.id}|${e.player?.id}`;

    const apiEvents = Array.from(
      new Map(rawEvents.map((e: any) => [eventKey(e), e])).values()
    );

    const supabase   = adminSupabase();
    const fpMapProm  = fetchPlayerFPMap(gameId);

    // ── 3. Load all existing feed rows for this game ─────────────────────────
    // Note: status/source/squiggle_key columns only exist after SQL migration.
    // We intentionally omit them here so this works before migration too.
    const { data: existing } = await supabase
      .from("live_game_feed")
      .select("id, period, minute, type, team_id, player_id, home_score, away_score, inferred, player_fp")
      .eq("api_game_id", gameId);

    const allRows   = existing ?? [];
    const pending   = allRows.filter((r: any) => r.inferred === true);
    const confirmed = allRows.filter((r: any) => r.inferred === false);

    // Build a set of already-confirmed event keys so we don't double-insert
    const confirmedKeySet = new Set(
      confirmed.map((r: any) =>
        `${r.period}|${r.minute}|${r.type}|${r.team_id}|${r.player_id}`
      )
    );

    const fpMap = await fpMapProm;

    let updatedCount = 0;
    let insertedCount = 0;

    // Track which pending row IDs were matched (so we can clean up unmatched ones)
    const matchedPendingIds = new Set<number>();

    for (const e of apiEvents) {
      const period    = e.period   ?? e.quarter ?? null;
      const minute    = e.minute   ?? null;
      const type      = e.type     ?? null;
      const teamId    = e.team?.id ?? null;
      const playerId  = e.player?.id  ?? null;
      const playerName = e.player?.name ?? null;
      const homeScore = e.homeScore ?? e.home_score ?? e.score?.home ?? e.scores?.home ?? null;
      const awayScore = e.awayScore ?? e.away_score ?? e.score?.away ?? e.scores?.away ?? null;
      const playerFP  = playerId != null ? (fpMap.get(Number(playerId)) ?? null) : null;

      if (!type || !teamId) continue; // skip malformed events

      const ck = `${period}|${minute}|${type}|${teamId}|${playerId}`;

      // Skip events already confirmed in the DB
      if (confirmedKeySet.has(ck)) {
        // Still update FP if it changed
        const existing = confirmed.find(
          (r: any) => r.period === period && r.minute === minute &&
                       r.type === type && r.team_id === teamId && r.player_id === playerId
        );
        if (existing && playerFP != null && existing.player_fp !== playerFP) {
          await supabase
            .from("live_game_feed")
            .update({ player_fp: playerFP })
            .eq("id", existing.id);
        }
        continue;
      }

      // ── Try to match a pending (inferred) event ───────────────────────────
      // Match on team + type + (period if both non-null) + score snapshot if available
      const pendingMatch = pending.find((p: any) => {
        if (matchedPendingIds.has(p.id)) return false;
        if (p.team_id !== teamId || p.type !== type) return false;
        // Period check: only enforce if both have a period value
        if (p.period != null && period != null && p.period !== period) return false;
        // Score snapshot match (most precise) — if both have scores, they must match
        if (homeScore != null && awayScore != null && p.home_score != null && p.away_score != null) {
          return Number(p.home_score) === Number(homeScore) &&
                 Number(p.away_score) === Number(awayScore);
        }
        return true;
      });

      if (pendingMatch) {
        // ── UPDATE pending → confirmed ───────────────────────────────────────
        matchedPendingIds.add(pendingMatch.id);
        const updatePayload: any = {
          minute,
          player_id:   playerId,
          player_name: playerName,
          home_score:  homeScore,
          away_score:  awayScore,
          player_fp:   playerFP,
          inferred:    false,
        };
        // Add new columns only if SQL migration has been run
        // (inserting unknown columns returns a 42703 error which we handle below)
        updatePayload.status = "confirmed";
        updatePayload.source = "apisports";

        const { error: updateErr } = await supabase
          .from("live_game_feed")
          .update(updatePayload)
          .eq("id", pendingMatch.id);

        if (updateErr) {
          // 42703 = column doesn't exist yet (SQL migration pending) — retry without new columns
          if (updateErr.code === "42703" || updateErr.message?.includes("column")) {
            await supabase.from("live_game_feed").update({
              minute, player_id: playerId, player_name: playerName,
              home_score: homeScore, away_score: awayScore,
              player_fp: playerFP, inferred: false,
            }).eq("id", pendingMatch.id);
          } else {
            console.error("[sync-events] update error:", updateErr.message, { pendingId: pendingMatch.id });
          }
        } else {
          updatedCount++;
          console.log(`[sync-events] ✅ confirmed pending event id=${pendingMatch.id} player="${playerName}" type=${type}`);
        }
      } else {
        // ── INSERT as a new confirmed event ──────────────────────────────────
        const insertPayload: any = {
          api_game_id: String(gameId),
          period, minute, type,
          team_id: teamId, player_id: playerId, player_name: playerName,
          home_score: homeScore, away_score: awayScore,
          player_fp: playerFP, inferred: false,
          status: "confirmed", source: "apisports",
        };
        let { error: insertErr } = await supabase.from("live_game_feed").insert(insertPayload);
        // Retry without new columns if SQL migration hasn't run yet
        if (insertErr && (insertErr.code === "42703" || insertErr.message?.includes("column"))) {
          const { error: fallback } = await supabase.from("live_game_feed").insert({
            api_game_id: String(gameId),
            period, minute, type,
            team_id: teamId, player_id: playerId, player_name: playerName,
            home_score: homeScore, away_score: awayScore,
            player_fp: playerFP, inferred: false,
          });
          insertErr = fallback;
        }

        if (insertErr) {
          // Duplicate — already confirmed from a previous sync, skip silently
          if (insertErr.code === "23505" || insertErr.message?.includes("unique")) continue;
          console.error("[sync-events] insert error:", insertErr.message, { type, teamId });
        } else {
          insertedCount++;
          console.log(`[sync-events] ✅ inserted confirmed event player="${playerName}" type=${type}`);
        }
      }
    }

    // ── 4. Clean up remaining pending events ─────────────────────────────────
    const unmatched = pending.filter((p: any) => !matchedPendingIds.has(p.id));

    // Case A: pending event is already covered by a confirmed event in the DB.
    // This happens when APISports confirmed the event BEFORE squiggle-check inserted
    // the pending row (squiggle runs every 5s, APISports every 10s — they can race).
    // Use score-based match (no team_id) since both sides may use different team IDs.
    const coveredIds: number[] = [];
    const genuinelyUnmatched: any[] = [];

    for (const p of unmatched) {
      const coveredByScore =
        p.home_score != null && p.away_score != null &&
        confirmed.some((c: any) =>
          c.type === p.type &&
          Number(c.home_score) === Number(p.home_score) &&
          Number(c.away_score) === Number(p.away_score)
        );

      if (coveredByScore) {
        coveredIds.push(p.id);
      } else {
        genuinelyUnmatched.push(p);
      }
    }

    if (coveredIds.length > 0) {
      await supabase.from("live_game_feed").delete().in("id", coveredIds);
      console.log(`[sync-events] deleted ${coveredIds.length} pending events already covered by confirmed events`, coveredIds);
    }

    // Case B: genuinely unmatched — APISports doesn't have them yet (or rushed behind etc.)
    // Mark as "unconfirmed" so they stay in the feed as basic team events.
    if (genuinelyUnmatched.length > 0) {
      const ids = genuinelyUnmatched.map((p: any) => p.id);
      await supabase.from("live_game_feed").update({ status: "unconfirmed" }).in("id", ids);
      console.log(`[sync-events] marked ${ids.length} pending events as unconfirmed`, ids);
    }

    if (isFinal) await markSyncFinal(gameId);

    console.log(`[sync-events] game=${gameId} updated=${updatedCount} inserted=${insertedCount} unconfirmed=${unmatched.length}`);
    return NextResponse.json({ synced: true, updated: updatedCount, inserted: insertedCount, unconfirmed: unmatched.length });

  } finally {
    inFlightSync.delete(gameId);
  }
}
