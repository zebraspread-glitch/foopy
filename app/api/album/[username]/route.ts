import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username: rawUsername } = await params;
  const username = rawUsername.toLowerCase();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, avatar_url")
    .ilike("username", username)
    .maybeSingle();

  if (profileError) {
    console.error("Profile query error:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile) {
    console.log("No profile found for username:", username);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { data: cards, error: cardsError } = await supabaseAdmin
    .from("user_cards")
    .select("id, player_id, rarity, rating, duplicate_count")
    .eq("user_id", profile.id);

  if (cardsError) console.error("Cards query error:", cardsError);

  return NextResponse.json({ profile, cards: cards ?? [] });
}
