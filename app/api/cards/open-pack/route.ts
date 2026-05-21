import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { CARD_PLAYERS, getPlayerImage, pickRandom } from "@/app/data/cardPlayers";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Types ────────────────────────────────────────────────────────────────────

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";
type PackType = "starter" | "general" | "mythical";

interface PackConfig {
  cost: number;
  normalCount: number;
  normalOdds: Record<Rarity, number>;
  guaranteedMythic: boolean;
}

// ── Pack configs ─────────────────────────────────────────────────────────────

const PACK_CONFIGS: Record<PackType, PackConfig> = {
  starter: {
    cost: 100,
    normalCount: 3,
    normalOdds: { bronze: 55, silver: 30, gold: 12, emerald: 3, sapphire: 0, ruby: 0, amethyst: 0, diamond: 0, pinkdiamond: 0, mythic: 0 },
    guaranteedMythic: false,
  },
  general: {
    cost: 200,
    normalCount: 7,
    normalOdds: { bronze: 50, silver: 24, gold: 12, emerald: 6, sapphire: 3.5, ruby: 2, amethyst: 1, diamond: 0.35, pinkdiamond: 0.1, mythic: 0.05 },
    guaranteedMythic: false,
  },
  mythical: {
    cost: 3000,
    normalCount: 3,
    normalOdds: { bronze: 18, silver: 22, gold: 20, emerald: 15, sapphire: 10, ruby: 7, amethyst: 4, diamond: 2, pinkdiamond: 1, mythic: 0 },
    guaranteedMythic: true,
  },
};

// ── Rating ranges per rarity ─────────────────────────────────────────────────

const RATING_RANGES: Record<Rarity, [number, number]> = {
  bronze:      [1,   5],
  silver:      [5,   9],
  gold:        [10,  24],
  emerald:     [25,  39],
  sapphire:    [40,  54],
  ruby:        [55,  69],
  amethyst:    [70,  79],
  diamond:     [80,  89],
  pinkdiamond: [90,  99],
  mythic:      [100, 100],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function rollRarity(odds: Record<string, number>): Rarity {
  const entries = Object.entries(odds).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  let roll = Math.random() * total;
  for (const [rarity, prob] of entries) {
    roll -= prob;
    if (roll <= 0) return rarity as Rarity;
  }
  return entries[0][0] as Rarity;
}

function generateRating(rarity: Rarity): number {
  const [min, max] = RATING_RANGES[rarity];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const packType = body?.packType as PackType | undefined;

  if (!packType || !PACK_CONFIGS[packType]) {
    return NextResponse.json({ error: "Invalid pack type" }, { status: 400 });
  }

  const config = PACK_CONFIGS[packType];

  // ── 1. Fetch user's coin balance from profiles ──────────────────────────
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const currentCoins = profile?.coins ?? 0;

  if (currentCoins < config.cost) {
    return NextResponse.json({ error: "Not enough coins" }, { status: 402 });
  }

  // ── 2. Deduct coins ──────────────────────────────────────────────────────
  const { error: deductError } = await supabaseAdmin
    .from("profiles")
    .update({ coins: currentCoins - config.cost })
    .eq("id", user.id)
    .eq("coins", currentCoins); // optimistic concurrency check

  if (deductError) {
    return NextResponse.json({ error: "Failed to deduct coins — try again" }, { status: 500 });
  }

  // ── 3. Generate card rarities ────────────────────────────────────────────
  const rarities: Rarity[] = Array.from({ length: config.normalCount }, () =>
    rollRarity(config.normalOdds)
  );
  if (config.guaranteedMythic) rarities.push("mythic");

  // ── 4. Assign players to each rarity slot ───────────────────────────────
  type CardData = {
    player_id: string;
    player_name: string;
    team: string;
    team_logo: string;
    player_image: string;
    rarity: Rarity;
    rating: number;
    is_new: boolean;
  };

  const results: CardData[] = [];

  for (const rarity of rarities) {
    const player = pickRandom(CARD_PLAYERS);
    const rating = generateRating(rarity);

    // Upsert: if card already exists, increment duplicate_count
    const { data: existing } = await supabaseAdmin
      .from("user_cards")
      .select("id, duplicate_count")
      .eq("user_id", user.id)
      .eq("player_id", player.id)
      .eq("rarity", rarity)
      .single();

    let cardId: string;
    let isNew = false;

    if (existing) {
      await supabaseAdmin
        .from("user_cards")
        .update({ duplicate_count: existing.duplicate_count + 1 })
        .eq("id", existing.id);
      cardId = existing.id;
    } else {
      const { data: inserted, error: insertCardError } = await supabaseAdmin
        .from("user_cards")
        .insert({
          user_id: user.id,
          player_id: player.id,
          player_name: player.name,
          team: player.team,
          team_logo: player.teamLogo,
          rarity,
          rating,
          duplicate_count: 1,
          pack_type: packType,
        })
        .select("id")
        .single();

      if (insertCardError || !inserted) {
        // Unlikely duplicate race — just re-fetch
        const { data: reFetched } = await supabaseAdmin
          .from("user_cards")
          .select("id, duplicate_count")
          .eq("user_id", user.id)
          .eq("player_id", player.id)
          .eq("rarity", rarity)
          .single();
        cardId = reFetched?.id ?? "";
        if (reFetched) {
          await supabaseAdmin
            .from("user_cards")
            .update({ duplicate_count: reFetched.duplicate_count + 1 })
            .eq("id", reFetched.id);
        }
      } else {
        cardId = inserted.id;
        isNew = true;
      }
    }

    results.push({
      player_id: player.id,
      player_name: player.name,
      team: player.team,
      team_logo: player.teamLogo,
      player_image: getPlayerImage(player.folder, player.id),
      rarity,
      rating,
      is_new: isNew,
    });
  }

  // Keep pass XP equal to the cards currently owned by the user.
  try {
    await syncPassXpFromCards(user.id);
  } catch (err) {
    console.error("[cards/open-pack sync pass xp]", err instanceof Error ? err.message : err);
  }

  // ── 6. Record the pack opening ──────────────────────────────────────────
  const { data: opening } = await supabaseAdmin
    .from("pack_openings")
    .insert({
      user_id: user.id,
      pack_type: packType,
      cost: config.cost,
      cards_received: rarities.length,
    })
    .select("id")
    .single();

  if (opening) {
    await supabaseAdmin.from("pack_opening_cards").insert(
      results.map((r) => ({
        pack_opening_id: opening.id,
        card_id: r.player_id, // we don't store the uuid here for brevity
        rarity: r.rarity,
        player_name: r.player_name,
        is_new: r.is_new,
      }))
    );
  }

  // ── 7. Return result ─────────────────────────────────────────────────────
  const newCoins = currentCoins - config.cost;
  return NextResponse.json({ cards: results, newCoins });
}
