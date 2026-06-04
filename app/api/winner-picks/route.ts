import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { awardAura } from "@/app/lib/aura";

const db = supabaseServer;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  if (!matchId) return NextResponse.json({ home: 0, away: 0, total: 0 });

  // Resolve authenticated user so we can return their existing pick
  let authedUserId: string | null = null;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data: { user } } = await db.auth.getUser(token);
    authedUserId = user?.id ?? null;
  }

  const { data, error } = await db
    .from("winner_picks")
    .select("side, voter_id")
    .eq("match_id", matchId);

  if (error) {
    console.error("[winner-picks GET]", error.message);
    return NextResponse.json({ home: 0, away: 0, total: 0 });
  }

  const home = data.filter((v) => v.side === "home").length;
  const away = data.filter((v) => v.side === "away").length;
  const draw = data.filter((v) => v.side === "draw").length;

  // Return the user's existing pick so the client can restore state
  const myPick = authedUserId
    ? (data.find((v) => v.voter_id === authedUserId)?.side ?? null)
    : null;

  return NextResponse.json({ home, away, draw, total: home + away + draw, my_pick: myPick });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { matchId, team, side } = body;

  if (!matchId || !team || !side) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Require authentication — no anonymous voting
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const userId = user.id;

  // Upsert: one vote per user per match (voter_id = user's auth ID)
  const { error: upsertError } = await db.from("winner_picks").upsert({
    match_id: String(matchId),
    team,
    side,
    voter_id: userId,
  }, { onConflict: "match_id,voter_id" });

  if (upsertError) {
    console.error("[winner-picks UPSERT]", upsertError.message);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data } = await db
    .from("winner_picks")
    .select("side")
    .eq("match_id", String(matchId));

  const home = (data ?? []).filter((v) => v.side === "home").length;
  const away = (data ?? []).filter((v) => v.side === "away").length;
  const draw = (data ?? []).filter((v) => v.side === "draw").length;

  const auraResult = await awardAura(userId, "winner_pick", String(matchId));

  return NextResponse.json({ ok: true, home, away, draw, total: home + away + draw, aura_awarded: auraResult.awarded });
}
