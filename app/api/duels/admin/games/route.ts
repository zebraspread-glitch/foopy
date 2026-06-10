import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["open", "locked", "live", "complete", "cancelled"] as const;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/duels/admin/games — list all duel games
export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  const { data, error } = await db
    .from("duel_games")
    .select("*, duel_questions(id, question_order, is_tiebreaker, question_text, option_a, option_b, correct_answer)")
    .order("game_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ games: data });
}

// POST /api/duels/admin/games — create a duel game
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { game_id, round, season, home_team, away_team, game_date } = body as {
    game_id: number;
    round: number;
    season: number;
    home_team: string;
    away_team: string;
    game_date: string;
  };

  if (!game_id || !round || !season || !home_team || !away_team || !game_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from("duel_games")
    .insert({ game_id, round, season, home_team, away_team, game_date, status: "open" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ game: data });
}

// PATCH /api/duels/admin/games — update status
export async function PATCH(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { id, status } = body as { id: string; status: string };
  if (!id || !status) return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from("duel_games")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ game: data });
}

// DELETE /api/duels/admin/games — delete a duel game
export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = adminSupabase();
  const { error } = await db.from("duel_games").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
