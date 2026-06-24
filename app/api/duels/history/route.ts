import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { isUuid } from "@/app/lib/validation";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Allow fetching another user's history (for public profile viewing)
  const targetUserId = searchParams.get("user_id") ?? user.id;
  if (!isUuid(targetUserId)) return NextResponse.json({ error: "Invalid user_id" }, { status: 400 });

  const db = adminSupabase();

  // Plain select — no FK joins to profiles (those FKs point to auth.users, not profiles)
  const { data: rawDuels, error } = await db
    .from("duels")
    .select(`
      *,
      duel_game:duel_games(id, game_id, round, season, home_team, away_team, game_date)
    `)
    .or(`challenger_id.eq.${targetUserId},opponent_id.eq.${targetUserId}`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach profiles separately
  const duels = rawDuels ?? [];
  const profileIds = [...new Set(
    duels.flatMap((d: any) => [d.challenger_id, d.opponent_id].filter(Boolean))
  )];

  let profileMap: Record<string, any> = {};
  if (profileIds.length) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", profileIds);
    profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
  }

  const duelsWithProfiles = duels.map((d: any) => ({
    ...d,
    challenger: profileMap[d.challenger_id] ?? null,
    opponent:   d.opponent_id ? (profileMap[d.opponent_id] ?? null) : null,
  }));

  const { data: streakData } = await db.rpc("get_duel_win_streak", { p_user_id: targetUserId });
  const winStreak = streakData ?? 0;

  const completed = duelsWithProfiles.filter((d: any) => d.status === "complete");
  const wins      = completed.filter((d: any) => d.winner_id === targetUserId).length;
  const losses    = completed.filter((d: any) => d.winner_id !== null && d.winner_id !== targetUserId && !d.is_draw).length;
  const draws     = completed.filter((d: any) => d.is_draw).length;
  const winRate   = completed.filter((d: any) => d.winner_id !== null).length > 0
    ? Math.round(wins / completed.filter((d: any) => d.winner_id !== null).length * 100)
    : 0;

  return NextResponse.json({
    duels: duelsWithProfiles,
    stats: { wins, losses, draws, total: completed.length, winRate, winStreak },
    userId: targetUserId,
  });
}
