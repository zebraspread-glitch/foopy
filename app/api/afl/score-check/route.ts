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

  const { gameId, teamId, type, hscore, ascore, period, minute } = body;

  if (!gameId || !teamId || !type || hscore == null || ascore == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (type !== "GOAL" && type !== "BEHIND") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const supabase = adminSupabase();
  const home = Number(hscore);
  const away = Number(ascore);
  const tid = Number(teamId);

  // Dedup: skip if identical event already exists for this game/team/score/type
  const { data: existing } = await supabase
    .from("live_game_feed")
    .select("id")
    .eq("api_game_id", String(gameId))
    .eq("team_id", tid)
    .eq("home_score", home)
    .eq("away_score", away)
    .eq("type", type)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ inserted: false, reason: "duplicate" });
  }

  const { error } = await supabase.from("live_game_feed").insert({
    api_game_id: String(gameId),
    period: period != null ? Number(period) : null,
    minute: minute != null ? Number(minute) : null,
    type,
    team_id: tid,
    player_id: null,
    player_name: null,
    home_score: home,
    away_score: away,
    inferred: true,
  });

  if (error) {
    console.error("[score-check] insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: true, type });
}
