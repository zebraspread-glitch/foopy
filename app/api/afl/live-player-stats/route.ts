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
    .from("live_player_stats")
    .select("*")
    .eq("match_id", gameId);

  if (error) {
    console.error("[live-player-stats] select error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ players: data ?? [] });
}
