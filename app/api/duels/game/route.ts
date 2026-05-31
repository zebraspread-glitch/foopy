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

async function attachProfiles(db: ReturnType<typeof adminSupabase>, duel: any) {
  if (!duel) return duel;
  const ids = [duel.challenger_id, duel.opponent_id].filter(Boolean);
  if (!ids.length) return duel;
  const { data: profiles } = await db
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  const map = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
  return {
    ...duel,
    challenger: map[duel.challenger_id] ?? null,
    opponent:   duel.opponent_id ? (map[duel.opponent_id] ?? null) : null,
  };
}

// GET /api/duels/game?game_id=123
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ error: "Missing game_id" }, { status: 400 });

  const token = req.headers.get("authorization")?.slice(7) ?? null;
  const db = adminSupabase();

  // Get duel game
  const { data: duelGame, error: gameErr } = await db
    .from("duel_games")
    .select("*")
    .eq("game_id", Number(gameId))
    .neq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameErr) return NextResponse.json({ error: gameErr.message }, { status: 500 });
  if (!duelGame) return NextResponse.json({ duelGame: null, duel: null, questions: [], picks: [] });

  // Get questions
  const { data: questions } = await db
    .from("duel_questions")
    .select("*")
    .eq("duel_game_id", duelGame.id)
    .order("question_order");

  if (!token) {
    return NextResponse.json({ duelGame, duel: null, questions: questions ?? [], picks: [] });
  }

  // Authenticate user
  const { data: { user } } = await supabaseServer.auth.getUser(token);
  if (!user) return NextResponse.json({ duelGame, duel: null, questions: questions ?? [], picks: [] });

  // Get this user's duel — plain select, no FK joins to profiles
  const { data: rawDuel, error: duelErr } = await db
    .from("duels")
    .select("*")
    .eq("duel_game_id", duelGame.id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duelErr) console.error("[duels/game] duel query error:", duelErr.message);

  const duel = await attachProfiles(db, rawDuel ?? null);

  // Get user's picks
  let picks: any[] = [];
  let opponentPicks: any[] = [];
  if (duel) {
    const { data: pickData } = await db
      .from("duel_picks")
      .select("*")
      .eq("duel_id", duel.id)
      .eq("user_id", user.id);
    picks = pickData ?? [];

    // Fetch opponent picks for active + complete duels so locked screen can show both
    const opponentId = duel.challenger_id === user.id ? duel.opponent_id : duel.challenger_id;
    if (opponentId && (duel.status === "active" || duel.status === "complete")) {
      const { data: oppPickData } = await db
        .from("duel_picks")
        .select("*")
        .eq("duel_id", duel.id)
        .eq("user_id", opponentId);
      opponentPicks = oppPickData ?? [];
    }
  }

  return NextResponse.json({ duelGame, duel, questions: questions ?? [], picks, opponentPicks });
}
