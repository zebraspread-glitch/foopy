import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// GET /api/attendance?game_id=38601 → { attendance: 59556 | null }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ error: "Missing game_id" }, { status: 400 });

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await db
      .from("match_cache")
      .select("payload")
      .eq("game_id", String(gameId))
      .eq("data_type", "attendance")
      .maybeSingle();

    const attendance = (data?.payload as any)?.attendance ?? null;
    return NextResponse.json(
      { attendance },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json({ attendance: null });
  }
}
