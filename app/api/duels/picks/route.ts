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

type PickInput = {
  question_id: string;
  pick: "a" | "b";
  pick_margin?: string; // for tiebreaker question only
};

// POST /api/duels/picks — submit all picks for a duel
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { duel_id, picks } = body as { duel_id: string; picks: PickInput[] };
  if (!duel_id || !Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: "Missing duel_id or picks" }, { status: 400 });
  }

  const db = adminSupabase();

  // Verify the duel exists and user is a participant
  const { data: duel, error: duelErr } = await db
    .from("duels")
    .select("id, status, challenger_id, opponent_id, duel_game_id")
    .eq("id", duel_id)
    .single();

  if (duelErr || !duel) return NextResponse.json({ error: "Duel not found" }, { status: 404 });

  const isChallenger = duel.challenger_id === user.id;
  const isOpponent   = duel.opponent_id === user.id;
  if (!isChallenger && !isOpponent) {
    return NextResponse.json({ error: "You are not part of this duel" }, { status: 403 });
  }

  if (duel.status === "complete" || duel.status === "cancelled") {
    return NextResponse.json({ error: "This duel is already closed" }, { status: 400 });
  }

  // Check game hasn't started yet
  const { data: duelGame } = await db
    .from("duel_games")
    .select("game_date")
    .eq("id", duel.duel_game_id)
    .single();

  if (duelGame && new Date(duelGame.game_date) <= new Date()) {
    return NextResponse.json({ error: "Picks are locked — the game has started" }, { status: 400 });
  }

  // Check user hasn't already submitted picks
  const { data: existingPicks } = await db
    .from("duel_picks")
    .select("id")
    .eq("duel_id", duel_id)
    .eq("user_id", user.id)
    .limit(1);

  if (existingPicks && existingPicks.length > 0) {
    return NextResponse.json({ error: "You have already submitted your picks" }, { status: 400 });
  }

  // Validate all question IDs belong to this duel's game
  const { data: questions } = await db
    .from("duel_questions")
    .select("id")
    .eq("duel_game_id", duel.duel_game_id);

  const validIds = new Set((questions ?? []).map((q) => q.id));
  for (const pick of picks) {
    if (!validIds.has(pick.question_id)) {
      return NextResponse.json({ error: `Invalid question_id: ${pick.question_id}` }, { status: 400 });
    }
    if (pick.pick !== "a" && pick.pick !== "b") {
      return NextResponse.json({ error: "Pick must be 'a' or 'b'" }, { status: 400 });
    }
  }

  const rows = picks.map((p) => ({
    duel_id,
    user_id:     user.id,
    question_id: p.question_id,
    pick:        p.pick,
    pick_margin: p.pick_margin ?? null,
  }));

  const { error: insertErr } = await db.from("duel_picks").insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
