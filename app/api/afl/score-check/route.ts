import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { gameId, hteamId, ateamId, hscore, ascore, period, minute } = body;

  if (!gameId || hteamId == null || ateamId == null || hscore == null || ascore == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const currentHome = Number(hscore);
  const currentAway = Number(ascore);
  const supabase = adminSupabase();

  // Read last confirmed score from DB
  const { data: snapshot } = await supabase
    .from("match_score_snapshots")
    .select("home_score, away_score")
    .eq("game_id", String(gameId))
    .single();

  const lastHome = snapshot ? Number(snapshot.home_score) : 0;
  const lastAway = snapshot ? Number(snapshot.away_score) : 0;

  // Nothing changed
  if (currentHome === lastHome && currentAway === lastAway) {
    return NextResponse.json({ inserted: [] });
  }

  // Always update snapshot so next call has correct baseline
  await supabase
    .from("match_score_snapshots")
    .upsert({
      game_id: String(gameId),
      home_score: currentHome,
      away_score: currentAway,
      updated_at: new Date().toISOString(),
    });

  const homeDelta = currentHome - lastHome;
  const awayDelta = currentAway - lastAway;
  const inserted: string[] = [];

  // Only handle clean single-score deltas — ambiguous multi-score gaps are left to API-Sports
  const toInsert: { teamId: number; type: "GOAL" | "BEHIND" }[] = [];

  if (homeDelta === 6 && awayDelta === 0) toInsert.push({ teamId: Number(hteamId), type: "GOAL" });
  else if (homeDelta === 1 && awayDelta === 0) toInsert.push({ teamId: Number(hteamId), type: "BEHIND" });
  else if (awayDelta === 6 && homeDelta === 0) toInsert.push({ teamId: Number(ateamId), type: "GOAL" });
  else if (awayDelta === 1 && homeDelta === 0) toInsert.push({ teamId: Number(ateamId), type: "BEHIND" });

  for (const { teamId, type } of toInsert) {
    // Skip if a real (non-inferred) event already exists for this exact score + team
    const { data: existing } = await supabase
      .from("live_game_feed")
      .select("id")
      .eq("api_game_id", String(gameId))
      .eq("team_id", teamId)
      .eq("home_score", currentHome)
      .eq("away_score", currentAway)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from("live_game_feed").insert({
      api_game_id: String(gameId),
      period: period != null ? Number(period) : null,
      minute: minute != null ? Number(minute) : null,
      type,
      team_id: teamId,
      player_id: null,
      player_name: null,
      home_score: currentHome,
      away_score: currentAway,
      inferred: true,
    });

    if (!error) inserted.push(type);
  }

  return NextResponse.json({ inserted });
}
