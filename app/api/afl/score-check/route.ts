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

  const { error } = await adminSupabase().from("live_game_feed").insert({
    api_game_id: String(gameId),
    period: period != null ? Number(period) : null,
    minute: minute != null ? Number(minute) : null,
    type,
    team_id: Number(teamId),
    player_id: null,
    player_name: null,
    home_score: Number(hscore),
    away_score: Number(ascore),
    inferred: true,
  });

  if (error) {
    // Unique constraint violation = already exists, that's fine
    if (error.code === "23505" || error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return NextResponse.json({ inserted: false, reason: "duplicate" });
    }
    console.error("[score-check]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: true, type });
}
