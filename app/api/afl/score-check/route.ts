import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function scoreType(delta: number, goalsDelta?: number, behindsDelta?: number): "GOAL" | "BEHIND" | null {
  if (delta <= 0) return null;
  if (goalsDelta != null && behindsDelta != null) {
    if (goalsDelta > 0) return "GOAL";
    if (behindsDelta > 0) return "BEHIND";
  }
  if (delta % 6 === 0) return "GOAL";
  if (delta === 1) return "BEHIND";
  // Ambiguous delta (e.g. 7 = goal + behind) — treat as GOAL
  return "GOAL";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    gameId,
    hteamId, ateamId,
    hscore, ascore,
    hgoals, hbehinds,
    agoals, abehinds,
    period, minute,
  } = body;

  if (!gameId || hteamId == null || ateamId == null || hscore == null || ascore == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const currentHome = Number(hscore);
  const currentAway = Number(ascore);

  if (currentHome === 0 && currentAway === 0) {
    return NextResponse.json({ inserted: [] });
  }

  const supabase = adminSupabase();

  // Derive last known scores from the highest scores recorded in the feed
  const { data: events } = await supabase
    .from("live_game_feed")
    .select("home_score, away_score")
    .eq("api_game_id", String(gameId));

  const lastHomeScore = events && events.length > 0
    ? Math.max(...events.map((e: any) => Number(e.home_score ?? 0)))
    : 0;
  const lastAwayScore = events && events.length > 0
    ? Math.max(...events.map((e: any) => Number(e.away_score ?? 0)))
    : 0;

  const homeDelta = currentHome - lastHomeScore;
  const awayDelta = currentAway - lastAwayScore;

  const inserted: string[] = [];

  // Home scored (and only home scored this interval)
  if (homeDelta > 0 && awayDelta >= 0) {
    const type = scoreType(
      homeDelta,
      hgoals != null && lastHomeScore != null ? Number(hgoals) - Math.floor(lastHomeScore / 6) : undefined,
      hbehinds != null ? Number(hbehinds) - (lastHomeScore % 6 === 0 ? 0 : lastHomeScore % 6) : undefined,
    );
    if (type) {
      const { data: existing } = await supabase
        .from("live_game_feed")
        .select("id")
        .eq("api_game_id", String(gameId))
        .eq("team_id", Number(hteamId))
        .eq("home_score", currentHome)
        .eq("away_score", currentAway)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("live_game_feed").insert({
          api_game_id: String(gameId),
          period: period != null ? Number(period) : null,
          minute: minute != null ? Number(minute) : null,
          type,
          team_id: Number(hteamId),
          player_id: null,
          player_name: null,
          home_score: currentHome,
          away_score: currentAway,
          inferred: true,
        });
        inserted.push(`home:${type}`);
      }
    }
  }

  // Away scored (and only away scored this interval)
  if (awayDelta > 0 && homeDelta >= 0) {
    const type = scoreType(
      awayDelta,
      agoals != null && lastAwayScore != null ? Number(agoals) - Math.floor(lastAwayScore / 6) : undefined,
      abehinds != null ? Number(abehinds) - (lastAwayScore % 6 === 0 ? 0 : lastAwayScore % 6) : undefined,
    );
    if (type) {
      const { data: existing } = await supabase
        .from("live_game_feed")
        .select("id")
        .eq("api_game_id", String(gameId))
        .eq("team_id", Number(ateamId))
        .eq("home_score", currentHome)
        .eq("away_score", currentAway)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("live_game_feed").insert({
          api_game_id: String(gameId),
          period: period != null ? Number(period) : null,
          minute: minute != null ? Number(minute) : null,
          type,
          team_id: Number(ateamId),
          player_id: null,
          player_name: null,
          home_score: currentHome,
          away_score: currentAway,
          inferred: true,
        });
        inserted.push(`away:${type}`);
      }
    }
  }

  return NextResponse.json({ inserted });
}
