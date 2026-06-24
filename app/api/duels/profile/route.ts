import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isUuid } from "@/app/lib/validation";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/duels/profile?user_id=X
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  if (!isUuid(userId)) return NextResponse.json({ error: "Invalid user_id" }, { status: 400 });

  const db = adminSupabase();

  const { data: duels } = await db
    .from("duels")
    .select("winner_id, is_draw, status")
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .eq("status", "complete");

  const completed = duels ?? [];
  const wins   = completed.filter((d) => d.winner_id === userId).length;
  const losses = completed.filter((d) => d.winner_id !== null && d.winner_id !== userId && !d.is_draw).length;
  const draws  = completed.filter((d) => d.is_draw).length;
  const total  = completed.length;
  const winRate = completed.filter((d) => d.winner_id !== null).length > 0
    ? Math.round(wins / completed.filter((d) => d.winner_id !== null).length * 100)
    : 0;

  const { data: streak } = await db.rpc("get_duel_win_streak", { p_user_id: userId });

  return NextResponse.json({ wins, losses, draws, total, winRate, winStreak: streak ?? 0 });
}
