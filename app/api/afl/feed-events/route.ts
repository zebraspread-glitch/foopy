import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Service role bypasses RLS — server-side only, never exposed to the client
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("id");
  if (!gameId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = adminSupabase();

  const { data, error } = await supabase
    .from("live_game_feed")
    .select("*")
    .eq("api_game_id", gameId)
    .order("period", { ascending: true })
    .order("minute", { ascending: true });

  if (error) {
    console.error("[feed-events] select error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const events = (data ?? []).filter((row: any) => {
    const key = `${row.period}|${row.minute}|${row.type}|${row.team_id}|${row.player_id}|${row.home_score}|${row.away_score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ events });
}
