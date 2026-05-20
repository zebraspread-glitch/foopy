import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const RARITY_VALUE: Record<string, number> = {
  bronze: 1, silver: 3, gold: 10, emerald: 25, sapphire: 60,
  ruby: 150, amethyst: 300, diamond: 600, pinkdiamond: 1200, mythic: 2500,
};

async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId } = await req.json();
  if (!cardId) return NextResponse.json({ error: "Missing cardId" }, { status: 400 });

  // Fetch the card and verify ownership
  const { data: card, error: cardError } = await supabaseAdmin
    .from("user_cards")
    .select("id, user_id, rarity, duplicate_count")
    .eq("id", cardId)
    .single();

  if (cardError || !card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (card.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const coinValue = RARITY_VALUE[card.rarity] ?? 0;

  // Decrement duplicate_count or delete the card
  if (card.duplicate_count > 1) {
    await supabaseAdmin
      .from("user_cards")
      .update({ duplicate_count: card.duplicate_count - 1 })
      .eq("id", cardId);
  } else {
    await supabaseAdmin.from("user_cards").delete().eq("id", cardId);
  }

  // Add coins to profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  const newCoins = (profile?.coins ?? 0) + coinValue;
  await supabaseAdmin.from("profiles").update({ coins: newCoins }).eq("id", user.id);

  return NextResponse.json({ newCoins, coinValue });
}
