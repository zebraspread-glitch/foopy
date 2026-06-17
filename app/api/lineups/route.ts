import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// GET /api/lineups?gameId=<squiggleId>
// Returns the FootyWire-sourced lineup (Ins/Outs + named team) for a game,
// written by the sync-lineups cron. Empty payload if teams aren't named yet.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") ?? "";
  if (!gameId) return NextResponse.json({ lineup: null });

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from("match_cache")
      .select("payload, fetched_at")
      .eq("game_id", gameId)
      .eq("data_type", "lineups")
      .maybeSingle();

    if (!data?.payload) return NextResponse.json({ lineup: null });
    return NextResponse.json(
      { lineup: data.payload, fetchedAt: data.fetched_at },
      { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json({ lineup: null });
  }
}
