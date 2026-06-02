import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/passes/global-leaderboard?type=player|team&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type") === "team" ? "team" : "player";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  if (type === "player") {
    const { data: passes, error } = await supabaseServer
      .from("user_player_passes")
      .select("id, user_id, player_name, team_name, xp, serial_number")
      .eq("active", true)
      .order("xp", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!passes?.length) return NextResponse.json([]);

    const userIds = [...new Set(passes.map((p) => p.user_id))];
    const { data: profiles } = await supabaseServer
      .from("profiles")
      .select("id, username, avatar_url, verified")
      .in("id", userIds);

    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    return NextResponse.json(passes.map((p) => ({
      id:            p.id,
      player_name:   p.player_name,
      team_name:     p.team_name,
      xp:            p.xp ?? 0,
      serial_number: p.serial_number,
      username:      pm.get(p.user_id)?.username   ?? null,
      avatar_url:    pm.get(p.user_id)?.avatar_url ?? null,
      verified:      pm.get(p.user_id)?.verified   ?? false,
    })));
  } else {
    const { data: passes, error } = await supabaseServer
      .from("user_team_passes")
      .select("id, user_id, team_name, xp, serial_number")
      .eq("active", true)
      .order("xp", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!passes?.length) return NextResponse.json([]);

    const userIds = [...new Set(passes.map((p) => p.user_id))];
    const { data: profiles } = await supabaseServer
      .from("profiles")
      .select("id, username, avatar_url, verified")
      .in("id", userIds);

    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    return NextResponse.json(passes.map((p) => ({
      id:            p.id,
      team_name:     p.team_name,
      xp:            p.xp ?? 0,
      serial_number: p.serial_number,
      username:      pm.get(p.user_id)?.username   ?? null,
      avatar_url:    pm.get(p.user_id)?.avatar_url ?? null,
      verified:      pm.get(p.user_id)?.verified   ?? false,
    })));
  }
}
