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
    .select("id, username, display_name, avatar_url")
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

  const [
    { data: cards, error: cardsError },
    { data: playerPasses },
    { data: teamPass },
  ] = await Promise.all([
    supabaseAdmin.from("user_cards").select("id, player_id, rarity, rating, duplicate_count").eq("user_id", profile.id),
    supabaseAdmin.from("user_player_passes").select("id, user_id, player_id, player_name, team_name, active, xp, serial_number, created_at").eq("user_id", profile.id).eq("active", true).order("created_at", { ascending: true }),
    supabaseAdmin.from("user_team_passes").select("id, user_id, team_name, active, xp, serial_number, created_at").eq("user_id", profile.id).eq("active", true).maybeSingle(),
  ]);

  if (cardsError) console.error("Cards query error:", cardsError);

  return NextResponse.json({ profile, cards: cards ?? [], playerPasses: playerPasses ?? [], teamPass: teamPass ?? null });
}
