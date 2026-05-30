import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// How often (in seconds) this route will actually run per game.
// Multiple users calling it simultaneously → only one runs per COOLDOWN_S window.
const COOLDOWN_S = 4;

// Pending events older than this are marked unconfirmed (APISports never confirmed them).
const UNCONFIRMED_AFTER_S = 60;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Same mapping as page.tsx — team name → APISports team ID
const API_TEAM_ID_BY_NAME: Record<string, number> = {
  Adelaide: 1,         "Adelaide Crows": 1,
  Brisbane: 2,         "Brisbane Lions": 2,
  Carlton: 3,
  Collingwood: 4,
  Essendon: 5,
  Fremantle: 6,
  Geelong: 7,          "Geelong Cats": 7,
  Hawthorn: 8,         "Hawthorn Hawks": 8,
  Melbourne: 9,        "Melbourne Demons": 9,
  "North Melbourne": 10,
  "Port Adelaide": 11, "Port Adelaide Power": 11,
  Richmond: 12,        "Richmond Tigers": 12,
  "St Kilda": 13,      "St Kilda Saints": 13,
  Sydney: 14,          "Sydney Swans": 14,
  "West Coast": 15,    "West Coast Eagles": 15,
  "Western Bulldogs": 16,
  "Gold Coast": 17,    "Gold Coast Suns": 17,
  GWS: 18,             "GWS Giants": 18, "Greater Western Sydney": 18,
};

function getTeamId(name: string): number {
  return API_TEAM_ID_BY_NAME[name]
    ?? API_TEAM_ID_BY_NAME[name.replace(/\s+/g, " ").trim()]
    ?? 0;
}

interface SquiggleState {
  hgoals: number;
  hbehinds: number;
  agoals: number;
  abehinds: number;
}

// ── Lock: only one server instance processes per game per COOLDOWN_S ──────────
async function claimLock(supabase: any, gameId: string): Promise<boolean> {
  const { data } = await supabase
    .from("match_cache")
    .select("fetched_at, is_final")
    .eq("game_id", gameId)
    .eq("data_type", "squiggle_check")
    .single();

  if (data?.is_final) return false;

  if (data?.fetched_at) {
    const ageMs = Date.now() - new Date(data.fetched_at).getTime();
    if (ageMs < COOLDOWN_S * 1000) return false;
  }

  // Stamp immediately to block other instances
  await supabase.from("match_cache").upsert(
    {
      game_id: gameId,
      data_type: "squiggle_check",
      payload: {},
      fetched_at: new Date().toISOString(),
      is_final: false,
    },
    { onConflict: "game_id,data_type" }
  );
  return true;
}

// ── Persist/retrieve the previous Squiggle game state ─────────────────────────
async function loadPrevState(supabase: any, gameId: string): Promise<SquiggleState | null> {
  const { data } = await supabase
    .from("match_cache")
    .select("payload")
    .eq("game_id", gameId)
    .eq("data_type", "squiggle_state")
    .single();
  return (data?.payload as SquiggleState) ?? null;
}

async function savePrevState(supabase: any, gameId: string, state: SquiggleState): Promise<void> {
  await supabase.from("match_cache").upsert(
    {
      game_id: gameId,
      data_type: "squiggle_state",
      payload: state,
      fetched_at: new Date().toISOString(),
      is_final: false,
    },
    { onConflict: "game_id,data_type" }
  );
}

// ── Mark old pending events as unconfirmed ────────────────────────────────────
async function expireOldPending(supabase: any, gameId: string): Promise<void> {
  const cutoff = new Date(Date.now() - UNCONFIRMED_AFTER_S * 1000).toISOString();
  await supabase
    .from("live_game_feed")
    .update({ status: "unconfirmed" })
    .eq("api_game_id", gameId)
    .eq("status", "pending")
    .lt("created_at", cutoff);
}

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId    = searchParams.get("id");       // APISports game ID
  const squiggleId = searchParams.get("squiggle"); // Squiggle game ID
  const hteam     = searchParams.get("hteam") ?? "";
  const ateam     = searchParams.get("ateam") ?? "";

  if (!gameId || !squiggleId) {
    return NextResponse.json({ error: "Missing id or squiggle" }, { status: 400 });
  }

  const supabase = adminSupabase();

  // ── Lock ────────────────────────────────────────────────────────────────────
  const canProceed = await claimLock(supabase, gameId);
  if (!canProceed) {
    return NextResponse.json({ skipped: true, reason: "cooldown" });
  }

  // ── Fetch live Squiggle data (server-side, no CORS) ─────────────────────────
  let game: any = null;
  try {
    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;game=${squiggleId}`,
      {
        headers: { "User-Agent": "Foopy AFL App (foopy.app)" },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Squiggle ${res.status}`);
    const data = await res.json();
    game = data?.games?.[0] ?? null;
  } catch (err: any) {
    console.error("[squiggle-check] fetch failed:", err.message);
    return NextResponse.json({ skipped: true, reason: "squiggle_fetch_failed" });
  }

  if (!game) {
    console.warn("[squiggle-check] no game data for squiggle_id:", squiggleId);
    return NextResponse.json({ skipped: true, reason: "no_game_data" });
  }

  const newState: SquiggleState = {
    hgoals:   Number(game.hgoals   ?? 0),
    hbehinds: Number(game.hbehinds ?? 0),
    agoals:   Number(game.agoals   ?? 0),
    abehinds: Number(game.abehinds ?? 0),
  };

  const prevState = await loadPrevState(supabase, gameId);

  // Always update stored state so next call has correct baseline
  await savePrevState(supabase, gameId, newState);

  // Expire any stale pending events
  await expireOldPending(supabase, gameId);

  // ── No previous state yet — this is the baseline call ───────────────────────
  if (!prevState) {
    console.log(`[squiggle-check] baseline set game=${gameId}`, newState);
    return NextResponse.json({ skipped: true, reason: "baseline_set", state: newState });
  }

  // ── Compute diffs ──────────────────────────────────────────────────────────
  const hgDiff = newState.hgoals   - prevState.hgoals;
  const hbDiff = newState.hbehinds - prevState.hbehinds;
  const agDiff = newState.agoals   - prevState.agoals;
  const abDiff = newState.abehinds - prevState.abehinds;

  const log = {
    gameId, squiggleId,
    prev: prevState,
    new:  newState,
    diff: { hg: hgDiff, hb: hbDiff, ag: agDiff, ab: abDiff },
  };

  const totalDiff = hgDiff + hbDiff + agDiff + abDiff;

  // ── Safety rule: only infer when EXACTLY ONE counter incremented by 1 ───────
  if (totalDiff === 0) {
    // No change — normal, happens every poll when no score
    return NextResponse.json({ skipped: true, reason: "no_change" });
  }

  if (totalDiff !== 1 || Math.max(hgDiff, hbDiff, agDiff, abDiff) !== 1) {
    // Multiple things changed, or something went down (correction) — don't guess
    console.warn("[squiggle-check] ambiguous diff — skipping", log);
    return NextResponse.json({ skipped: true, reason: "ambiguous_diff", log });
  }

  // ── Determine which team scored and what type ──────────────────────────────
  const homeTeamId = getTeamId(hteam);
  const awayTeamId = getTeamId(ateam);

  let teamId = 0;
  let type: "GOAL" | "BEHIND" | null = null;

  if      (hgDiff === 1) { teamId = homeTeamId; type = "GOAL"; }
  else if (hbDiff === 1) { teamId = homeTeamId; type = "BEHIND"; }
  else if (agDiff === 1) { teamId = awayTeamId; type = "GOAL"; }
  else if (abDiff === 1) { teamId = awayTeamId; type = "BEHIND"; }

  if (!teamId || !type) {
    console.warn("[squiggle-check] team lookup failed — skipping", { hteam, ateam, homeTeamId, awayTeamId, log });
    return NextResponse.json({ skipped: true, reason: "team_lookup_failed", log });
  }

  // ── Parse quarter and minute from timestr ─────────────────────────────────
  const timestr = String(game.timestr ?? "");
  const qMatch  = timestr.match(/^Q(\d)/i);
  const minMatch = timestr.match(/^Q\d\s+(\d+):/i);
  const period = qMatch   ? Number(qMatch[1])  : null;
  const minute = minMatch ? Number(minMatch[1]) : null;

  const homeScore = Number(game.hscore ?? 0);
  const awayScore = Number(game.ascore ?? 0);

  // ── Stable unique key for this exact scoring play ─────────────────────────
  // homeScore + awayScore is unique after each play, so this can never duplicate.
  const squiggleKey = `${gameId}_${teamId}_${type}_${homeScore}_${awayScore}`;

  const eventLog = { ...log, event: { teamId, type, period, minute, homeScore, awayScore, squiggleKey } };

  // ── Insert pending event — squiggle_key unique index prevents duplicates ───
  const { error } = await supabase.from("live_game_feed").insert({
    api_game_id:  String(gameId),
    period,
    minute,
    type,
    team_id:      teamId,
    player_id:    null,
    player_name:  null,
    home_score:   homeScore,
    away_score:   awayScore,
    inferred:     true,
    status:       "pending",
    source:       "squiggle",
    squiggle_key: squiggleKey,
  });

  if (error) {
    // 23505 = unique constraint — already exists, that's fine
    if (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("duplicate")) {
      console.log("[squiggle-check] duplicate skipped", { squiggleKey });
      return NextResponse.json({ skipped: true, reason: "duplicate", squiggleKey });
    }
    // Schema not migrated yet — fall back to old insert without new columns
    if (error.code === "42703" || error.message?.includes("column")) {
      console.warn("[squiggle-check] schema not yet migrated, using fallback insert");
      const { error: fallback } = await supabase.from("live_game_feed").insert({
        api_game_id: String(gameId),
        period, minute, type,
        team_id: teamId,
        player_id: null, player_name: null,
        home_score: homeScore, away_score: awayScore,
        inferred: true,
      });
      if (fallback && fallback.code !== "23505") {
        console.error("[squiggle-check] fallback insert error:", fallback.message);
        return NextResponse.json({ error: fallback.message }, { status: 500 });
      }
      return NextResponse.json({ inserted: !fallback, reason: "fallback_no_schema", log: eventLog });
    }

    console.error("[squiggle-check] insert error:", error.message, eventLog);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[squiggle-check] ✅ inserted pending event", eventLog);
  return NextResponse.json({ inserted: true, squiggleKey, log: eventLog });
}
