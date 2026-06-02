import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const team_name = searchParams.get("team_name");

  if (!team_name) {
    return NextResponse.json({ error: "team_name required" }, { status: 400 });
  }

  const { data: passes, error } = await supabaseServer
    .from("user_team_passes")
    .select("id, user_id, team_name, serial_number, xp, created_at")
    .eq("team_name", team_name)
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!passes?.length) {
    return NextResponse.json([]);
  }

  const userIds = [...new Set(passes.map((p) => p.user_id))];

  const { data: profiles } = await supabaseServer
    .from("profiles")
    .select("id, username, avatar_url, verified")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result = passes.map((p) => ({
    id:            p.id,
    user_id:       p.user_id,
    team_name:     p.team_name,
    serial_number: p.serial_number,
    xp:            p.xp ?? 0,
    created_at:    p.created_at,
    username:      profileMap.get(p.user_id)?.username   ?? null,
    avatar_url:    profileMap.get(p.user_id)?.avatar_url ?? null,
    verified:      profileMap.get(p.user_id)?.verified   ?? false,
  }));

  return NextResponse.json(result);
}
