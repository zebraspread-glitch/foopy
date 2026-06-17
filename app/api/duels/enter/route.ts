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

// POST /api/duels/enter — enter the matchmaking pool for a duel game
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.duel_game_id) return NextResponse.json({ error: "Missing duel_game_id" }, { status: 400 });

  const { duel_game_id } = body as { duel_game_id: string };
  const db = adminSupabase();

  // Check the duel game exists and is open
  const { data: duelGame, error: gameErr } = await db
    .from("duel_games")
    .select("id, status, game_date")
    .eq("id", duel_game_id)
    .single();

  if (gameErr || !duelGame) return NextResponse.json({ error: "Duel game not found" }, { status: 404 });
  if (duelGame.status !== "open") return NextResponse.json({ error: "Duel entries are closed" }, { status: 400 });

  // Check game hasn't started yet
  if (new Date(duelGame.game_date) <= new Date()) {
    return NextResponse.json({ error: "This game has already started" }, { status: 400 });
  }

  // Check user hasn't already entered this duel game
  const { data: existing } = await db
    .from("duels")
    .select("id, status, opponent_id")
    .eq("duel_game_id", duel_game_id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .neq("status", "cancelled")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ duel: existing, alreadyEntered: true });
  }

  // Try to match against a waiting duel. Under load, many users can read the
  // same waiting row at once, so we CLAIM it atomically: the update only
  // succeeds if the row is still `waiting` (guarding against another entrant
  // grabbing it first). If we lose that race, loop and look for the next one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: waitingDuel } = await db
      .from("duels")
      .select("id, challenger_id")
      .eq("duel_game_id", duel_game_id)
      .eq("status", "waiting")
      .neq("challenger_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!waitingDuel) break; // no one waiting — fall through to create our own

    // Atomic claim: status guard ensures only ONE entrant can win this row.
    const { data: matched, error: matchErr } = await db
      .from("duels")
      .update({ opponent_id: user.id, status: "active" })
      .eq("id", waitingDuel.id)
      .eq("status", "waiting")
      .select()
      .maybeSingle();

    if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
    if (!matched) continue; // someone else claimed it first — try the next waiting duel

    // Notify both players they've been matched
    try {
      await db.from("notifications").insert([
        { user_id: waitingDuel.challenger_id, type: "duel_matched", actor_id: user.id,                  data: { duel_id: matched.id }, read: false },
        { user_id: user.id,                  type: "duel_matched", actor_id: waitingDuel.challenger_id, data: { duel_id: matched.id }, read: false },
      ]);
    } catch {}

    return NextResponse.json({ duel: matched, matched: true });
  }

  // No one waiting (or we kept losing the claim) — create a new waiting duel.
  const { data: newDuel, error: insertErr } = await db
    .from("duels")
    .insert({
      duel_game_id,
      challenger_id: user.id,
      status: "waiting",
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ duel: newDuel, matched: false });
}
