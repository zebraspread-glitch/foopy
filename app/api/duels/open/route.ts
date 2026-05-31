import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/duels/open — public endpoint: returns open duel games
export async function GET() {
  const db = adminSupabase();
  const { data, error } = await db
    .from("duel_games")
    .select("id, game_id, round, season, home_team, away_team, game_date, status")
    .eq("status", "open")
    .gt("game_date", new Date().toISOString())
    .order("game_date", { ascending: true });

  if (error) return NextResponse.json({ games: [] });
  return NextResponse.json({ games: data ?? [] });
}
