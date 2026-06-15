"use client";

import { formatCoins } from "@/app/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import { supabase } from "@/app/lib/supabase";
import { useSession } from "@/app/context/SessionProvider";
import TradesInboxModal from "@/app/components/TradesInboxModal";
import { PlayerCard as SharedPlayerCard } from "@/app/components/PlayerCard";
import { CardGridSkeleton } from "@/app/components/Skeleton";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";

const USER_CARDS_PAGE_SIZE = 1000;

async function fetchAllUserCards(userId: string): Promise<UserCard[]> {
  const cards: UserCard[] = [];

  for (let from = 0; ; from += USER_CARDS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + USER_CARDS_PAGE_SIZE - 1);

    if (error) throw error;
    cards.push(...((data ?? []) as UserCard[]));
    if (!data || data.length < USER_CARDS_PAGE_SIZE) break;
  }

  return cards;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";
type PackType =
  | "starter" | "general" | "mythical" | "daily"
  | "team_crows" | "team_lions" | "team_blues" | "team_magpies" | "team_bombers"
  | "team_dockers" | "team_cats" | "team_suns" | "team_giants" | "team_hawks"
  | "team_demons" | "team_kangaroos" | "team_power" | "team_tigers" | "team_saints"
  | "team_swans" | "team_eagles" | "team_bulldogs";
type SortKey = "newest" | "rating_desc" | "rating_asc" | "rarity";

interface UserCard {
  id: string;
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
  pack_type: string;
  created_at: string;
}

interface OpenedCard {
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  player_image: string;
  rarity: Rarity;
  rating: number;
  is_new: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_ORDER: Record<Rarity, number> = {
  bronze: 0, silver: 1, gold: 2, emerald: 3, sapphire: 4,
  ruby: 5, amethyst: 6, diamond: 7, pinkdiamond: 8, mythic: 9,
};

const RARITY_META: Record<Rarity, { label: string; color: string; glow: string; bg: string }> = {
  bronze:      { label: "Bronze",       color: "#cd7f32", glow: "rgba(205,127,50,0.55)",   bg: "rgba(205,127,50,0.12)" },
  silver:      { label: "Silver",       color: "#c0c0c0", glow: "rgba(192,192,192,0.55)",  bg: "rgba(192,192,192,0.10)" },
  gold:        { label: "Gold",         color: "#ffd700", glow: "rgba(255,215,0,0.55)",    bg: "rgba(255,215,0,0.12)" },
  emerald:     { label: "Emerald",      color: "#10b981", glow: "rgba(16,185,129,0.60)",   bg: "rgba(16,185,129,0.12)" },
  sapphire:    { label: "Sapphire",     color: "#3b82f6", glow: "rgba(59,130,246,0.60)",   bg: "rgba(59,130,246,0.12)" },
  ruby:        { label: "Ruby",         color: "#ef4444", glow: "rgba(239,68,68,0.60)",    bg: "rgba(239,68,68,0.12)" },
  amethyst:    { label: "Amethyst",     color: "#a78bfa", glow: "rgba(167,139,250,0.65)",  bg: "rgba(167,139,250,0.12)" },
  diamond:     { label: "Diamond",      color: "#67e8f9", glow: "rgba(103,232,249,0.65)",  bg: "rgba(103,232,249,0.12)" },
  pinkdiamond: { label: "Pink Diamond", color: "#f472b6", glow: "rgba(244,114,182,0.65)",  bg: "rgba(244,114,182,0.12)" },
  mythic:      { label: "Mythic",       color: "#c084fc", glow: "rgba(192,132,252,0.75)",  bg: "rgba(192,132,252,0.14)" },
};

const TEAM_PLAYER_FOLDER: Record<string, string> = {
  Adelaide: "crows",
  "Adelaide Crows": "crows",
  Brisbane: "lions",
  "Brisbane Lions": "lions",
  Carlton: "blues",
  "Carlton Blues": "blues",
  Collingwood: "magpies",
  "Collingwood Magpies": "magpies",
  Essendon: "bombers",
  "Essendon Bombers": "bombers",
  Fremantle: "dockers",
  "Fremantle Dockers": "dockers",
  Geelong: "cats",
  "Geelong Cats": "cats",
  "Gold Coast": "suns",
  "Gold Coast Suns": "suns",
  GWS: "giants",
  "GWS Giants": "giants",
  "Greater Western Sydney": "giants",
  Hawthorn: "hawks",
  "Hawthorn Hawks": "hawks",
  Melbourne: "demons",
  "Melbourne Demons": "demons",
  "North Melbourne": "kangaroos",
  "North Melbourne Kangaroos": "kangaroos",
  "Port Adelaide": "power",
  "Port Adelaide Power": "power",
  Richmond: "tigers",
  "Richmond Tigers": "tigers",
  "St Kilda": "saints",
  "St Kilda Saints": "saints",
  Sydney: "swans",
  "Sydney Swans": "swans",
  "West Coast": "eagles",
  "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
  Bulldogs: "bulldogs",
};

const PACKS: { type: PackType; label: string; cost: number; cards: string; image: string; accent: string; description: string }[] = [
  {
    type: "daily",
    label: "Daily Pack",
    cost: 0,
    cards: "3 cards",
    image: "/packs/daily.png",
    accent: "#22c55e",
    description: "Free daily · up to Ruby rarity",
  },
  {
    type: "starter",
    label: "Starter Pack",
    cost: 100,
    cards: "3 cards",
    image: "/packs/starter.png",
    accent: "#cd7f32",
    description: "Up to Emerald rarity",
  },
  {
    type: "general",
    label: "General Pack",
    cost: 200,
    cards: "7 cards",
    image: "/packs/general.png",
    accent: "#ffd700",
    description: "Up to Mythic rarity",
  },
  {
    type: "mythical",
    label: "Mythical Pack",
    cost: 3000,
    cards: "4 cards",
    image: "/packs/mythical.png",
    accent: "#c084fc",
    description: "3 cards + 1 guaranteed Mythic",
  },
];

// Team packs — separate list so they render in their own section
const TEAM_PACKS: { type: PackType; label: string; cost: number; cards: string; image: string; accent: string; description: string }[] = [
  { type: "team_crows",     label: "Adelaide Crows",     cost: 500, cards: "7 cards", image: "/packs/crows.png",     accent: "#e8c84a", description: "Adelaide Crows · 7 team cards" },
  { type: "team_lions",     label: "Brisbane Lions",     cost: 500, cards: "7 cards", image: "/packs/lions.png",     accent: "#e8860f", description: "Brisbane Lions · 7 team cards" },
  { type: "team_blues",     label: "Carlton",            cost: 500, cards: "7 cards", image: "/packs/blues.png",     accent: "#60a5fa", description: "Carlton Blues · 7 team cards" },
  { type: "team_magpies",   label: "Collingwood",        cost: 500, cards: "7 cards", image: "/packs/magpies.png",   accent: "#e0e0e0", description: "Collingwood Magpies · 7 team cards" },
  { type: "team_bombers",   label: "Essendon",           cost: 500, cards: "7 cards", image: "/packs/bombers.png",   accent: "#ef4444", description: "Essendon Bombers · 7 team cards" },
  { type: "team_dockers",   label: "Fremantle",          cost: 500, cards: "7 cards", image: "/packs/dockers.png",   accent: "#a855f7", description: "Fremantle Dockers · 7 team cards" },
  { type: "team_cats",      label: "Geelong",            cost: 500, cards: "7 cards", image: "/packs/cats.png",      accent: "#3b82f6", description: "Geelong Cats · 7 team cards" },
  { type: "team_suns",      label: "Gold Coast",         cost: 500, cards: "7 cards", image: "/packs/suns.png",      accent: "#f59e0b", description: "Gold Coast Suns · 7 team cards" },
  { type: "team_giants",    label: "GWS Giants",         cost: 500, cards: "7 cards", image: "/packs/giants.png",    accent: "#f97316", description: "GWS Giants · 7 team cards" },
  { type: "team_hawks",     label: "Hawthorn",           cost: 500, cards: "7 cards", image: "/packs/hawks.png",     accent: "#d97706", description: "Hawthorn Hawks · 7 team cards" },
  { type: "team_demons",    label: "Melbourne",          cost: 500, cards: "7 cards", image: "/packs/demons.png",    accent: "#ef4444", description: "Melbourne Demons · 7 team cards" },
  { type: "team_kangaroos", label: "North Melbourne",    cost: 500, cards: "7 cards", image: "/packs/kangaroos.png", accent: "#60a5fa", description: "North Melbourne Kangaroos · 7 team cards" },
  { type: "team_power",     label: "Port Adelaide",      cost: 500, cards: "7 cards", image: "/packs/power.png",     accent: "#06b6d4", description: "Port Adelaide Power · 7 team cards" },
  { type: "team_tigers",    label: "Richmond",           cost: 500, cards: "7 cards", image: "/packs/tigers.png",    accent: "#facc15", description: "Richmond Tigers · 7 team cards" },
  { type: "team_saints",    label: "St Kilda",           cost: 500, cards: "7 cards", image: "/packs/saints.png",    accent: "#ef4444", description: "St Kilda Saints · 7 team cards" },
  { type: "team_swans",     label: "Sydney",             cost: 500, cards: "7 cards", image: "/packs/swans.png",     accent: "#f43f5e", description: "Sydney Swans · 7 team cards" },
  { type: "team_eagles",    label: "West Coast",         cost: 500, cards: "7 cards", image: "/packs/eagles.png",    accent: "#3b82f6", description: "West Coast Eagles · 7 team cards" },
  { type: "team_bulldogs",  label: "Western Bulldogs",   cost: 500, cards: "7 cards", image: "/packs/bulldogs.png",  accent: "#4f75e0", description: "Western Bulldogs · 7 team cards" },
];

const GENERAL_ODDS_DISPLAY: { rarity: Rarity; pct: string }[] = [
  { rarity: "bronze", pct: "50%" },      { rarity: "silver", pct: "24%" },
  { rarity: "gold", pct: "12%" },        { rarity: "emerald", pct: "6%" },
  { rarity: "sapphire", pct: "3.5%" },   { rarity: "ruby", pct: "2%" },
  { rarity: "amethyst", pct: "1%" },     { rarity: "diamond", pct: "0.35%" },
  { rarity: "pinkdiamond", pct: "0.1%" }, { rarity: "mythic", pct: "0.05%" },
];

const RARITY_ODDS: Record<PackType, { rarity: Rarity; pct: string }[]> = {
  daily: [
    { rarity: "bronze", pct: "45%" }, { rarity: "silver", pct: "30%" },
    { rarity: "gold", pct: "15%" },   { rarity: "emerald", pct: "7%" },
    { rarity: "sapphire", pct: "2%" }, { rarity: "ruby", pct: "1%" },
  ],
  starter: [
    { rarity: "bronze", pct: "55%" }, { rarity: "silver", pct: "30%" },
    { rarity: "gold", pct: "12%" },   { rarity: "emerald", pct: "3%" },
  ],
  general: GENERAL_ODDS_DISPLAY,
  mythical: [
    { rarity: "bronze", pct: "18%" },   { rarity: "silver", pct: "22%" },
    { rarity: "gold", pct: "20%" },     { rarity: "emerald", pct: "15%" },
    { rarity: "sapphire", pct: "10%" }, { rarity: "ruby", pct: "7%" },
    { rarity: "amethyst", pct: "4%" },  { rarity: "diamond", pct: "2%" },
    { rarity: "pinkdiamond", pct: "1%" }, { rarity: "mythic", pct: "100% (1 guaranteed)" },
  ],
  // Team packs — all share general odds
  team_crows:     GENERAL_ODDS_DISPLAY,
  team_lions:     GENERAL_ODDS_DISPLAY,
  team_blues:     GENERAL_ODDS_DISPLAY,
  team_magpies:   GENERAL_ODDS_DISPLAY,
  team_bombers:   GENERAL_ODDS_DISPLAY,
  team_dockers:   GENERAL_ODDS_DISPLAY,
  team_cats:      GENERAL_ODDS_DISPLAY,
  team_suns:      GENERAL_ODDS_DISPLAY,
  team_giants:    GENERAL_ODDS_DISPLAY,
  team_hawks:     GENERAL_ODDS_DISPLAY,
  team_demons:    GENERAL_ODDS_DISPLAY,
  team_kangaroos: GENERAL_ODDS_DISPLAY,
  team_power:     GENERAL_ODDS_DISPLAY,
  team_tigers:    GENERAL_ODDS_DISPLAY,
  team_saints:    GENERAL_ODDS_DISPLAY,
  team_swans:     GENERAL_ODDS_DISPLAY,
  team_eagles:    GENERAL_ODDS_DISPLAY,
  team_bulldogs:  GENERAL_ODDS_DISPLAY,
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const ALL_TEAMS = [
  "Adelaide",
  "Brisbane Lions",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong",
  "Gold Coast",
  "GWS",
  "Hawthorn",
  "Melbourne",
  "North Melbourne",
  "Port Adelaide",
  "Richmond",
  "St Kilda",
  "Sydney",
  "West Coast",
  "Western Bulldogs",
];


type CardImageSource = Pick<UserCard, "player_id" | "player_name" | "team"> & {
  player_image?: string;
};

const CARD_IMAGE_ALIASES: Record<string, string[]> = {
  archiemay: ["archermay"],
  bodieryan: ["brodieryan"],
  bradleyclose: ["bradclose"],
  chrisscerri: ["christopherscerri"],
  connornash: ["conornash"],
  danielbutler: ["danbutler"],
  josephfonti: ["joefonti"],
  joshdraper: ["joshuadraper"],
  joshuagibcus: ["joshgibcus"],
  joshuakelly: ["joshkelly"],
  kaylegerreyn: ["kaylegerryn"],
  lennoxhoffman: ["lennoxhofmann"],
  leolombard: ["leonardolombard"],
  matthewroberts: ["mattyroberts"],
  mitchellewis: ["mitchlewis"],
  mitchitoowens: ["mitchowens"],
  nickdriscoll: ["nicholasdriscoll"],
  nikolascox: ["nikcox"],
  noahrobertsthomson: ["noahrobertsthompson"],
  olliedempsey: ["oliverdempsey"],
  olliegreeves: ["olivergreeves"],
  roberthansenjr: ["roberthansen"],
  thomassims: ["tomsims"],
  willgreen: ["williamgreen"],
  zacharywilliams: ["zacwilliams"],
};

function normalizePlayerId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getTeamPlayerFolder(team: string) {
  return TEAM_PLAYER_FOLDER[team] ?? normalizePlayerId(team);
}

function getPlayerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function cardImageCandidates(card: CardImageSource) {
  const folder = getTeamPlayerFolder(card.team);
  const playerId = normalizePlayerId(card.player_id);
  const nameId = normalizePlayerId(card.player_name);
  const urls: string[] = [];
  const add = (url?: string) => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  add(card.player_image);
  add(`${PLAYER_IMG_BASE}/${folder}/${playerId}.png`);
  add(`${PLAYER_IMG_BASE}/${folder}/${nameId}.png`);
  CARD_IMAGE_ALIASES[playerId]?.forEach((alias) => add(`${PLAYER_IMG_BASE}/${folder}/${alias}.png`));

  return urls;
}

const cardPlayerImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center top",
};

const cardPlayerFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8%",
  color: "var(--text-1)",
  fontSize: "clamp(12px, 2.4vw, 18px)",
  fontWeight: 1000,
  lineHeight: 1,
  textAlign: "center",
  textShadow: "0 1px 8px rgba(0,0,0,.65)",
};

function CardPlayerImage({
  card,
  imageStyle,
  fallbackStyle,
  loading = "lazy",
}: {
  card: CardImageSource;
  imageStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
  loading?: "eager" | "lazy";
}) {
  const candidates = useMemo(
    () => cardImageCandidates(card),
    [card.player_id, card.player_name, card.team, card.player_image],
  );
  const candidateKey = candidates.join("|");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  if (!src) {
    return (
      <div style={{ ...cardPlayerFallbackStyle, ...fallbackStyle }}>
        {getPlayerInitials(card.player_name)}
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={card.player_name}
      loading={loading}
      onError={() => setCandidateIndex((index) => index + 1)}
      style={imageStyle}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// How many cards to render at once. The rest stream in as you scroll, so a
// large collection never blocks the main thread on first paint.
const CARDS_LAZY_BATCH = 24;

export default function CardsPage() {
  const { user, accessToken, loading: authLoading, profile, refreshProfile, mutateProfile } = useSession();
  const coins = profile?.coins ?? 0;
  const [showTradesInbox, setShowTradesInbox] = useState(false);
  const [prefetchedTrades, setPrefetchedTrades] = useState<any[] | undefined>(undefined);
  const [cards, setCards] = useState<UserCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [opening, setOpening] = useState<PackType | null>(null);
  const [openedCards, setOpenedCards] = useState<OpenedCard[] | null>(null);
  const [shopPack, setShopPack] = useState<PackType | null>(null);
  // pendingPackType: set immediately when user taps "Open Pack", cleared when cards arrive.
  // Drives the instant loading overlay so the UI responds without waiting for the API.
  const [pendingPackType, setPendingPackType] = useState<PackType | null>(null);
  // lastDailyPackAt: timestamp of last daily pack claim (null = never claimed).
  const [lastDailyPackAt, setLastDailyPackAt] = useState<string | null>(null);

  // filters
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");


  // card options modal
  const [sellCard, setSellCard] = useState<UserCard | null>(null);

  // featured cards
  const [featuredCards, setFeaturedCards] = useState<{ player_id: string; rarity: Rarity }[]>([]);

  // ── Auth ──────────────────────────────────────────────────────────────────

  // Pre-fetch trades in the background so the inbox opens instantly.
  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/trades", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPrefetchedTrades(d.trades ?? []); })
      .catch(() => {});
  }, [accessToken]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    // Fast query: coins + daily-pack claimed state. Rendered immediately so the
    // header isn't gated behind the (slow, paginated) card-collection fetch.
    supabase
      .from("profiles")
      .select("featured_cards, last_daily_pack_at")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setLastDailyPackAt(data.last_daily_pack_at ?? null);
        if (Array.isArray(data.featured_cards)) {
          setFeaturedCards(data.featured_cards as { player_id: string; rarity: Rarity }[]);
        }
      });

    // Slower query: full card collection (paged). Runs independently so the grid
    // fills in when ready without blocking coins/daily-pack from showing.
    setCardsLoading(true);
    fetchAllUserCards(user.id)
      .then((fetchedCards) => {
        setCards(fetchedCards);
        setCardsLoading(false);
      })
      .catch((err) => {
        console.error("[cards fetch]", err);
        setCardsLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!teamMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (teamMenuRef.current?.contains(event.target as Node)) return;
      setTeamMenuOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [teamMenuOpen]);

  // ── Pack opening ──────────────────────────────────────────────────────────

  async function handleOpenPack(packType: PackType) {
    if (opening || !accessToken) return;

    // ── Instant feedback — don't wait for the API ──────────────────────────
    // 1. Close the pack detail modal immediately.
    // 2. Show the full-screen loading overlay right away.
    // 3. Optimistically deduct coins so the balance updates without delay.
    const packCost = [...PACKS, ...TEAM_PACKS].find(p => p.type === packType)?.cost ?? 0;
    const coinsBefore = coins;
    setOpening(packType);
    setShopPack(null);
    setPendingPackType(packType);
    mutateProfile({ coins: Math.max(0, coinsBefore - packCost) });

    try {
      const res = await fetch("/api/cards/open-pack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ packType }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Roll back the optimistic deduction on failure.
        mutateProfile({ coins: coinsBefore });
        setPendingPackType(null);
        alert(data.error ?? "Failed to open pack");
        return;
      }
      // Server confirms exact balance (handles any race conditions).
      mutateProfile({ coins: data.newCoins });
      setOpenedCards(data.cards as OpenedCard[]);
      setPendingPackType(null);
      // Sync coins + aura (and anything else the pack changed) from the server.
      void refreshProfile();
    } catch {
      mutateProfile({ coins: coinsBefore });
      setPendingPackType(null);
      alert("Something went wrong. Please try again.");
    } finally {
      setOpening(null);
    }
  }

  // ── Daily pack ────────────────────────────────────────────────────────────

  async function handleClaimDailyPack() {
    if (opening || !accessToken) return;
    if (!isDailyAvailable(lastDailyPackAt)) return;

    // Instant feedback: show loading overlay + optimistically mark as claimed
    setOpening("daily");
    setShopPack(null);
    setPendingPackType("daily");
    setLastDailyPackAt(new Date().toISOString()); // optimistic — prevents double-tap

    try {
      const res = await fetch("/api/cards/open-daily-pack", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        // 429 = already claimed (race) — keep optimistic claimed state, no alert needed
        if (res.status !== 429) {
          setLastDailyPackAt(null); // rollback on real errors only
          alert(data.error ?? "Failed to claim daily pack");
        }
        setPendingPackType(null);
        return;
      }
      setOpenedCards(data.cards as OpenedCard[]);
      setPendingPackType(null);
    } catch {
      setLastDailyPackAt(null); // rollback
      setPendingPackType(null);
      alert("Something went wrong. Please try again.");
    } finally {
      setOpening(null);
    }
  }

  // ── Featured cards ────────────────────────────────────────────────────────

  async function toggleFeaturedCard(playerId: string, rarity: Rarity) {
    if (!user) return;
    const isFeatured = featuredCards.some(f => f.player_id === playerId);
    let newFeatured: { player_id: string; rarity: Rarity }[];
    if (isFeatured) {
      newFeatured = featuredCards.filter(f => f.player_id !== playerId);
    } else {
      if (featuredCards.length >= 15) return;
      newFeatured = [...featuredCards, { player_id: playerId, rarity }];
    }
    setFeaturedCards(newFeatured);
    await supabase.from("profiles").update({ featured_cards: newFeatured }).eq("id", user.id);
  }

  // ── Filter + Sort ─────────────────────────────────────────────────────────

  const displayCards = useMemo(() => {
    let result = [...cards];
    if (rarityFilter !== "all") result = result.filter((c) => c.rarity === rarityFilter);
    if (teamFilter !== "all") result = result.filter((c) => c.team === teamFilter);

    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "rating_desc") return b.rating - a.rating;
      if (sortBy === "rating_asc") return a.rating - b.rating;
      if (sortBy === "rarity") return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
      return 0;
    });

    // Expand each stored row into one entry per individual card owned, so the
    // collection lists every card the user holds (duplicates included), not
    // just unique player+rarity types.
    const expanded: { key: string; card: UserCard }[] = [];
    for (const c of result) {
      const copies = Math.max(1, c.duplicate_count ?? 1);
      for (let i = 0; i < copies; i++) expanded.push({ key: `${c.id}-${i}`, card: c });
    }
    return expanded;
  }, [cards, rarityFilter, teamFilter, sortBy]);

  // True total — sum of every individual card across all rows.
  const totalCardCount = useMemo(
    () => cards.reduce((sum, c) => sum + Math.max(1, c.duplicate_count ?? 1), 0),
    [cards],
  );

  // Render the grid in batches so a big collection doesn't freeze the UI on
  // first paint (the freeze is what made buttons feel like they needed multiple
  // taps). More cards stream in as the sentinel scrolls into view.
  const [visibleCount, setVisibleCount] = useState(CARDS_LAZY_BATCH);
  const gridSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(CARDS_LAZY_BATCH);
  }, [rarityFilter, teamFilter, sortBy, cards]);

  useEffect(() => {
    const el = gridSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((v) => Math.min(v + CARDS_LAZY_BATCH, displayCards.length));
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayCards.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <main style={pageStyle}>
        <PageHeader title="Cards" />
        <CardGridSkeleton count={6} />
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes revealRing { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(3.5); opacity: 0; } }
        @keyframes revealFlash { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes revealText { 0% { opacity: 0; transform: translateX(-50%) scale(0.7); } 30% { opacity: 1; transform: translateX(-50%) scale(1.08); } 65% { opacity: 1; transform: translateX(-50%) scale(1); } 100% { opacity: 0; transform: translateX(-50%) scale(0.95); } }
        @keyframes revealRays { 0% { opacity: 0; transform: scale(0.5) rotate(0deg); } 20% { opacity: 0.6; } 100% { opacity: 0; transform: scale(2.2) rotate(30deg); } }
        @keyframes revealParticle { 0% { opacity: 0; transform: scale(0) translateY(0); } 15% { opacity: 1; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.4) translateY(-50px); } }
        @keyframes revealScreenEdge { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes mythicPulse { 0%,100% { opacity: 0; } 15% { opacity: 0.55; } 45% { opacity: 0.3; } 75% { opacity: 0.45; } }
        @keyframes packPop { 0% { transform: scale(0.93) translateY(6px); } 65% { transform: scale(1.07) translateY(-10px); } 100% { transform: scale(1.05) translateY(-8px); } }
        @keyframes packPulse { 0%,100% { transform: scale(1) translateY(0); filter: brightness(1); } 50% { transform: scale(1.06) translateY(-8px); filter: brightness(1.12); } }
        @keyframes packLoadingDots { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes packPanelIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes packModalIn { from { opacity: 0; transform: scale(0.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes cardRevealEnter { from { transform: translateX(55px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .card-reveal-enter { animation: cardRevealEnter 0.35s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
        @keyframes teaseCardIn { from { transform: translateY(52px) scale(0.88); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes teaseLogoIn { 0% { transform: scale(0); opacity: 0; } 55% { transform: scale(1.14); opacity: 1; } 78% { transform: scale(0.96); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes teaseSlideDown { from { transform: translateY(-18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes teaseSlideUp { from { transform: translateY(18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes teaseRingPulse { 0%,100% { transform: scale(1); opacity: 0.45; } 50% { transform: scale(1.13); opacity: 0.9; } }
        @keyframes teaseLogoGlow { 0%,100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.07); filter: brightness(1.22); } }
        @keyframes teaseShimmer { 0% { transform: translateX(-120%); opacity: 0; } 15% { opacity: 1; } 55% { opacity: 0.6; } 70% { transform: translateX(120%); opacity: 0; } 100% { transform: translateX(120%); opacity: 0; } }
        @keyframes teaseParticle { 0% { transform: translateY(0) scale(0); opacity: 0; } 18% { transform: translateY(-8px) scale(1); opacity: 1; } 100% { transform: translateY(-75px) scale(0.2); opacity: 0; } }
        @keyframes teaseTapHint { 0%,100% { opacity: 0.35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
        @keyframes teaseBtnShimmer { 0% { transform: translateX(-180%); } 100% { transform: translateX(180%); } }
        .cards-grid { animation: fadeIn 0.22s ease; }
        .card-item { transition: transform 0.12s ease; cursor: pointer; }
        .card-item:active { transform: scale(0.95); }
        .pack-scroll { display: flex; overflow-x: auto; overflow-y: visible; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 8px 4px 20px; gap: 16px; align-items: flex-start; }
        .pack-scroll::-webkit-scrollbar { display: none; }
        .pack-item { scroll-snap-align: center; flex-shrink: 0; width: min(240px, 72vw); display: flex; flex-direction: column; position: relative; }
        .pack-img-wrap { border-radius: 18px; overflow: hidden; aspect-ratio: 3/4; cursor: pointer; transition: box-shadow 0.2s ease; flex-shrink: 0; position: relative; }
        .pack-img-wrap img { width: 100%; height: 100%; object-fit: cover; border-radius: 18px; display: block; }
        .pack-img-wrap:active { transform: scale(0.97); }
        .pack-float { animation: packPop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards; }
.pack-open-btn { width: 100%; border: none; border-radius: 11px; padding: 11px 0; font-weight: 900; font-size: 14px; cursor: pointer; transition: opacity 0.15s ease; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .pack-open-btn:active:not(:disabled) { transform: scale(0.97); opacity: 0.85; }
        .pack-open-btn:disabled { cursor: not-allowed; }
        .pack-tap-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.65); backdrop-filter: blur(8px); border-radius: 99px; padding: 4px 12px; font-size: 10px; font-weight: 700; color: rgba(255,255,255,.85); white-space: nowrap; pointer-events: none; }
        .open-btn:active:not(:disabled) { opacity: 0.8 !important; transform: scale(0.97); }
        .pill-scroll { scrollbar-width: none; }
        .pill-scroll::-webkit-scrollbar { display: none; }
        .cards-action-btn:active { opacity: 0.78; transform: scale(0.98); }
        @media (min-width: 720px) {
          .team-filter-button {
            height: 34px;
            min-width: 190px;
            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          }
          .team-filter-button:hover {
            background-color: rgba(255,255,255,.11) !important;
            border-color: rgba(255,255,255,.22) !important;
          }
          .team-filter-button:focus-visible {
            border-color: rgba(96,165,250,.7) !important;
            box-shadow: 0 0 0 3px rgba(96,165,250,.16);
          }
        }
      `}</style>

      <PageHeader
        title="Cards"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user && (
            <>
              <button
                onClick={() => setShowTradesInbox(true)}
                style={{ appearance: "none", border: "none", background: "var(--surface-3)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-1)", flexShrink: 0, position: "relative" }}
                title="Trades"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
                {(() => {
                  const count = (prefetchedTrades ?? []).filter(
                    (t: any) => t.receiver_id === user.id && t.status === "pending"
                  ).length;
                  return count > 0 ? (
                    <span style={{
                      position: "absolute", top: -3, right: -3,
                      minWidth: 16, height: 16, borderRadius: 99,
                      background: "#ef4444", color: "#fff",
                      fontSize: 10, fontWeight: 900, lineHeight: "16px",
                      textAlign: "center", padding: "0 4px",
                      border: "1.5px solid var(--bg)",
                      pointerEvents: "none",
                    }}>{count}</span>
                  ) : null;
                })()}
              </button>
              <div style={coinBadgeStyle}>
                <CoinIcon />
                <span style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>{formatCoins(coins)}</span>
              </div>
            </>
          )}
          </div>
        }
      />

      {showTradesInbox && user && accessToken && (
        <TradesInboxModal
          myUserId={user.id}
          accessToken={accessToken}
          initialTrades={prefetchedTrades}
          onClose={() => { setShowTradesInbox(false); setPrefetchedTrades(undefined); }}
        />
      )}

      <div style={contentStyle}>
        {/* ── Cards actions ── */}
        <div style={cardsActionsStyle}>
          <Link href="/passes" style={cardsActionButtonStyle} className="cards-action-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
              <line x1="15" y1="5" x2="15" y2="19" strokeDasharray="2.5 2" strokeOpacity="0.6" />
            </svg>
            Passes
          </Link>
          <Link href="/album" style={cardsActionButtonStyle} className="cards-action-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Album
          </Link>
        </div>

        {/* ── NOT LOGGED IN ── */}
        {!user && (
          <>
            <div style={guestBannerStyle}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6, color: "var(--text-1)" }}>Sign in to open packs</div>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 18 }}>Collect players, build your squad, and open packs with Coins.</div>
              <Link href="/login" style={loginBtnStyle}>Log In</Link>
            </div>
            <PackShopPreview />
          </>
        )}

        {/* ── LOGGED IN ── */}
        {user && (
          <>
            <PackShop
              coins={coins}
              opening={opening}
              lastDailyPackAt={lastDailyPackAt}
              onSelectPack={setShopPack}
            />

            <div style={collectionHeaderStyle}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>My Collection</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-4)" }}>
                  {totalCardCount} card{totalCardCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Filters */}
            <div style={filtersWrapStyle}>
              {/* Rarity filter */}
              <div style={filterRowStyle}>
                <span style={filterLabelStyle}>Rarity</span>
                <div className="pill-scroll" style={pillRowStyle}>
                  <FilterPill active={rarityFilter === "all"} onClick={() => setRarityFilter("all")}>All</FilterPill>
                  {(["bronze", "silver", "gold", "emerald", "sapphire", "ruby", "amethyst", "diamond", "pinkdiamond", "mythic"] as Rarity[]).map((r) => (
                    <FilterPill key={r} active={rarityFilter === r} color={RARITY_META[r].color} onClick={() => setRarityFilter(r)}>
                      {RARITY_META[r].label}
                    </FilterPill>
                  ))}
                </div>
              </div>

              {/* Team filter */}
              <div style={filterRowStyle}>
                <span style={filterLabelStyle}>Team</span>
                <div ref={teamMenuRef} style={teamFilterWrapStyle}>
                  <button
                    type="button"
                    className="team-filter-button"
                    onClick={() => setTeamMenuOpen((open) => !open)}
                    style={teamFilterButtonStyle}
                    aria-haspopup="listbox"
                    aria-expanded={teamMenuOpen}
                    aria-label="Filter cards by team"
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {teamFilter === "all" ? "All teams" : teamFilter}
                    </span>
                    <span aria-hidden="true" style={{ marginLeft: "auto", color: "rgba(255,255,255,.72)", fontSize: 10 }}>
                      ▾
                    </span>
                  </button>

                  {teamMenuOpen && (
                    <div role="listbox" aria-label="Team options" style={teamFilterMenuStyle}>
                      {["all", ...ALL_TEAMS].map((team) => {
                        const label = team === "all" ? "All teams" : team;
                        const active = teamFilter === team;
                        return (
                          <button
                            key={team}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setTeamFilter(team);
                              setTeamMenuOpen(false);
                            }}
                            style={{
                              ...teamFilterOptionStyle,
                              background: active ? "rgba(96,165,250,.18)" : "transparent",
                              color: active ? "#fff" : "rgba(255,255,255,.72)",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Sort */}
              <div style={filterRowStyle}>
                <span style={filterLabelStyle}>Sort</span>
                <div style={pillRowStyle}>
                  {([
                    { key: "newest", label: "Newest" },
                    { key: "rating_desc", label: "Rating ↓" },
                    { key: "rating_asc", label: "Rating ↑" },
                    { key: "rarity", label: "Rarity" },
                  ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                    <FilterPill key={key} active={sortBy === key} onClick={() => setSortBy(key)}>{label}</FilterPill>
                  ))}
                </div>
              </div>
            </div>

            {/* Card grid */}
            {cardsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 14 }}>
                <Spinner />
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Loading collection…</div>
              </div>
            ) : displayCards.length === 0 ? (
              <div style={emptyCollectionStyle}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>🃏</div>
                <div style={{ fontWeight: 900, fontSize: 15, color: "var(--text-1)", marginBottom: 6 }}>
                  {cards.length === 0 ? "No cards yet" : "No matches"}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600 }}>
                  {cards.length === 0 ? "Open a pack to start your collection" : "Try adjusting your filters"}
                </div>
              </div>
            ) : (
              <div className="cards-grid" style={cardGridStyle}>
                {displayCards.slice(0, visibleCount).map(({ key, card }) => (
                  <div key={key} className="card-item" style={{ cursor: "pointer" }} onClick={() => setSellCard(card)}>
                    <SharedPlayerCard card={{
                      playerId: card.player_id,
                      playerName: card.player_name,
                      playerFolder: TEAM_PLAYER_FOLDER[card.team] ?? card.team.toLowerCase().replace(/[^a-z]/g, ""),
                      playerTeam: card.team,
                      playerTeamLogo: card.team_logo,
                      rarity: card.rarity,
                      rating: card.rating,
                    }} />
                  </div>
                ))}
                {visibleCount < displayCards.length && (
                  <div ref={gridSentinelRef} style={{ gridColumn: "1 / -1", height: 1 }} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Pack detail modal */}
      {shopPack && (() => { const p = [...PACKS, ...TEAM_PACKS].find(pk => pk.type === shopPack)!; return (
        <PackDetailModal
          pack={p}
          coins={coins}
          opening={opening}
          onOpenPack={handleOpenPack}
          onClose={() => setShopPack(null)}
          onClaimDaily={handleClaimDailyPack}
          dailyAvailable={isDailyAvailable(lastDailyPackAt)}
        />
      ); })()}

      {/* Instant loading overlay — shown the moment user taps "Open Pack" */}
      {pendingPackType && !openedCards && (
        <PackOpenLoadingOverlay packType={pendingPackType} />
      )}

      {/* Pack opening result modal */}
      {openedCards && (
        <PackOpenModal
          cards={openedCards}
          onClose={() => {
            setOpenedCards(null);
            // Coins are already correct (set from API response / optimistic update).
            // Only refetch the card collection so the grid stays up-to-date.
            if (user) {
              fetchAllUserCards(user.id)
                .then((data) => setCards(data))
                .catch((err) => console.error("[cards refresh]", err));
            }
          }}
        />
      )}

      {/* Card options modal */}
      {sellCard && (
        <CardOptionsModal
          card={sellCard}
          isFeatured={featuredCards.some(f => f.player_id === sellCard.player_id)}
          featuredCount={featuredCards.length}
          onToggleFeatured={() => toggleFeaturedCard(sellCard.player_id, sellCard.rarity)}
          onCancel={() => setSellCard(null)}
        />
      )}
    </main>
  );
}

// ── Daily pack helpers ────────────────────────────────────────────────────────

/** Returns true if the user has not yet claimed their daily pack today (UTC). */
function isDailyAvailable(lastDailyPackAt: string | null): boolean {
  if (!lastDailyPackAt) return true;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  return new Date(lastDailyPackAt) < todayStart;
}

/** Returns a human-readable "Xh Ym" string until the next UTC midnight reset. */
function getTimeUntilReset(): string {
  const now = new Date();
  const midnight = new Date();
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ── Pack Shop ─────────────────────────────────────────────────────────────────

function PackDetailModal({ pack, coins, opening, onOpenPack, onClose, onClaimDaily, dailyAvailable = true }: {
  pack: typeof PACKS[number];
  coins: number;
  opening: PackType | null;
  onOpenPack: (p: PackType) => void;
  onClose: () => void;
  onClaimDaily?: () => void;
  dailyAvailable?: boolean;
}) {
  const isDaily = pack.type === "daily";
  const canAfford = isDaily ? dailyAvailable : coins >= pack.cost;
  const isOpening = opening === pack.type;
  const [oddsOpen, setOddsOpen] = useState(false);

  // Close on backdrop click
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 360,
          background: "var(--bg)",
          border: `1px solid ${pack.accent}33`,
          borderRadius: 24,
          overflowY: "auto",
          maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)",
          animation: "packModalIn 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0" }}>
          <span style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)" }}>{pack.label}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 8px" }}>
            Cancel
          </button>
        </div>

        {/* Pack image */}
        <div style={{ padding: "16px 40px 8px", display: "flex", justifyContent: "center" }}>
          <Image
            src={pack.image}
            alt={pack.label}
            width={200}
            height={267}
            style={{
              width: "100%", maxWidth: 200,
              aspectRatio: "3/4", objectFit: "cover", borderRadius: 14,
              boxShadow: `0 16px 48px rgba(0,0,0,.6), 0 0 40px ${pack.accent}33`,
            }}
            priority
          />
        </div>

        {/* Description */}
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginBottom: 16 }}>
          {pack.description} · {pack.cards}
        </div>

        {/* Price + odds + button */}
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Price */}
          {isDaily ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <span style={{ fontWeight: 900, fontSize: 28, color: "#22c55e", letterSpacing: "-0.02em" }}>FREE</span>
              {!dailyAvailable && <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 700 }}>· Already claimed</span>}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <CoinIcon size={20} />
              <span style={{ fontWeight: 900, fontSize: 28, color: canAfford ? "#fbbf24" : "#475569", letterSpacing: "-0.02em" }}>
                {pack.cost.toLocaleString()}
              </span>
              {!canAfford && <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Not enough</span>}
            </div>
          )}

          {/* Odds */}
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,.07)" }}>
            {/* Header — clickable toggle */}
            <button
              onClick={() => setOddsOpen(o => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,.05)", padding: "9px 14px", border: "none", cursor: "pointer", borderBottom: oddsOpen ? "1px solid rgba(255,255,255,.06)" : "none" }}
            >
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".18em", color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>Odds</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: "transform 0.2s", transform: oddsOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                <path d="M2 4l4 4 4-4" stroke="rgba(255,255,255,.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Rows */}
            {oddsOpen && RARITY_ODDS[pack.type].map(({ rarity, pct }, idx, arr) => {
              const meta = RARITY_META[rarity];
              const isLast = idx === arr.length - 1;
              return (
                <div
                  key={rarity}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 14px",
                    borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,.04)",
                    background: idx % 2 === 0 ? "rgba(255,255,255,.02)" : "transparent",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 900, color: meta.color, letterSpacing: "0.01em" }}>{meta.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,.75)", fontVariantNumeric: "tabular-nums" }}>{pct}</span>
                </div>
              );
            })}
          </div>

          {/* Open button */}
          {isDaily ? (
            <button
              className="pack-open-btn"
              onClick={() => { if (dailyAvailable) onClaimDaily?.(); }}
              disabled={!dailyAvailable || !!opening}
              style={{
                background: dailyAvailable ? "#22c55e" : "var(--border-1)",
                color: dailyAvailable ? "#14141e" : "var(--text-4)",
                opacity: dailyAvailable && !opening ? 1 : 0.45,
                boxShadow: dailyAvailable ? "0 4px 20px rgba(34,197,94,0.55)" : "none",
                fontSize: 15, padding: "14px 0", borderRadius: 13,
              }}
            >
              {isOpening ? <Spinner /> : dailyAvailable ? "Claim Daily Pack" : `Come back in ${getTimeUntilReset()}`}
            </button>
          ) : (
            <button
              className="pack-open-btn"
              onClick={() => onOpenPack(pack.type)}
              disabled={!canAfford || !!opening}
              style={{
                background: canAfford ? pack.accent : "var(--border-1)",
                color: canAfford ? "#14141e" : "var(--text-4)",
                opacity: canAfford && !opening ? 1 : 0.45,
                boxShadow: canAfford ? `0 4px 20px ${pack.accent}55` : "none",
                fontSize: 15, padding: "14px 0", borderRadius: 13,
              }}
            >
              {isOpening ? <Spinner /> : "Open Pack"}
            </button>
          )}

          {!isDaily && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textAlign: "center", marginTop: 10 }}>
              All purchases are non-refundable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PackScrollRow({
  packs,
  dailyAvailable,
  onSelectPack,
  highlightType,
}: {
  packs: typeof PACKS;
  dailyAvailable: boolean;
  onSelectPack: (p: PackType) => void;
  highlightType?: PackType;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 1.2;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={scrollRef} className="pack-scroll">
      {packs.map((pack) => {
        const isHighlighted = pack.type === highlightType;
        const isDaily = pack.type === "daily";
        const dailyClaimed = isDaily && !dailyAvailable;

        return (
          <div key={pack.type} className="pack-item">
            {isHighlighted && (
              <div style={{
                position: "absolute", bottom: -6, left: "8%", width: "84%", height: 24,
                borderRadius: "50%", background: `radial-gradient(ellipse, ${pack.accent}50 0%, transparent 70%)`,
                filter: "blur(8px)", pointerEvents: "none",
              }} />
            )}
            <div
              className="pack-img-wrap pack-float"
              suppressHydrationWarning
              style={{ position: "relative", boxShadow: "0 16px 48px rgba(0,0,0,.45)", cursor: "pointer" }}
              onClick={() => onSelectPack(pack.type)}
            >
              <Image
                src={pack.image}
                alt={pack.label}
                fill
                sizes="(max-width: 600px) 72vw, 240px"
                style={{ objectFit: "cover", filter: dailyClaimed ? "grayscale(1) brightness(0.38)" : "none", transition: "filter 0.3s ease" }}
                priority
              />
              {dailyClaimed && (
                <div style={{ position: "absolute", inset: 0, borderRadius: 18, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12, pointerEvents: "none" }}>
                  <div className="pack-tap-hint" style={{ position: "static", transform: "none" }}>✓ Come back tomorrow</div>
                </div>
              )}
            </div>
            {/* Team pack label under the image */}
            {pack.type.startsWith("team_") && (
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.55)", lineHeight: 1.2 }}>
                {pack.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PackShop({
  coins, opening, lastDailyPackAt, onSelectPack,
}: {
  coins: number;
  opening: PackType | null;
  lastDailyPackAt: string | null;
  onSelectPack: (p: PackType) => void;
}) {
  const dailyAvailable = isDailyAvailable(lastDailyPackAt);

  return (
    <>
      <section style={{ marginBottom: 8 }}>
        <div style={shopHeaderStyle}>
          <span style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>Pack Shop</span>
        </div>
        <PackScrollRow packs={PACKS} dailyAvailable={dailyAvailable} onSelectPack={onSelectPack} highlightType="general" />
      </section>

      <section style={{ marginBottom: 8 }}>
        <div style={shopHeaderStyle}>
          <span style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>Team Packs</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", marginLeft: 8 }}>500 coins · 7 cards</span>
        </div>
        <PackScrollRow packs={TEAM_PACKS} dailyAvailable={dailyAvailable} onSelectPack={onSelectPack} />
      </section>
    </>
  );
}

// ── Pack Shop Preview (not logged in) ────────────────────────────────────────

function PackShopPreview() {
  return (
    <>
      <section style={{ marginBottom: 8, opacity: 0.45, pointerEvents: "none" }}>
        <div style={shopHeaderStyle}>
          <span style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>Pack Shop</span>
        </div>
        <div className="pack-scroll">
          {PACKS.map((pack) => (
            <div key={pack.type} className="pack-item">
              <div className="pack-img-wrap pack-float" style={{ boxShadow: "0 16px 48px rgba(0,0,0,.45)" }}>
                <Image src={pack.image} alt={pack.label} fill sizes="(max-width: 600px) 72vw, 240px" style={{ objectFit: "cover" }} priority />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginBottom: 8, opacity: 0.45, pointerEvents: "none" }}>
        <div style={shopHeaderStyle}>
          <span style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>Team Packs</span>
        </div>
        <div className="pack-scroll">
          {TEAM_PACKS.map((pack) => (
            <div key={pack.type} className="pack-item">
              <div className="pack-img-wrap pack-float" style={{ boxShadow: "0 16px 48px rgba(0,0,0,.45)" }}>
                <Image src={pack.image} alt={pack.label} fill sizes="(max-width: 600px) 72vw, 240px" style={{ objectFit: "cover" }} priority />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Rarity Reveal Overlay ─────────────────────────────────────────────────────

function RarityRevealOverlay({ rarity, meta, duration }: { rarity: Rarity; meta: { color: string; glow: string }; duration: number }) {
  const order = RARITY_ORDER[rarity];
  const label = `✦ ${RARITY_META[rarity].label.toUpperCase()} ✦`;

  // Sapphire — elegant glow, 2 rings, soft label
  if (order === 4) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}25 0%, transparent 60%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${duration * 0.82}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}66`, animation: `revealRing ${duration}ms 110ms ease-out forwards` }} />
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".24em", color: meta.color, textShadow: `0 0 14px ${meta.color}` }}>{label}</div>
        </div>
      </div>
    );
  }

  // Ruby — warm burst, 3 rings, brighter flash, label
  if (order === 5) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}38 0%, transparent 65%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${duration * 0.65}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}88`, animation: `revealRing ${duration * 0.85}ms 70ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${duration}ms 140ms ease-out forwards` }} />
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".26em", color: meta.color, textShadow: `0 0 18px ${meta.color}, 0 0 36px ${meta.color}66` }}>{label}</div>
        </div>
      </div>
    );
  }

  // Amethyst — rays + 3 rings + label
  if (order === 6) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}30 0%, transparent 65%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${meta.color}18 20deg, transparent 40deg, transparent 60deg, ${meta.color}12 80deg, transparent 100deg, transparent 120deg, ${meta.color}18 140deg, transparent 160deg, transparent 180deg, ${meta.color}14 200deg, transparent 220deg, transparent 240deg, ${meta.color}18 260deg, transparent 280deg, transparent 300deg, ${meta.color}12 320deg, transparent 340deg, transparent 360deg)`, animation: `revealRays ${duration}ms ease-out forwards`, borderRadius: "50%" }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${duration * 0.65}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}88`, animation: `revealRing ${duration * 0.82}ms 80ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${duration}ms 160ms ease-out forwards` }} />
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".28em", color: meta.color, textShadow: `0 0 20px ${meta.color}, 0 0 40px ${meta.color}88` }}>{label}</div>
        </div>
      </div>
    );
  }

  // Diamond — stronger rays, 4 rings, sparkle particles, bigger label
  if (order === 7) {
    const particles = Array.from({ length: 5 }, (_, i) => ({
      x: 50 + Math.sin((i / 5) * Math.PI * 2) * 28,
      y: 50 + Math.cos((i / 5) * Math.PI * 2) * 28,
      delay: i * 80,
    }));
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}40 0%, transparent 70%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${meta.color}22 15deg, transparent 30deg, transparent 50deg, ${meta.color}18 65deg, transparent 80deg, transparent 100deg, ${meta.color}22 115deg, transparent 130deg, transparent 150deg, ${meta.color}18 165deg, transparent 180deg, transparent 200deg, ${meta.color}22 215deg, transparent 230deg, transparent 250deg, ${meta.color}18 265deg, transparent 280deg, transparent 300deg, ${meta.color}22 315deg, transparent 330deg, transparent 350deg, ${meta.color}16 360deg)`, animation: `revealRays ${duration}ms ease-out forwards`, borderRadius: "50%" }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2.5px solid ${meta.color}`, animation: `revealRing ${duration * 0.58}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}88`, animation: `revealRing ${duration * 0.72}ms 65ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}66`, animation: `revealRing ${duration * 0.87}ms 130ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}44`, animation: `revealRing ${duration}ms 195ms ease-out forwards` }} />
        {particles.map((p, i) => (
          <div key={i} style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: meta.color, boxShadow: `0 0 7px ${meta.color}`, left: `${p.x}%`, top: `${p.y}%`, animation: `revealParticle ${duration * 0.78}ms ${p.delay}ms ease-out forwards` }} />
        ))}
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: ".30em", color: meta.color, textShadow: `0 0 24px ${meta.color}, 0 0 50px ${meta.color}88, 0 0 80px ${meta.color}44` }}>{label}</div>
        </div>
      </div>
    );
  }

  // Pink Diamond — edge vignette, strong rays, 4 rings, more particles, grand label
  if (order === 8) {
    const particles = Array.from({ length: 8 }, (_, i) => ({
      x: 50 + Math.sin((i / 8) * Math.PI * 2) * 30,
      y: 50 + Math.cos((i / 8) * Math.PI * 2) * 30,
      size: i % 2 === 0 ? 5 : 3,
      delay: i * 60,
    }));
    return (
      <div style={{ position: "absolute", inset: -80, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}48 0%, transparent 75%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${meta.color}20 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, ${meta.color}20 0%, transparent 55%)`, animation: `revealScreenEdge ${duration * 0.75}ms 100ms ease-out forwards` }} />
        <div style={{ position: "absolute", inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${meta.color}26 12deg, transparent 24deg, transparent 42deg, ${meta.color}20 54deg, transparent 66deg, transparent 84deg, ${meta.color}26 96deg, transparent 108deg, transparent 126deg, ${meta.color}20 138deg, transparent 150deg, transparent 168deg, ${meta.color}26 180deg, transparent 192deg, transparent 210deg, ${meta.color}20 222deg, transparent 234deg, transparent 252deg, ${meta.color}26 264deg, transparent 276deg, transparent 294deg, ${meta.color}20 306deg, transparent 318deg, transparent 336deg, ${meta.color}22 348deg, transparent 360deg)`, animation: `revealRays ${duration}ms ease-out forwards`, borderRadius: "50%" }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `3px solid ${meta.color}`, animation: `revealRing ${duration * 0.52}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2.5px solid ${meta.color}99`, animation: `revealRing ${duration * 0.67}ms 60ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}77`, animation: `revealRing ${duration * 0.82}ms 120ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${duration}ms 180ms ease-out forwards` }} />
        {particles.map((p, i) => (
          <div key={i} style={{ position: "absolute", width: p.size, height: p.size, borderRadius: "50%", background: meta.color, boxShadow: `0 0 9px ${meta.color}, 0 0 18px ${meta.color}88`, left: `${p.x}%`, top: `${p.y}%`, animation: `revealParticle ${duration * 0.73}ms ${p.delay}ms ease-out forwards` }} />
        ))}
        <div style={{ position: "absolute", bottom: "10%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: ".32em", color: meta.color, textShadow: `0 0 28px ${meta.color}, 0 0 56px ${meta.color}88, 0 0 100px ${meta.color}55` }}>{label}</div>
        </div>
      </div>
    );
  }

  // Mythic — full spectacle: double flash, dual-color rays, 5 rings, 12 particles, gold label
  const mythicParticles = Array.from({ length: 12 }, (_, i) => ({
    x: 50 + Math.sin((i / 12) * Math.PI * 2) * 32,
    y: 50 + Math.cos((i / 12) * Math.PI * 2) * 32,
    size: i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 3,
    isGold: i % 2 === 0,
    delay: i * 50,
  }));
  return (
    <div style={{ position: "absolute", inset: -100, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}55 0%, transparent 80%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(255,215,0,0.28) 0%, transparent 60%)`, animation: `revealFlash ${duration * 0.5}ms 220ms ease-out forwards` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 0% 50%, ${meta.color}20 0%, transparent 50%), radial-gradient(ellipse at 100% 50%, rgba(255,215,0,0.15) 0%, transparent 50%)`, animation: `mythicPulse ${duration}ms ease-out forwards` }} />
      <div style={{ position: "absolute", inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${meta.color}28 10deg, transparent 20deg, transparent 34deg, rgba(255,215,0,0.22) 44deg, transparent 54deg, transparent 70deg, ${meta.color}28 80deg, transparent 90deg, transparent 104deg, rgba(255,215,0,0.18) 114deg, transparent 124deg, transparent 140deg, ${meta.color}28 150deg, transparent 160deg, transparent 174deg, rgba(255,215,0,0.22) 184deg, transparent 194deg, transparent 210deg, ${meta.color}28 220deg, transparent 230deg, transparent 244deg, rgba(255,215,0,0.18) 254deg, transparent 264deg, transparent 280deg, ${meta.color}28 290deg, transparent 300deg, transparent 314deg, rgba(255,215,0,0.22) 324deg, transparent 334deg, transparent 350deg, ${meta.color}24 360deg)`, animation: `revealRays ${duration}ms ease-out forwards`, borderRadius: "50%" }} />
      <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `3.5px solid ${meta.color}`, animation: `revealRing ${duration * 0.42}ms ease-out forwards` }} />
      <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `3px solid rgba(255,215,0,0.9)`, animation: `revealRing ${duration * 0.54}ms 50ms ease-out forwards` }} />
      <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}99`, animation: `revealRing ${duration * 0.67}ms 100ms ease-out forwards` }} />
      <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid rgba(255,215,0,0.6)`, animation: `revealRing ${duration * 0.82}ms 150ms ease-out forwards` }} />
      <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${duration}ms 200ms ease-out forwards` }} />
      {mythicParticles.map((p, i) => (
        <div key={i} style={{ position: "absolute", width: p.size, height: p.size, borderRadius: "50%", background: p.isGold ? "rgba(255,215,0,0.95)" : meta.color, boxShadow: `0 0 10px ${p.isGold ? "rgba(255,215,0,0.9)" : meta.color}, 0 0 22px ${meta.color}88`, left: `${p.x}%`, top: `${p.y}%`, animation: `revealParticle ${duration * 0.68}ms ${p.delay}ms ease-out forwards` }} />
      ))}
      <div style={{ position: "absolute", bottom: "8%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: ".36em", color: "#ffd700", textShadow: `0 0 32px ${meta.color}, 0 0 64px ${meta.color}88, 0 0 120px ${meta.color}44, 0 0 22px rgba(255,215,0,0.9)` }}>{label}</div>
      </div>
    </div>
  );
}

// ── Pack Open Loading Overlay ─────────────────────────────────────────────────
// Shown instantly when the user taps "Open Pack" — before the API responds.
// Removes all perceived delay by giving immediate visual feedback.

function PackOpenLoadingOverlay({ packType }: { packType: PackType }) {
  const pack = [...PACKS, ...TEAM_PACKS].find(p => p.type === packType)!;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 32,
      animation: "packModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      {/* Glowing pack image, pulsing to show activity */}
      <div style={{ position: "relative", width: 170, aspectRatio: "3/4" }}>
        <img
          src={pack.image}
          alt={pack.label}
          style={{
            position: "relative", width: "100%", height: "100%", objectFit: "cover",
            borderRadius: 18,
            boxShadow: "0 20px 60px rgba(0,0,0,.7)",
            animation: "packPulse 1.4s ease-in-out infinite",
          }}
        />
      </div>

      {/* Animated dots */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: pack.accent,
            opacity: 0.2,
            animation: `packLoadingDots 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Tease Card ────────────────────────────────────────────────────────────────
// Shown BEFORE the actual card — reveals rarity + team but hides the player.

function TeaseCard({ card, meta, onClick, hiding = false }: {
  card: OpenedCard;
  meta: { color: string; glow: string; bg: string };
  onClick: () => void;
  hiding?: boolean;
}) {
  const order = RARITY_ORDER[card.rarity];
  // Floating particles — more for rarer cards
  const particles = order >= 4 ? Array.from({ length: Math.min(2 + (order - 4) * 2, 10) }, (_, i) => ({
    left: 12 + (i * 17 + 5) % 76,
    bottom: 14 + (i * 11) % 42,
    delay: i * 260 + 500,
    duration: 1900 + (i * 430) % 1100,
    size: i % 3 === 0 ? 4 : 2,
  })) : [];

  return (
    <div
      onClick={onClick}
      style={{
        width: "100%", aspectRatio: "3/4.2", borderRadius: 18, overflow: "hidden",
        position: "relative", cursor: "pointer",
        boxShadow: `0 0 0 2px ${meta.color}88, 0 20px 60px ${meta.glow}, 0 0 80px ${meta.glow}44`,
        animation: "teaseCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        opacity: hiding ? 0 : 1,
        transition: hiding ? "opacity 0.18s ease" : undefined,
        pointerEvents: hiding ? "none" : "auto",
      }}
    >
      {/* Rarity card background */}
      <img src={`/cards/${card.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />

      {/* Dark overlay — hides card details but keeps bg visible */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.42) 0%, rgba(0,0,0,.06) 28%, rgba(0,0,0,.06) 58%, rgba(0,0,0,.92) 100%)" }} />

      {/* Team logo circle — bounces in at center (where player image lives) */}
      <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1" }}>
        <div style={{
          width: "100%", height: "100%", borderRadius: "50%", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(circle at 50% 45%, ${meta.color}2a 0%, ${meta.color}08 65%, transparent 100%)`,
          border: `1.5px solid ${meta.color}55`,
          boxShadow: `inset 0 0 30px ${meta.color}14, 0 0 40px ${meta.glow}88`,
          animation: "teaseLogoIn 0.58s 0.1s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          {/* Pulsing outer ring */}
          <div style={{ position: "absolute", inset: -5, borderRadius: "50%", border: `1.5px solid ${meta.color}50`, animation: "teaseRingPulse 2.4s ease-in-out infinite", pointerEvents: "none" }} />
          {/* Pulsing far ring */}
          <div style={{ position: "absolute", inset: -13, borderRadius: "50%", border: `1px solid ${meta.color}2a`, animation: "teaseRingPulse 2.4s 0.7s ease-in-out infinite", pointerEvents: "none" }} />

          {/* Team logo — circular clip */}
          <div style={{
            width: "62%", height: "62%", borderRadius: "50%", overflow: "hidden",
            flexShrink: 0, background: "rgba(0,0,0,.28)",
            animation: "teaseLogoGlow 2.2s ease-in-out infinite",
            filter: `drop-shadow(0 0 22px ${meta.color}ee) drop-shadow(0 0 10px ${meta.color}88)`,
          }}>
            <img
              src={card.team_logo} alt={card.team}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        </div>
      </div>

      {/* Team name — slides up where player name usually sits */}
      <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 8px" }}>
        <div style={{ animation: "teaseSlideUp 0.4s 0.44s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <div style={{
            fontWeight: 900, color: "var(--text-1)",
            fontSize: "clamp(9px, 4.2vw, 15px)",
            textShadow: `0 0 16px ${meta.glow}`,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{card.team}</div>
        </div>
      </div>

      {/* Mystery rating */}
      <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: `${meta.color}55`, border: `1px solid ${meta.color}2a` }}>?</div>
      <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.4)", letterSpacing: ".05em" }}>2025</div>

      {/* Shimmer sweep */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 18, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(105deg, transparent 25%, ${meta.color}1a 44%, rgba(255,255,255,0.08) 50%, ${meta.color}1a 56%, transparent 75%)`,
          animation: "teaseShimmer 3.2s 1s ease-in-out infinite",
        }} />
      </div>

      {/* Floating particles (sapphire+) */}
      {particles.map((p, i) => (
        <div key={i} style={{
          position: "absolute", bottom: `${p.bottom}%`, left: `${p.left}%`,
          width: p.size, height: p.size, borderRadius: "50%",
          background: meta.color, boxShadow: `0 0 ${p.size * 2}px ${meta.color}`,
          animation: `teaseParticle ${p.duration}ms ${p.delay}ms ease-in-out infinite`,
          opacity: 0, pointerEvents: "none",
        }} />
      ))}

      {/* "TAP TO REVEAL" hint */}
      <div style={{ position: "absolute", bottom: "5.5%", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, animation: "teaseTapHint 2s 1s ease-in-out infinite", opacity: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".22em", color: `${meta.color}cc` }}>TAP TO REVEAL</span>
        </div>
      </div>
    </div>
  );
}

// ── Pack Open Modal ───────────────────────────────────────────────────────────

function PackOpenModal({ cards: rawCards, onClose }: { cards: OpenedCard[]; onClose: () => void }) {
  const cards = useMemo(
    () => [...rawCards].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]),
    [rawCards],
  );
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [revealingRarity, setRevealingRarity] = useState(false);
  const [phase, setPhase] = useState<"tease" | "card">("tease");
  const [flipActive, setFlipActive] = useState(false);

  // Preload all images on mount so they're ready when cards appear
  useEffect(() => {
    rawCards.forEach(card => {
      new window.Image().src = `/cards/${card.rarity}.png`;
      if (card.player_image) new window.Image().src = card.player_image;
      const folder = TEAM_PLAYER_FOLDER[card.team] ?? card.team.toLowerCase().replace(/[^a-z]/g, "");
      new window.Image().src = `${PLAYER_IMG_BASE}/${folder}/${card.player_id}.png`;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = cards[index];
  const meta = current ? RARITY_META[current.rarity] : null;
  const RARITY_REVEAL_DURATIONS: Partial<Record<Rarity, number>> = {
    sapphire: 800, ruby: 1050, amethyst: 1200, diamond: 1450, pinkdiamond: 1650, mythic: 1950,
  };
  const hasRevealAnim = current ? RARITY_ORDER[current.rarity] >= RARITY_ORDER["sapphire"] : false;
  const REVEAL_DURATION = (current && RARITY_REVEAL_DURATIONS[current.rarity]) ?? 0;

  // Fire rarity overlay when the card is revealed (phase → "card")
  useEffect(() => {
    if (phase !== "card" || !hasRevealAnim) return;
    const t = setTimeout(() => {
      setRevealingRarity(true);
      setTimeout(() => setRevealingRarity(false), REVEAL_DURATION);
    }, 320);
    return () => clearTimeout(t);
  }, [phase, index]); // eslint-disable-line react-hooks/exhaustive-deps

  function revealCard() {
    if (flipActive) return;
    setFlipActive(true);
    setTimeout(() => {
      setFlipActive(false);
      setAnimKey(k => k + 1);
      setPhase("card");
    }, 580);
  }

  function advance() {
    if (revealingRarity || flipActive) return;
    if (phase === "tease") { revealCard(); return; }
    if (index < cards.length - 1) {
      setIndex(i => i + 1);
      setPhase("tease");
    } else {
      setDone(true);
    }
  }

  // ── Done screen ──────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
        <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 24, padding: "20px 16px 16px", width: "100%", maxWidth: 480, animation: "slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)" }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.38)", marginBottom: 4 }}>PACK OPENED</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "var(--text-1)" }}>{cards.length} Card{cards.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`, gap: 6, marginBottom: 14 }}>
            {cards.map((card, i) => (
              <div key={i} style={{ position: "relative" }}>
                <SharedPlayerCard card={{ playerId: card.player_id, playerName: card.player_name, playerFolder: TEAM_PLAYER_FOLDER[card.team] ?? card.team.toLowerCase().replace(/[^a-z]/g, ""), playerTeam: card.team, playerTeamLogo: card.team_logo, rarity: card.rarity, rating: card.rating }} />
                {card.is_new && <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "2px 7px", fontSize: 7, fontWeight: 900, color: "#fff", letterSpacing: ".1em", boxShadow: "0 2px 8px rgba(34,197,94,.5)", whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none" }}>✦ NEW</div>}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ display: "block", width: "100%", padding: "13px", borderRadius: 14, border: "none", background: "var(--border-3)", color: "var(--text-1)", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
            Add to Collection
          </button>
        </div>
      </div>
    );
  }

  // ── Card reveal screen ───────────────────────────────────────────────────────

  return (
    <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 340, padding: "0 20px", userSelect: "none" }} onClick={e => e.stopPropagation()}>

        {/* Progress dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28 }}>
          {cards.map((_, i) => (
            <div key={i} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 99, background: i < index ? "rgba(255,255,255,.5)" : i === index ? "#fff" : "var(--border-3)", transition: "all 0.25s ease" }} />
          ))}
        </div>

        {/* Card / Tease */}
        <div style={{ position: "relative", width: "100%", maxWidth: 260, marginBottom: 28 }}>
          {phase === "tease" ? (
            // 3D flip container — front = tease, back = real card
            <div style={{ perspective: "1200px", width: "100%" }}>
              <div style={{
                position: "relative", width: "100%",
                transformStyle: "preserve-3d",
                transition: "transform 0.58s cubic-bezier(0.34, 1.0, 0.64, 1)",
                transform: flipActive ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                {/* Front face — tease card */}
                <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
                  {current && meta && <TeaseCard card={current} meta={meta} onClick={revealCard} hiding={flipActive} />}
                </div>
                {/* Back face — real card (pre-rendered, invisible until flip) */}
                <div style={{
                  position: "absolute", inset: 0,
                  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}>
                  {current && meta && (
                    <div style={{
                      width: "100%", aspectRatio: "3/4.2", borderRadius: 18, overflow: "hidden", position: "relative",
                      boxShadow: `0 0 0 2px ${meta.color}88, 0 16px 48px ${meta.glow}, 0 0 60px ${meta.glow}33`,
                    }}>
                      <img src={`/cards/${current.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />
                      <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>{current.rating}</div>
                      {current.is_new && (
                        <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: ".12em", boxShadow: "0 2px 12px rgba(34,197,94,.55)", whiteSpace: "nowrap", zIndex: 5 }}>✦ NEW</div>
                      )}
                      <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[current.team] ?? "#1e2438") + "33" }}>
                        <CardPlayerImage card={current} imageStyle={cardPlayerImageStyle} loading="eager" />
                      </div>
                      <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
                        <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 12px ${meta.glow}` }}>{current.player_name}</div>
                      </div>
                      <div style={{ position: "absolute", left: "clamp(4px,4.75%,7px)", bottom: "clamp(4px,4.75%,7px)", width: "clamp(16px,17.5%,26px)", height: "clamp(16px,17.5%,26px)", borderRadius: "50%", overflow: "hidden", zIndex: 4, background: "rgba(0,0,0,.55)", border: "1.5px solid var(--border-3)" }}>
                        <img src={current.team_logo} alt={current.team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>2025</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Card phase — flip complete, show card directly
            <>
              {revealingRarity && current && meta && (
                <RarityRevealOverlay rarity={current.rarity} meta={meta} duration={REVEAL_DURATION} />
              )}
              <div key={animKey}>
                {current && meta && (
                  <div style={{
                    width: "100%", aspectRatio: "3/4.2", borderRadius: 18, overflow: "hidden", position: "relative",
                    boxShadow: `0 0 0 2px ${meta.color}88, 0 16px 48px ${meta.glow}, 0 0 60px ${meta.glow}33`,
                  }}>
                    <img src={`/cards/${current.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />
                    <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>{current.rating}</div>
                    {current.is_new && (
                      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: ".12em", boxShadow: "0 2px 12px rgba(34,197,94,.55)", whiteSpace: "nowrap", zIndex: 5 }}>✦ NEW</div>
                    )}
                    <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[current.team] ?? "#1e2438") + "33" }}>
                      <CardPlayerImage card={current} imageStyle={cardPlayerImageStyle} loading="eager" />
                    </div>
                    <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
                      <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 12px ${meta.glow}` }}>{current.player_name}</div>
                    </div>
                    <div style={{ position: "absolute", left: "clamp(4px,4.75%,7px)", bottom: "clamp(4px,4.75%,7px)", width: "clamp(16px,17.5%,26px)", height: "clamp(16px,17.5%,26px)", borderRadius: "50%", overflow: "hidden", zIndex: 4, background: "rgba(0,0,0,.55)", border: "1.5px solid var(--border-3)" }}>
                      <img src={current.team_logo} alt={current.team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>2025</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Button */}
        <button
          onClick={advance}
          disabled={(phase === "card" && revealingRarity) || flipActive}
          style={{
            width: "100%", padding: "15px", borderRadius: 16, border: "none",
            background: meta ? meta.color : "var(--border-2)",
            color: "#14141e",
            fontWeight: 900, fontSize: 15,
            cursor: ((phase === "card" && revealingRarity) || flipActive) ? "default" : "pointer",
            marginBottom: 8,
            opacity: ((phase === "card" && revealingRarity) || flipActive) ? 0.4 : 1,
            transition: "opacity 0.2s",
            position: "relative", overflow: "hidden",
          }}
        >
          <span style={{ position: "relative", zIndex: 1 }}>
            {phase === "tease"
              ? flipActive ? "…" : "Reveal Card"
              : revealingRarity
              ? "…"
              : index < cards.length - 1
              ? `Next  ·  ${cards.length - index - 1} left`
              : "View All"}
          </span>
          {/* Shimmer on Reveal Card button */}
          {phase === "tease" && !flipActive && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(90deg, transparent 15%, rgba(255,255,255,0.28) 50%, transparent 85%)",
              animation: "teaseBtnShimmer 2.2s ease-in-out infinite",
              pointerEvents: "none",
            }} />
          )}
        </button>

        <button onClick={() => setDone(true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}>
          Skip to end
        </button>
      </div>
    </div>
  );
}

// ── Card Options Modal ────────────────────────────────────────────────────────

function CardOptionsModal({ card, isFeatured, featuredCount, onToggleFeatured, onCancel }: {
  card: UserCard;
  isFeatured: boolean;
  featuredCount: number;
  onToggleFeatured: () => void;
  onCancel: () => void;
}) {
  const [showTradeHint, setShowTradeHint] = useState(false);
  const meta = RARITY_META[card.rarity];

  return (
    <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center", padding: "20px 16px" }} onClick={onCancel}>
      <div style={{ ...modalPanelStyle, maxWidth: 400, borderRadius: 24, animation: "slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{card.player_name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginTop: 2 }}>{meta.label}</div>
          </div>
          <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.5)", width: 28, height: 28, borderRadius: "50%", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
        </div>

        {/* Action list */}
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }}>
          {/* Feature / Unfeature */}
          <button
            onClick={onToggleFeatured}
            style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", padding: "14px 16px", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: isFeatured ? "#fbbf24" : "var(--text-1)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill={isFeatured ? "#fbbf24" : "none"} stroke={isFeatured ? "#fbbf24" : "rgba(255,255,255,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{isFeatured ? "Remove from Featured" : "Add to Featured"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1, fontWeight: 500 }}>
                {isFeatured ? "Currently featured" : featuredCount >= 15 ? "Slots full (15/15)" : `${featuredCount} / 15 slots used`}
              </div>
            </div>
          </button>

          {/* Trade Card */}
          <button
            onClick={() => setShowTradeHint(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", padding: "14px 16px", border: "none", background: "rgba(255,255,255,0.03)", color: "#60a5fa", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Trade Card</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1, fontWeight: 500 }}>Offer to another player</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: showTradeHint ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>

        {showTradeHint && (
          <div style={{ borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, fontWeight: 500, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", marginBottom: 10 }}>
            Go to any user's <strong style={{ color: "#93c5fd", fontWeight: 700 }}>Album</strong> → tap a card they own → pick <strong style={{ color: "#93c5fd", fontWeight: 700 }}>{card.player_name}</strong> as your offer.
            <div style={{ marginTop: 10 }}>
              <Link href="/search" onClick={onCancel} style={{ color: "#60a5fa", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
                Find a player →
              </Link>
            </div>
          </div>
        )}

        {/* Cancel */}
        <button
          onClick={onCancel}
          style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function FilterPill({ active, color, onClick, children }: {
  active: boolean; color?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none", border: "none", cursor: "pointer",
        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800,
        flexShrink: 0,
        background: active ? (color ? `${color}22` : "var(--border-3)") : "transparent",
        color: active ? (color ?? "#f8fafc") : "rgba(255,255,255,.38)",
        outline: active ? `1px solid ${color ? `${color}55` : "var(--border-3)"}` : "none",
        transition: "all 0.14s ease",
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return <div className="spinner" />;
}

function CoinIcon({ size = 16 }: { size?: number }) {
  return <img src="/coin/coin.png" alt="coins" style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
};

const coinBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(251,191,36,.08)",
  border: "1px solid rgba(251,191,36,.25)",
  borderRadius: 999,
  padding: "6px 12px",
};

const contentStyle: React.CSSProperties = {
  maxWidth: 600,
  margin: "0 auto",
  padding: "16px 14px",
};

const cardsActionsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const cardsActionButtonStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "0 14px",
  borderRadius: 14,
  fontSize: 14,
  fontWeight: 850,
  letterSpacing: "-0.01em",
  textDecoration: "none",
  color: "#fff",
  background: "transparent",
  border: "1px solid #fff",
  WebkitTapHighlightColor: "transparent",
  transition: "transform 0.12s ease, opacity 0.12s ease",
};

const guestBannerStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  padding: "28px 20px",
  textAlign: "center",
  marginBottom: 24,
};

const loginBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 28px",
  borderRadius: 12,
  background: "#3b82f6",
  color: "var(--text-1)",
  fontWeight: 900,
  fontSize: 14,
  textDecoration: "none",
};

const shopHeaderStyle: React.CSSProperties = {
  marginBottom: 10,
  paddingLeft: 2,
  display: "flex",
  alignItems: "center",
};

const collectionHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingLeft: 2,
  paddingTop: 4,
};

const filtersWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 18,
  background: "rgba(255,255,255,.02)",
  border: "1px solid var(--border-1)",
  borderRadius: 14,
  padding: "12px 12px 10px",
};

const filterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const filterLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--text-3)",
  minWidth: 36,
  flexShrink: 0,
};

const pillRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  overflowX: "auto",
  scrollbarWidth: "none",
  paddingBottom: 2,
};

const teamFilterWrapStyle: React.CSSProperties = {
  position: "relative",
  width: "min(230px, 100%)",
  flexShrink: 1,
};

const teamFilterButtonStyle: React.CSSProperties = {
  width: "min(230px, 100%)",
  appearance: "none",
  display: "flex",
  alignItems: "center",
  gap: 8,
  backgroundColor: "rgba(255,255,255,.075)",
  border: "1px solid var(--border-3)",
  borderRadius: 10,
  color: "var(--text-1)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  outline: "none",
  padding: "7px 34px 7px 12px",
  boxShadow: "inset 0 1px 0 var(--border-1), 0 1px 8px rgba(0,0,0,.22)",
};

const teamFilterMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 80,
  width: "min(260px, calc(100vw - 56px))",
  maxHeight: 280,
  overflowY: "auto",
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 12,
  padding: 6,
  boxShadow: "0 18px 42px rgba(0,0,0,.55)",
};

const teamFilterOptionStyle: React.CSSProperties = {
  appearance: "none",
  border: "none",
  width: "100%",
  borderRadius: 9,
  padding: "9px 10px",
  background: "transparent",
  cursor: "pointer",
  color: "rgba(255,255,255,.72)",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  textAlign: "left",
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 12,
};

const emptyCollectionStyle: React.CSSProperties = {
  padding: "48px 20px",
  textAlign: "center",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0,0,0,.86)",
  backdropFilter: "blur(12px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "0 0 env(safe-area-inset-bottom)",
};

const modalPanelStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderRadius: "24px 24px 0 0",
  padding: "28px 20px 24px",
  width: "100%",
  maxWidth: 520,
  maxHeight: "90dvh",
  overflowY: "auto",
};
