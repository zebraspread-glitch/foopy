import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/passes/global-purchases?type=player|team&period=1d|7d|all
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type") === "team" ? "team" : "player";
  const period = searchParams.get("period") ?? "1d";

  const since =
    period === "1d"  ? new Date(Date.now() - 86_400_000).toISOString() :
    period === "7d"  ? new Date(Date.now() - 7 * 86_400_000).toISOString() :
    null;

  if (type === "player") {
    let q = supabaseServer
      .from("user_player_passes")
      .select("player_id, player_name, team_name")
      .limit(2000);
    if (since) q = q.gte("created_at", since);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const m = new Map<string, { player_name: string; team_name: string; count: number }>();
    for (const r of data ?? []) {
      if (m.has(r.player_id)) m.get(r.player_id)!.count++;
      else m.set(r.player_id, { player_name: r.player_name, team_name: r.team_name, count: 1 });
    }
    const result = [...m.entries()]
      .map(([player_id, v]) => ({ player_id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
    return NextResponse.json(result);
  } else {
    let q = supabaseServer
      .from("user_team_passes")
      .select("team_name")
      .limit(2000);
    if (since) q = q.gte("created_at", since);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const m = new Map<string, number>();
    for (const r of data ?? []) m.set(r.team_name, (m.get(r.team_name) ?? 0) + 1);
    const result = [...m.entries()]
      .map(([team_name, count]) => ({ team_name, count }))
      .sort((a, b) => b.count - a.count);
    return NextResponse.json(result);
  }
}
