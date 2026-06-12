import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { dedupePlayerPasses, type PlayerPass } from "@/app/lib/passes";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const USER_CARDS_SELECT = "id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count";
const USER_CARDS_PAGE_SIZE = 1000;

async function fetchAllUserCards(userId: string) {
  const cards: unknown[] = [];

  for (let from = 0; ; from += USER_CARDS_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("user_cards")
      .select(USER_CARDS_SELECT)
      .eq("user_id", userId)
      .order("player_id", { ascending: true })
      .order("rarity", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + USER_CARDS_PAGE_SIZE - 1);

    if (error) throw error;
    cards.push(...(data ?? []));
    if (!data || data.length < USER_CARDS_PAGE_SIZE) break;
  }

  return cards;
}

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

  const [cardsResult, playerPassesResult, teamPassesResult] = await Promise.allSettled([
    fetchAllUserCards(profile.id),
    supabaseAdmin.from("user_player_passes").select("id, user_id, player_id, player_name, team_name, active, xp, serial_number, pattern, created_at").eq("user_id", profile.id).eq("active", true).order("created_at", { ascending: true }),
    supabaseAdmin.from("user_team_passes").select("id, user_id, team_name, active, xp, serial_number, pattern, created_at").eq("user_id", profile.id).eq("active", true).order("created_at", { ascending: true }),
  ]);

  if (cardsResult.status === "rejected") {
    console.error("Cards query error:", cardsResult.reason);
    return NextResponse.json({ error: "Failed to fetch cards" }, { status: 500 });
  }

  return NextResponse.json({
    profile,
    cards: cardsResult.value,
    playerPasses: playerPassesResult.status === "fulfilled"
      ? dedupePlayerPasses(((playerPassesResult.value.data ?? []) as PlayerPass[]))
      : [],
    teamPasses: teamPassesResult.status === "fulfilled" ? teamPassesResult.value.data ?? [] : [],
  });
}
