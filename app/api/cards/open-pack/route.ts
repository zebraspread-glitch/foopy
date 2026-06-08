import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { CARD_PLAYERS, getPlayerImage, pickRandom } from "@/app/data/cardPlayers";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Types ────────────────────────────────────────────────────────────────────

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";
type PackType =
  | "starter" | "general" | "mythical"
  | "team_crows" | "team_lions" | "team_blues" | "team_magpies" | "team_bombers"
  | "team_dockers" | "team_cats" | "team_suns" | "team_giants" | "team_hawks"
  | "team_demons" | "team_kangaroos" | "team_power" | "team_tigers" | "team_saints"
  | "team_swans" | "team_eagles" | "team_bulldogs";

interface PackConfig {
  cost: number;
  normalCount: number;
  normalOdds: Record<Rarity, number>;
  guaranteedMythic: boolean;
  /** If set, only pick players whose folder matches this slug */
  teamFolder?: string;
}

type CardInsert = {
  user_id: string;
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
  pack_type: PackType;
};

// ── Shared odds ───────────────────────────────────────────────────────────────

const GENERAL_ODDS: Record<Rarity, number> = {
  bronze: 50, silver: 24, gold: 12, emerald: 6,
  sapphire: 3.5, ruby: 2, amethyst: 1, diamond: 0.35, pinkdiamond: 0.1, mythic: 0.05,
};

function teamPackConfig(folder: string): PackConfig {
  return { cost: 500, normalCount: 7, normalOdds: GENERAL_ODDS, guaranteedMythic: false, teamFolder: folder };
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
    normalOdds: GENERAL_ODDS,
    guaranteedMythic: false,
  },
  mythical: {
    cost: 3000,
    normalCount: 3,
    normalOdds: { bronze: 18, silver: 22, gold: 20, emerald: 15, sapphire: 10, ruby: 7, amethyst: 4, diamond: 2, pinkdiamond: 1, mythic: 0 },
    guaranteedMythic: true,
  },
  // ── Team packs ───────────────────────────────────────────────────────────
  team_crows:     teamPackConfig("crows"),
  team_lions:     teamPackConfig("lions"),
  team_blues:     teamPackConfig("blues"),
  team_magpies:   teamPackConfig("magpies"),
  team_bombers:   teamPackConfig("bombers"),
  team_dockers:   teamPackConfig("dockers"),
  team_cats:      teamPackConfig("cats"),
  team_suns:      teamPackConfig("suns"),
  team_giants:    teamPackConfig("giants"),
  team_hawks:     teamPackConfig("hawks"),
  team_demons:    teamPackConfig("demons"),
  team_kangaroos: teamPackConfig("kangaroos"),
  team_power:     teamPackConfig("power"),
  team_tigers:    teamPackConfig("tigers"),
  team_saints:    teamPackConfig("saints"),
  team_swans:     teamPackConfig("swans"),
  team_eagles:    teamPackConfig("eagles"),
  team_bulldogs:  teamPackConfig("bulldogs"),
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

function isDuplicateError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate") || message.includes("unique");
}

async function incrementCardDuplicateCount(cardId: string, by: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: readError } = await supabaseAdmin
      .from("user_cards")
      .select("duplicate_count")
      .eq("id", cardId)
      .single();

    if (readError || !current) {
      throw new Error(readError?.message ?? "Card row disappeared while opening pack");
    }

    const previousCount = Number(current.duplicate_count ?? 0);
    const { error: updateError, count } = await supabaseAdmin
      .from("user_cards")
      .update({ duplicate_count: previousCount + by }, { count: "exact" })
      .eq("id", cardId)
      .eq("duplicate_count", previousCount);

    if (updateError) throw new Error(updateError.message);
    if (count === 1) return;
  }

  throw new Error("Could not update card duplicate count");
}

async function grantCard(row: CardInsert) {
  const { error } = await supabaseAdmin.from("user_cards").insert(row);
  if (!error) return;

  if (!isDuplicateError(error)) throw new Error(error.message);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_cards")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("player_id", row.player_id)
    .eq("rarity", row.rarity)
    .single();

  if (existingError || !existing) {
    throw new Error(existingError?.message ?? "Duplicate card exists but could not be loaded");
  }

  await incrementCardDuplicateCount(existing.id, row.duplicate_count);
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

  // ── 1. Generate assignments first (pure JS, zero DB) ─────────────────────
  // Doing this before any DB call lets us query existing cards in parallel
  // with the balance check, saving one full serial round trip.
  const playerPool = config.teamFolder
    ? CARD_PLAYERS.filter(p => p.folder === config.teamFolder)
    : CARD_PLAYERS;
  // Fallback to full pool if team folder has no players (shouldn't happen)
  const pool = playerPool.length > 0 ? playerPool : CARD_PLAYERS;

  const assignments = Array.from({ length: config.normalCount }, () => {
    const rarity = rollRarity(config.normalOdds);
    return { player: pickRandom(pool), rarity, rating: generateRating(rarity) };
  });
  if (config.guaranteedMythic) {
    assignments.push({ player: pickRandom(pool), rarity: "mythic" as Rarity, rating: 100 });
  }
  const uniquePlayerIds = [...new Set(assignments.map(a => a.player.id))];

  // ── 2. Fetch balance + existing cards in PARALLEL ─────────────────────────
  // Previously these were sequential (SELECT coins → UPDATE → SELECT existing).
  // Now both SELECTs run simultaneously — one fewer serial DB round trip.
  const [profileResult, existingCardsResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("coins").eq("id", user.id).single(),
    supabaseAdmin.from("user_cards")
      .select("id, player_id, rarity, duplicate_count")
      .eq("user_id", user.id)
      .in("player_id", uniquePlayerIds),
  ]);

  if (profileResult.error) {
    return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  }

  if (existingCardsResult.error) {
    return NextResponse.json({ error: existingCardsResult.error.message }, { status: 500 });
  }

  const currentCoins = profileResult.data?.coins ?? 0;
  if (currentCoins < config.cost) {
    return NextResponse.json({ error: "Not enough coins" }, { status: 402 });
  }

  // ── 3. Deduct coins (optimistic concurrency) ──────────────────────────────
  const { error: deductError, count: deductCount } = await supabaseAdmin
    .from("profiles")
    .update({ coins: currentCoins - config.cost }, { count: "exact" })
    .eq("id", user.id)
    .eq("coins", currentCoins);

  if (deductError || deductCount !== 1) {
    if (deductError) console.error("[cards/open-pack] deduct failed:", deductError.message);
    return NextResponse.json(
      { error: "Failed to deduct coins - try again" },
      { status: deductError ? 500 : 409 }
    );
  }

  type ExistingCard = { id: string; player_id: string; rarity: Rarity; duplicate_count: number };
  const existingMap = new Map<string, ExistingCard>();
  for (const c of (existingCardsResult.data ?? []) as ExistingCard[]) {
    existingMap.set(`${c.player_id}:${c.rarity}`, c);
  }

  // ── 5. Categorise into inserts vs updates ─────────────────────────────────
  // Track how many times each player+rarity appears in THIS pack
  const packCountMap = new Map<string, number>();
  for (const { player, rarity } of assignments) {
    const key = `${player.id}:${rarity}`;
    packCountMap.set(key, (packCountMap.get(key) ?? 0) + 1);
  }

  // Which unique keys need a fresh insert vs an update to existing row
  const toInsert: CardInsert[] = [];
  const toUpdate: { id: string; addCount: number }[] = [];

  for (const [key, packCount] of packCountMap) {
    const existing = existingMap.get(key);
    if (existing) {
      toUpdate.push({ id: existing.id, addCount: packCount });
    } else {
      // Find one assignment for this key to get player/rarity/rating details
      const [playerId, rarity] = key.split(":") as [string, Rarity];
      const sample = assignments.find(a => a.player.id === playerId && a.rarity === rarity)!;
      toInsert.push({
        user_id: user.id,
        player_id: sample.player.id,
        player_name: sample.player.name,
        team: sample.player.team,
        team_logo: sample.player.teamLogo,
        rarity: sample.rarity,
        rating: sample.rating,
        duplicate_count: packCount,
        pack_type: packType,
      });
    }
  }

  // ── 6. Grant cards with checked writes ─────────────────────────────────────
  try {
    for (const row of toInsert) await grantCard(row);
    for (const { id, addCount } of toUpdate) await incrementCardDuplicateCount(id, addCount);
  } catch (err) {
    console.error("[cards/open-pack] card grant failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to grant cards" }, { status: 500 });
  }

  // ── 7. Build result payload ───────────────────────────────────────────────
  const seenNewKeys = new Set<string>();
  const results = assignments.map(({ player, rarity, rating }) => {
    const key = `${player.id}:${rarity}`;
    const isNew = !existingMap.has(key) && !seenNewKeys.has(key);
    if (isNew) seenNewKeys.add(key);
    return {
      player_id: player.id,
      player_name: player.name,
      team: player.team,
      team_logo: player.teamLogo,
      player_image: getPlayerImage(player.folder, player.id),
      rarity,
      rating,
      is_new: isNew,
    };
  });

  const newCoins = currentCoins - config.cost;

  // ── 8. Defer non-critical work until AFTER the response is sent ───────────
  // Pass XP sync and analytics logging don't affect what the user sees —
  // run them after responding so they don't add to the user-facing latency.
  after(async () => {
    try {
      await syncPassXpFromCards(user.id);
    } catch (err) {
      console.error("[cards/open-pack] syncPassXpFromCards failed:", err instanceof Error ? err.message : err);
    }

    try {
      const { data: opening } = await supabaseAdmin
        .from("pack_openings")
        .insert({ user_id: user.id, pack_type: packType, cost: config.cost, cards_received: results.length })
        .select("id")
        .single();

      if (opening) {
        await supabaseAdmin.from("pack_opening_cards").insert(
          results.map(r => ({
            pack_opening_id: opening.id,
            card_id: r.player_id,
            rarity: r.rarity,
            player_name: r.player_name,
            is_new: r.is_new,
          }))
        );
      }
    } catch (err) {
      console.error("[cards/open-pack] pack logging failed:", err instanceof Error ? err.message : err);
    }
  });

  return NextResponse.json({ cards: results, newCoins });
}
