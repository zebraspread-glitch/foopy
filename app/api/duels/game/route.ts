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

// GET /api/duels/game?game_id=123
// Returns the duel game config, questions, and the current user's duel (if any)
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

  // Get the authenticated user
  const { data: { user } } = await supabaseServer.auth.getUser(token);
  if (!user) return NextResponse.json({ duelGame, duel: null, questions: questions ?? [], picks: [] });

  // Get this user's duel for this game
  const { data: duel } = await db
    .from("duels")
    .select(`
      *,
      challenger:profiles!duels_challenger_id_fkey(id, username, display_name, avatar_url),
      opponent:profiles!duels_opponent_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq("duel_game_id", duelGame.id)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get user's picks for this duel
  let picks: any[] = [];
  if (duel) {
    const { data: pickData } = await db
      .from("duel_picks")
      .select("*")
      .eq("duel_id", duel.id)
      .eq("user_id", user.id);
    picks = pickData ?? [];

    // If duel is complete, also fetch opponent picks for result screen
    if (duel.status === "complete") {
      const opponentId = duel.challenger_id === user.id ? duel.opponent_id : duel.challenger_id;
      if (opponentId) {
        const { data: oppPickData } = await db
          .from("duel_picks")
          .select("*")
          .eq("duel_id", duel.id)
          .eq("user_id", opponentId);
        return NextResponse.json({
          duelGame,
          duel,
          questions: questions ?? [],
          picks,
          opponentPicks: oppPickData ?? [],
        });
      }
    }
  }

  return NextResponse.json({ duelGame, duel, questions: questions ?? [], picks });
}
