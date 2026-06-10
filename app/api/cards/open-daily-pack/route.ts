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

  // Daily pack resets at midnight AEDT/AEST (Australia/Sydney time).
  // AEDT = UTC+11 (Oct–Apr), AEST = UTC+10 (Apr–Oct).
  // We derive the UTC instant of midnight-Sydney for the current Sydney date
  // using the Intl API so DST transitions are handled automatically.
  const todayStart = (() => {
    const now = new Date();
    // Get year/month/day and the UTC offset string in the Sydney timezone
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric", month: "2-digit", day: "2-digit",
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const year   = parts.find(p => p.type === "year")?.value  ?? "2026";
    const month  = parts.find(p => p.type === "month")?.value ?? "01";
    const day    = parts.find(p => p.type === "day")?.value   ?? "01";
    const tzName = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+10";
    // "GMT+10" → "+10:00",  "GMT+11" → "+11:00"
    const m = tzName.match(/GMT([+-]\d+)/);
    const h = m ? Number(m[1]) : 10;
    const offset = `${h >= 0 ? "+" : "-"}${String(Math.abs(h)).padStart(2, "0")}:00`;
    // Midnight Sydney expressed as a UTC instant
    return new Date(`${year}-${month}-${day}T00:00:00${offset}`);
  })();

  // ── 1. Atomic claim ──────────────────────────────────────────────────────
  // Update last_daily_pack_at only when it's NULL or before midnight AEDT today.
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

  // Players the user already owns at ANY rarity — used for the "NEW" badge,
  // which marks a genuinely new player (not a new rarity of a player you have).
  type ExistingCard = { player_id: string };
  const existingPlayerIds = new Set<string>(
    ((existingCards ?? []) as ExistingCard[]).map(c => c.player_id),
  );

  // ── 4. Insert one row per individual card ─────────────────────────────────
  // Every card pulled is its own row (its own id, rating and created_at) so
  // duplicates sort independently and a freshly pulled card is always "newest".
  const rows = assignments.map(({ player, rarity, rating }) => ({
    user_id: user.id,
    player_id: player.id,
    player_name: player.name,
    team: player.team,
    team_logo: player.teamLogo,
    rarity,
    rating,
    duplicate_count: 1,
    pack_type: "daily",
  }));

  const { error: insertError } = await supabaseAdmin.from("user_cards").insert(rows);
  if (insertError) {
    console.error("[daily-pack] card insert failed:", insertError.message);
    return NextResponse.json({ error: "Failed to grant cards" }, { status: 500 });
  }

  // ── 6. Build result payload ───────────────────────────────────────────────
  // NEW = first time the user has ever pulled this player, regardless of rarity.
  // (Within one pack, only the first card of a brand-new player is flagged.)
  const seenNewPlayers = new Set<string>();
  const results = assignments.map(({ player, rarity, rating }) => {
    const isNew = !existingPlayerIds.has(player.id) && !seenNewPlayers.has(player.id);
    if (isNew) seenNewPlayers.add(player.id);
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
