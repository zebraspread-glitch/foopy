import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type QuestionInput = {
  question_order: number;
  is_tiebreaker: boolean;
  question_text: string;
  option_a: string;
  option_b: string;
  category_key?: string;
  option_a_image?: string;
  option_a_team?: string;
  option_b_image?: string;
  option_b_team?: string;
};

// POST /api/duels/admin/questions — upsert all 11 questions for a duel game
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { duel_game_id, questions } = body as {
    duel_game_id: string;
    questions: QuestionInput[];
  };

  if (!duel_game_id || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "Missing duel_game_id or questions" }, { status: 400 });
  }

  const db = adminSupabase();

  // Delete existing questions for this game first (full replace)
  await db.from("duel_questions").delete().eq("duel_game_id", duel_game_id);

  const rows = questions.map((q) => ({
    duel_game_id,
    question_order:  q.question_order,
    is_tiebreaker:   q.is_tiebreaker ?? false,
    question_text:   q.question_text,
    option_a:        q.option_a,
    option_b:        q.option_b,
    category_key:    q.category_key    ?? null,
    option_a_image:  q.option_a_image  ?? null,
    option_a_team:   q.option_a_team   ?? null,
    option_b_image:  q.option_b_image  ?? null,
    option_b_team:   q.option_b_team   ?? null,
  }));

  const { data, error } = await db
    .from("duel_questions")
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data });
}
