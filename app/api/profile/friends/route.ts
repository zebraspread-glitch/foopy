import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Uses the service role key so RLS doesn't filter to the requesting user —
// this lets any visitor see the friends list of any profile.
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

  const db = adminSupabase();

  const { data: rows, error } = await db
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const friendIds = (rows ?? []).map(r =>
    r.requester_id === userId ? r.addressee_id : r.requester_id
  );

  if (friendIds.length === 0) {
    return NextResponse.json({ friends: [] });
  }

  const { data: profiles, error: profErr } = await db
    .from("profiles")
    .select("id, username, avatar_url, verified")
    .in("id", friendIds);

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  return NextResponse.json({ friends: profiles ?? [] });
}
