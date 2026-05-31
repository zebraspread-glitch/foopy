import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/duels/leaderboard?season=2025&round=12
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ? Number(searchParams.get("season")) : null;
  const round  = searchParams.get("round")  ? Number(searchParams.get("round"))  : null;

  const db = adminSupabase();
  const { data, error } = await db.rpc("get_duel_leaderboard", {
    p_season: season,
    p_round:  round,
    p_limit:  100,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leaderboard: data ?? [] });
}
