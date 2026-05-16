import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function eventType(delta: number): "GOAL" | "BEHIND" | null {
  if (delta === 6) return "GOAL";
  if (delta === 1) return "BEHIND";
  return null;
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

  // Get last known score
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

  // Update snapshot immediately so concurrent calls don't double-fire
  await supabase
    .from("match_score_snapshots")
    .upsert({ game_id: String(gameId), home_score: currentHome, away_score: currentAway, updated_at: new Date().toISOString() });

  const inserted: string[] = [];

  const homeDelta = currentHome - lastHome;
  const awayDelta = currentAway - lastAway;

  if (homeDelta > 0) {
    const type = eventType(homeDelta);
    if (type) {
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

  if (awayDelta > 0) {
    const type = eventType(awayDelta);
    if (type) {
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

  return NextResponse.json({ inserted });
}
