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

  // Same leaderboard for every viewer — cache at the edge so a traffic spike
  // doesn't run the aggregation RPC once per request.
  const cacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };

  const rows = data ?? [];
  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.user_id).filter(Boolean);
    const { data: profiles } = await db.from("profiles").select("id, verified").in("id", ids);
    const verifiedMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.verified ?? false]));
    return NextResponse.json({ leaderboard: rows.map((r: any) => ({ ...r, verified: verifiedMap[r.user_id] ?? false })) }, { headers: cacheHeaders });
  }
  return NextResponse.json({ leaderboard: rows }, { headers: cacheHeaders });
}
