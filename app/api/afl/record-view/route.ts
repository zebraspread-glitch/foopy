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

    if (user_id) {
      // Authenticated: key on (game_id, user_id)
      await db.from("match_viewers").upsert(
        { game_id: Number(game_id), user_id, session_id, viewed_at: new Date().toISOString() },
        { onConflict: "game_id,user_id" }
      );
    } else {
      // Anonymous: key on (game_id, session_id)
      await db.from("match_viewers").upsert(
        { game_id: Number(game_id), session_id, viewed_at: new Date().toISOString() },
        { onConflict: "game_id,session_id" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[record-view]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
