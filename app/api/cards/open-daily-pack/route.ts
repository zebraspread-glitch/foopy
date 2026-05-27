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

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";

// Daily pack: 3 cards, free, resets at UTC midnight, up to Ruby rarity
const DAILY_ODDS: Record<Rarity, number> = {
  bronze: 45, silver: 30, gold: 15, emerald: 7, sapphire: 2, ruby: 1,
  amethyst: 0, diamond: 0, pinkdiamond: 0, mythic: 0,
};

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

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Daily pack resets at UTC midnight.
  // Compute start-of-today in UTC for the WHERE filter.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // ── 1. Atomic claim ──────────────────────────────────────────────────────
  // Update last_daily_pack_at only when it's NULL or before today (UTC).
  // If 0 rows are updated, the user already claimed today → reject.
  // This is race-condition safe: two rapid taps will only ever produce one success.
  const { data: claimResult, error: claimError } = await supabaseAdmin
    .from("profiles")
    .update({ last_daily_pack_at: new Date().toISOString() })
    .eq("id", user.id)
    .or(`last_daily_pack_at.is.null,last_daily_pack_at.lt.${todayStart.toISOString()}`)
    .select("id");

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimResult || claimResult.length === 0) {
    return NextResponse.json({ error: "Already claimed today" }, { status: 429 });
  }

  // ── 2. Generate 3 daily cards (pure JS) ──────────────────────────────────
  const assignments = Array.from({ length: 3 }, () => {
    const rarity = rollRarity(DAILY_ODDS);
    return { player: pickRandom(CARD_PLAYERS), rarity, rating: generateRating(rarity) };
  });
  const uniquePlayerIds = [...new Set(assignments.map(a => a.player.id))];

  // ── 3. Fetch existing cards for these players ─────────────────────────────
  const { data: existingCards } = await supabaseAdmin
    .from("user_cards")
    .select("id, player_id, rarity, duplicate_count")
    .eq("user_id", user.id)
    .in("player_id", uniquePlayerIds);

  type ExistingCard = { id: string; player_id: string; rarity: Rarity; duplicate_count: number };
  const existingMap = new Map<string, ExistingCard>();
  for (const c of (existingCards ?? []) as ExistingCard[]) {
    existingMap.set(`${c.player_id}:${c.rarity}`, c);
  }

  // ── 4. Categorise into inserts vs updates ─────────────────────────────────
  const packCountMap = new Map<string, number>();
  for (const { player, rarity } of assignments) {
    const key = `${player.id}:${rarity}`;
    packCountMap.set(key, (packCountMap.get(key) ?? 0) + 1);
  }

  const toInsert: object[] = [];
  const toUpdate: { id: string; newCount: number }[] = [];

  for (const [key, packCount] of packCountMap) {
    const existing = existingMap.get(key);
    if (existing) {
      toUpdate.push({ id: existing.id, newCount: existing.duplicate_count + packCount });
    } else {
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
        pack_type: "daily",
      });
    }
  }

  // ── 5. Batch insert + parallel updates ────────────────────────────────────
  await Promise.all([
    toInsert.length > 0
      ? supabaseAdmin.from("user_cards").insert(toInsert)
      : Promise.resolve(),
    ...toUpdate.map(({ id, newCount }) =>
      supabaseAdmin.from("user_cards").update({ duplicate_count: newCount }).eq("id", id)
    ),
  ]);

  // ── 6. Build result payload ───────────────────────────────────────────────
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

  // ── 7. Defer XP sync until after response is sent ────────────────────────
  after(async () => {
    try {
      await syncPassXpFromCards(user.id);
    } catch (err) {
      console.error("[daily-pack] syncPassXpFromCards failed:", err instanceof Error ? err.message : err);
    }
  });

  return NextResponse.json({ cards: results });
}
