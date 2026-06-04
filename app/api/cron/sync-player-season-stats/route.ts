import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-player-season-stats
 *
 * Runs every hour via Vercel Cron.
 * Fetches season player stats for all 18 AFL teams from API-Sports
 * (/players/statistics?team=X&season=YYYY) and stores the combined
 * results in match_cache so /api/player-season-stats can serve fresh
 * data without anyone needing to run a script.
 *
 * Protected by CRON_SECRET env var.
 */

const API_BASE = "https://v1.afl.api-sports.io";
const SEASON      = new Date().getFullYear().toString();

// API-Sports team IDs 1-18 cover all AFL teams
const TEAM_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];

const TEAM_NAMES: Record<number, string> = {
  1:"Adelaide",2:"Brisbane",3:"Carlton",4:"Collingwood",
  5:"Essendon",6:"Fremantle",7:"Geelong",8:"Hawthorn",
  9:"Melbourne",10:"North Melbourne",11:"Port Adelaide",12:"Richmond",
  13:"St Kilda",14:"Sydney",15:"West Coast",16:"Western Bulldogs",
  17:"Gold Coast",18:"GWS",
};

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.API_SPORTS_AFL_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 500 });

  const players: any[] = [];
  const errors: string[] = [];

  for (const teamId of TEAM_IDS) {
    try {
      const res = await fetch(
        `${API_BASE}/players/statistics?team=${teamId}&season=${SEASON}`,
        { headers: { "x-apisports-key": apiKey }, cache: "no-store" }
      );
      if (!res.ok) {
        errors.push(`team ${teamId}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const entries: any[] = data?.response ?? [];

      for (const entry of entries) {
        const p    = entry.player ?? {};
        const stat = entry.statistics?.[0] ?? entry.statistics ?? {};

        const apiSportsId = Number(p.id);
        if (!apiSportsId) continue;

        const name = String(p.name ?? p.firstname ? `${p.firstname} ${p.lastname}` : "").trim();
        if (!name) continue;

        // Build a slug ID matching the format in player-season-stats.json
        const slugId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        const team   = TEAM_NAMES[teamId] ?? "";
        const games  = n(stat.games?.played);

        players.push({
          id:            slugId,
          name,
          team,
          apiSportsId,
          photoUrl:      null,
          jerseyNumber:  n(p.number) || null,
          position:      null,
          games,
          goals:         n(stat.goals?.total?.total),
          goalAssists:   n(stat.goals?.assists?.total),
          behinds:       n(stat.behinds?.total),
          totalDisposals:  n(stat.disposals?.total),
          totalKicks:      n(stat.kicks?.total),
          totalHandballs:  n(stat.handballs?.total),
          totalMarks:      n(stat.marks?.total),
          totalTackles:    n(stat.tackles?.total),
          totalHitouts:    n(stat.hitouts?.total),
          totalClearances: n(stat.clearances?.total),
          freesFor:        n(stat.free_kicks?.for?.total),
          freesAgainst:    n(stat.free_kicks?.against?.total),
          disposals:       n(stat.disposals?.average),
          kicks:           n(stat.kicks?.average),
          handballs:       n(stat.handballs?.average),
          marks:           n(stat.marks?.average),
          tackles:         n(stat.tackles?.average),
          hitouts:         n(stat.hitouts?.average),
          clearances:      n(stat.clearances?.average),
          goalAvg:         n(stat.goals?.total?.average),
          freesForAvg:     n(stat.free_kicks?.for?.average),
          fetchedAt:       new Date().toISOString(),
        });
      }
    } catch (err: any) {
      errors.push(`team ${teamId}: ${err.message}`);
    }
  }

  if (players.length === 0) {
    return NextResponse.json({ ok: false, error: "No player data fetched", errors }, { status: 502 });
  }

  // Store combined results in match_cache using a synthetic game_id = 0
  // so /api/player-season-stats can read without re-calling the API
  const db = adminSupabase();
  const { error: upsertErr } = await db
    .from("match_cache")
    .upsert(
      {
        game_id:    "0",
        data_type:  `player_season_${SEASON}`,
        payload:    { players, season: SEASON, generated_at: new Date().toISOString() },
        fetched_at: new Date().toISOString(),
        is_final:   false,
      },
      { onConflict: "game_id,data_type" }
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, players: players.length, errors });
}
