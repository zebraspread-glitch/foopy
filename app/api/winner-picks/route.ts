import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { supabaseServer } from "@/app/lib/supabase-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json({ home: 0, away: 0, total: 0 });
  }

  const { data, error } = await supabase
    .from("winner_picks")
    .select("side")
    .eq("match_id", matchId);

  if (error) {
    console.error("[winner-picks GET]", error.message);
    return NextResponse.json({ home: 0, away: 0, total: 0 });
  }

  const home = data.filter((v) => v.side === "home").length;
  const away = data.filter((v) => v.side === "away").length;

  return NextResponse.json({ home, away, total: home + away });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { matchId, team, side, voterId } = body;

  if (!matchId || !team || !side || !voterId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Check if this is the user's first pick for this match (for aura signal)
  let isFirstPick = false;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data: { user } } = await supabaseServer.auth.getUser(token);
    if (user) {
      const { data: existing } = await supabaseServer
        .from("aura_events")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_type", "winner_pick")
        .eq("related_id", String(matchId))
        .maybeSingle();
      isFirstPick = !existing;
    }
  }

  // Remove any existing vote this device made for this match
  const { error: deleteError } = await supabase
    .from("winner_picks")
    .delete()
    .eq("match_id", String(matchId))
    .eq("voter_id", String(voterId));

  if (deleteError) {
    console.error("[winner-picks DELETE]", deleteError.message);
  }

  // Insert the new vote
  const { error: insertError } = await supabase.from("winner_picks").insert({
    match_id: String(matchId),
    team,
    side,
    voter_id: String(voterId),
  });

  if (insertError) {
    console.error("[winner-picks INSERT]", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Return fresh counts immediately so UI can update without a second fetch
  const { data } = await supabase
    .from("winner_picks")
    .select("side")
    .eq("match_id", String(matchId));

  const home = (data ?? []).filter((v) => v.side === "home").length;
  const away = (data ?? []).filter((v) => v.side === "away").length;

  return NextResponse.json({ ok: true, home, away, total: home + away, aura_awarded: isFirstPick });
}
