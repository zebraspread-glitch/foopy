import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/afl/record-view
 * Body: { game_id: number, user_id?: string | null, session_id: string }
 *
 * Records a unique viewer for a game.
 * - Authenticated users   → upsert on (game_id, user_id)
 * - Anonymous users       → upsert on (game_id, session_id)
 * Uses the service-role key so RLS never blocks the write.
 */
export async function POST(req: Request) {
  try {
    const { game_id, user_id, session_id } = await req.json();
    if (!game_id || !session_id) {
      return NextResponse.json({ error: "Missing game_id or session_id" }, { status: 400 });
    }

    const db = adminSupabase();

    // session_id is always set (stable per-browser per-game ID).
    // user_id is stored as metadata but session_id is the conflict key.
    await db.from("match_viewers").upsert(
      {
        game_id:    Number(game_id),
        session_id,
        user_id:    user_id ?? null,
        viewed_at:  new Date().toISOString(),
      },
      { onConflict: "game_id,session_id" }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[record-view]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
