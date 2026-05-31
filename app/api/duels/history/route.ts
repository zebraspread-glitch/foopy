import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/duels/history — get the authenticated user's duel history
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminSupabase();

  const { data: duels, error } = await db
    .from("duels")
    .select(`
      *,
      duel_game:duel_games(id, game_id, round, season, home_team, away_team, game_date),
      challenger:profiles!duels_challenger_id_fkey(id, username, display_name, avatar_url),
      opponent:profiles!duels_opponent_id_fkey(id, username, display_name, avatar_url)
    `)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach win streak
  const { data: streakData } = await db.rpc("get_duel_win_streak", { p_user_id: user.id });
  const winStreak = streakData ?? 0;

  // Compute summary stats
  const completed = (duels ?? []).filter((d) => d.status === "complete");
  const wins   = completed.filter((d) => d.winner_id === user.id).length;
  const losses = completed.filter((d) => d.winner_id !== null && d.winner_id !== user.id && !d.is_draw).length;
  const draws  = completed.filter((d) => d.is_draw).length;
  const winRate = completed.filter((d) => d.winner_id !== null).length > 0
    ? Math.round(wins / completed.filter((d) => d.winner_id !== null).length * 100)
    : 0;

  return NextResponse.json({
    duels: duels ?? [],
    stats: { wins, losses, draws, total: completed.length, winRate, winStreak },
    userId: user.id,
  });
}
