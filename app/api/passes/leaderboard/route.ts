import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const player_id = searchParams.get("player_id");

  if (!player_id) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }

  // Fetch all active passes for this player (service role bypasses RLS)
  let { data: passes, error } = await supabaseServer
    .from("user_player_passes")
    .select("id, user_id, serial_number, xp, created_at")
    .eq("player_id", player_id)
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!passes?.length) {
    return NextResponse.json([]);
  }

  // Fetch profile info for all holders
  const userIds = [...new Set(passes.map((p) => p.user_id))];
  const syncResults = await Promise.allSettled(userIds.map((userId) => syncPassXpFromCards(userId)));
  for (const result of syncResults) {
    if (result.status === "rejected") {
      console.error("[passes/leaderboard sync xp]", result.reason);
    }
  }

  const { data: syncedPasses } = await supabaseServer
    .from("user_player_passes")
    .select("id, user_id, serial_number, xp, created_at")
    .eq("player_id", player_id)
    .eq("active", true);
  if (syncedPasses) passes = syncedPasses;

  const { data: profiles } = await supabaseServer
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result = passes.map((p) => ({
    id:            p.id,
    user_id:       p.user_id,
    serial_number: p.serial_number,
    xp:            p.xp ?? 0,
    created_at:    p.created_at,
    username:      profileMap.get(p.user_id)?.username   ?? null,
    avatar_url:    profileMap.get(p.user_id)?.avatar_url ?? null,
  }));

  return NextResponse.json(result);
}
