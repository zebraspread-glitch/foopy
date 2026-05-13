"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = "bronze" | "silver" | "gold" | "diamond" | "mythic";
type PackType = "starter" | "general" | "mythical";
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

const RARITY_ORDER: Record<Rarity, number> = { bronze: 0, silver: 1, gold: 2, diamond: 3, mythic: 4 };

const RARITY_META: Record<Rarity, { label: string; color: string; glow: string; bg: string }> = {
  bronze:  { label: "Bronze",  color: "#cd7f32", glow: "rgba(205,127,50,0.55)",  bg: "rgba(205,127,50,0.12)" },
  silver:  { label: "Silver",  color: "#c0c0c0", glow: "rgba(192,192,192,0.55)", bg: "rgba(192,192,192,0.10)" },
  gold:    { label: "Gold",    color: "#ffd700", glow: "rgba(255,215,0,0.55)",   bg: "rgba(255,215,0,0.12)" },
  diamond: { label: "Diamond", color: "#67e8f9", glow: "rgba(103,232,249,0.6)",  bg: "rgba(103,232,249,0.12)" },
  mythic:  { label: "Mythic",  color: "#c084fc", glow: "rgba(192,132,252,0.7)",  bg: "rgba(192,132,252,0.14)" },
};

const TEAM_PLAYER_FOLDER: Record<string, string> = {
  Adelaide: "crows",
  Carlton: "blues",
  Collingwood: "magpies",
  Essendon: "bombers",
  Fremantle: "dockers",
  GWS: "giants",
  "Port Adelaide": "power",
  "Western Bulldogs": "bulldogs",
  "Brisbane Lions": "lions",
};

const PACKS: { type: PackType; label: string; cost: number; cards: string; image: string; accent: string; description: string }[] = [
  {
    type: "starter",
    label: "Starter Pack",
    cost: 100,
    cards: "3 cards",
    image: "/packs/starter.png",
    accent: "#cd7f32",
    description: "Up to Gold rarity",
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

const RARITY_ODDS: Record<PackType, { rarity: Rarity; pct: string }[]> = {
  starter: [
    { rarity: "bronze", pct: "70%" }, { rarity: "silver", pct: "25%" }, { rarity: "gold", pct: "5%" },
  ],
  general: [
    { rarity: "bronze", pct: "45%" }, { rarity: "silver", pct: "30%" }, { rarity: "gold", pct: "17%" },
    { rarity: "diamond", pct: "1%" }, { rarity: "mythic", pct: "0.1%" },
  ],
  mythical: [
    { rarity: "bronze", pct: "35%" }, { rarity: "silver", pct: "30%" }, { rarity: "gold", pct: "20%" },
    { rarity: "diamond", pct: "15%" }, { rarity: "mythic", pct: "100% (1 guaranteed)" },
  ],
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#111111", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#1a1a1a", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const ALL_TEAMS = [
  "Carlton",
  "Western Bulldogs",
  "Adelaide",
  "Brisbane Lions",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "GWS",
  "Port Adelaide",
];

const RARITY_SELL_VALUE: Record<Rarity, number> = {
  bronze: 1, silver: 5, gold: 10, diamond: 100, mythic: 500,
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CardsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [coins, setCoins] = useState(0);
  const [cards, setCards] = useState<UserCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [opening, setOpening] = useState<PackType | null>(null);
  const [openedCards, setOpenedCards] = useState<OpenedCard[] | null>(null);

  // filters
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  // pack odds tooltip
  const [oddsFor, setOddsFor] = useState<PackType | null>(null);

  // sell
  const [sellCard, setSellCard] = useState<UserCard | null>(null);
  const [selling, setSelling] = useState(false);

  // featured cards
  const [featuredCards, setFeaturedCards] = useState<{ player_id: string; rarity: Rarity }[]>([]);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchBalance = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("coins")
      .eq("id", uid)
      .single();
    setCoins(data?.coins ?? 0);
  }, []);

  const fetchCards = useCallback(async (uid: string) => {
    setCardsLoading(true);
    // Ensure the session is loaded so RLS auth.uid() resolves correctly
    await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (!error && data) setCards(data as UserCard[]);
    setCardsLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      fetchBalance(user.id);
      fetchCards(user.id);
      supabase
        .from("profiles")
        .select("featured_cards")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.featured_cards && Array.isArray(data.featured_cards)) {
            setFeaturedCards(data.featured_cards as { player_id: string; rarity: Rarity }[]);
          }
        });
    }
  }, [user, fetchBalance, fetchCards]);

  // ── Pack opening ──────────────────────────────────────────────────────────

  async function handleOpenPack(packType: PackType) {
    if (opening) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setOpening(packType);
    try {
      const res = await fetch("/api/cards/open-pack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ packType }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to open pack");
        return;
      }
      setCoins(data.newCoins);
      setOpenedCards(data.cards as OpenedCard[]);
      if (user) { fetchCards(user.id); fetchBalance(user.id); }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setOpening(null);
    }
  }

  // ── Sell card ─────────────────────────────────────────────────────────────

  async function handleSell(card: UserCard) {
    if (selling) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setSelling(true);
    try {
      const res = await fetch("/api/cards/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to sell card"); return; }
      setCoins(data.newCoins);
      setSellCard(null);
      if (user) fetchCards(user.id);
    } catch {
      alert("Something went wrong.");
    } finally {
      setSelling(false);
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
      if (featuredCards.length >= 5) return;
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
    return result;
  }, [cards, rarityFilter, teamFilter, sortBy]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <main style={pageStyle}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <Spinner />
        </div>
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
        .cards-grid { animation: fadeIn 0.22s ease; }
        .card-item { transition: transform 0.12s ease; cursor: pointer; }
        .card-item:active { transform: scale(0.95); }
        .pack-card-wrap { transition: transform 0.15s ease; }
        .pack-card-wrap:active { transform: scale(0.97); }
        .open-btn:active:not(:disabled) { opacity: 0.8 !important; transform: scale(0.97); }
        .pill-scroll { scrollbar-width: none; }
        .pill-scroll::-webkit-scrollbar { display: none; }
        .team-filter-select option {
          background: #111318;
          color: #f8fafc;
          font-weight: 700;
        }
        @media (min-width: 720px) {
          .team-filter-select {
            height: 34px;
            min-width: 190px;
            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          }
          .team-filter-select:hover {
            background-color: rgba(255,255,255,.11) !important;
            border-color: rgba(255,255,255,.22) !important;
          }
          .team-filter-select:focus {
            border-color: rgba(96,165,250,.7) !important;
            box-shadow: 0 0 0 3px rgba(96,165,250,.16);
          }
        }
      `}</style>

      {/* Header bar */}
      <header style={headerStyle}>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#f8fafc", letterSpacing: "-0.01em" }}>Cards</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/album" style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.5)", textDecoration: "none", background: "rgba(255,255,255,.07)", borderRadius: 99, padding: "5px 11px" }}>
            Album
          </Link>
          {user && (
            <div style={coinBadgeStyle}>
              <CoinIcon />
              <span style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>{coins.toLocaleString()}</span>
            </div>
          )}
        </div>
      </header>

      <div style={contentStyle}>
        {/* ── NOT LOGGED IN ── */}
        {!user && (
          <>
            <div style={guestBannerStyle}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6, color: "#f8fafc" }}>Sign in to open packs</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>Collect players, build your squad, and open packs with Coins.</div>
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
              oddsFor={oddsFor}
              onOpenPack={handleOpenPack}
              onShowOdds={setOddsFor}
            />

            <div style={collectionHeaderStyle}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 900, fontSize: 16, color: "#f8fafc" }}>My Collection</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                  {cards.length} card{cards.length !== 1 ? "s" : ""}
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
                  {(["bronze", "silver", "gold", "diamond", "mythic"] as Rarity[]).map((r) => (
                    <FilterPill key={r} active={rarityFilter === r} color={RARITY_META[r].color} onClick={() => setRarityFilter(r)}>
                      {RARITY_META[r].label}
                    </FilterPill>
                  ))}
                </div>
              </div>

              {/* Team filter */}
              <div style={filterRowStyle}>
                <span style={filterLabelStyle}>Team</span>
                <select
                  className="team-filter-select"
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                  style={filterSelectStyle}
                  aria-label="Filter cards by team"
                >
                  <option value="all">All teams</option>
                  {ALL_TEAMS.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
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
                <div style={{ fontWeight: 900, fontSize: 15, color: "#f8fafc", marginBottom: 6 }}>
                  {cards.length === 0 ? "No cards yet" : "No matches"}
                </div>
                <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                  {cards.length === 0 ? "Open a pack to start your collection" : "Try adjusting your filters"}
                </div>
              </div>
            ) : (
              <div className="cards-grid" style={cardGridStyle}>
                {displayCards.map((card) => (
                  <PlayerCard key={card.id} card={card} onSell={() => setSellCard(card)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Pack opening result modal */}
      {openedCards && (
        <PackOpenModal
          cards={openedCards}
          onClose={() => setOpenedCards(null)}
        />
      )}

      {/* Sell confirm modal */}
      {sellCard && (
        <SellConfirmModal
          card={sellCard}
          selling={selling}
          isFeatured={featuredCards.some(f => f.player_id === sellCard.player_id)}
          featuredCount={featuredCards.length}
          onToggleFeatured={() => toggleFeaturedCard(sellCard.player_id, sellCard.rarity)}
          onConfirm={() => handleSell(sellCard)}
          onCancel={() => setSellCard(null)}
        />
      )}
    </main>
  );
}

// ── Pack Shop ─────────────────────────────────────────────────────────────────

function PackShop({
  coins, opening, oddsFor, onOpenPack, onShowOdds,
}: {
  coins: number;
  opening: PackType | null;
  oddsFor: PackType | null;
  onOpenPack: (p: PackType) => void;
  onShowOdds: (p: PackType | null) => void;
}) {
  return (
    <section style={{ marginBottom: 8 }}>
      <div style={shopHeaderStyle}>
        <span style={{ fontWeight: 900, fontSize: 16, color: "#f8fafc" }}>Pack Shop</span>
      </div>
      <div style={packRowStyle}>
        {PACKS.map((pack) => {
          const canAfford = coins >= pack.cost;
          const isOpening = opening === pack.type;
          const showOdds = oddsFor === pack.type;
          return (
            <div key={pack.type} className="pack-card-wrap" style={{ ...packCardStyle, outline: showOdds ? `1.5px solid ${pack.accent}` : "none" }}>
              {/* Pack image */}
              <div style={{ position: "relative", width: "100%", aspectRatio: "3/4", overflow: "hidden", borderRadius: 12, marginBottom: 10 }}>
                <img
                  src={pack.image}
                  alt={pack.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>

              {/* Pack info */}
              <div style={{ fontWeight: 900, fontSize: 14, color: "#f8fafc", marginBottom: 2 }}>{pack.label}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>{pack.description}</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>{pack.cards}</div>

              {/* Cost */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
                <CoinIcon size={14} />
                <span style={{ fontWeight: 900, fontSize: 15, color: canAfford ? "#fbbf24" : "#475569" }}>
                  {pack.cost.toLocaleString()}
                </span>
                {!canAfford && (
                  <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginLeft: 2 }}>Not enough</span>
                )}
              </div>

              {/* Open button */}
              <button
                onClick={() => onOpenPack(pack.type)}
                disabled={!canAfford || !!opening}
                className="open-btn"
                style={{
                  ...openBtnBase,
                  background: canAfford ? pack.accent : "rgba(255,255,255,.05)",
                  color: canAfford ? "#000" : "#334155",
                  opacity: canAfford && !opening ? 1 : 0.5,
                  cursor: canAfford && !opening ? "pointer" : "not-allowed",
                  boxShadow: canAfford ? `0 4px 18px ${pack.accent}44` : "none",
                }}
              >
                {isOpening ? <Spinner /> : "Open"}
              </button>

              {/* Odds toggle */}
              <button
                onClick={() => onShowOdds(showOdds ? null : pack.type)}
                style={oddsBtnStyle}
              >
                {showOdds ? "Hide odds ▲" : "Odds ▼"}
              </button>

              {showOdds && (
                <div style={oddsBoxStyle}>
                  {RARITY_ODDS[pack.type].map(({ rarity, pct }) => (
                    <div key={rarity} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: RARITY_META[rarity].color }}>{RARITY_META[rarity].label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{pct}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Pack Shop Preview (not logged in) ────────────────────────────────────────

function PackShopPreview() {
  return (
    <section style={{ marginBottom: 8, opacity: 0.45, pointerEvents: "none" }}>
      <div style={shopHeaderStyle}>
        <span style={{ fontWeight: 900, fontSize: 16, color: "#f8fafc" }}>Pack Shop</span>
      </div>
      <div style={packRowStyle}>
        {PACKS.map((pack) => (
          <div key={pack.type} style={packCardStyle}>
            <div style={{ width: "100%", aspectRatio: "3/4", overflow: "hidden", borderRadius: 12, marginBottom: 10 }}>
              <img src={pack.image} alt={pack.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 14, color: "#f8fafc", marginBottom: 2 }}>{pack.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <CoinIcon size={14} />
              <span style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>{pack.cost.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Player Card ───────────────────────────────────────────────────────────────

function PlayerCard({ card, onSell }: { card: UserCard; onSell?: () => void }) {
  const meta = RARITY_META[card.rarity];
  const folder = TEAM_PLAYER_FOLDER[card.team] ?? "lions";

  return (
    <div
      className={onSell ? "card-item" : undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3/4.2",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: `0 0 0 1.5px ${meta.color}55, 0 8px 28px rgba(0,0,0,0.55)`,
        flexShrink: 0,
      }}
      onClick={onSell}
    >
      {/* Rarity template background */}
      <img
        src={`/cards/${card.rarity}.png`}
        alt={card.rarity}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Dark gradient overlay for readability */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,.0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />

      {/* Rating badge — top right */}
      <div style={{
        position: "absolute", top: 8, right: 8,
        background: "rgba(0,0,0,.72)", borderRadius: 8,
        padding: "3px 7px", fontSize: 13, fontWeight: 1000, color: meta.color,
        border: `1px solid ${meta.color}55`,
        lineHeight: 1,
      }}>
        {card.rating}
      </div>

      {/* Duplicate badge — top left */}
      {card.duplicate_count > 1 && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,.72)", borderRadius: 8,
          padding: "3px 7px", fontSize: 10, fontWeight: 900, color: "#94a3b8",
          border: "1px solid rgba(255,255,255,.1)",
        }}>
          ×{card.duplicate_count}
        </div>
      )}

      {/* Circular player photo — centered upper area */}
      <div style={{
        position: "absolute",
        top: "18%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "68%",
        aspectRatio: "1/1",
        borderRadius: "50%",
        overflow: "hidden",
        border: `2.5px solid ${meta.color}`,
        boxShadow: `0 0 14px ${meta.glow}`,
        background: TEAM_COLORS[card.team] ?? "#111",
      }}>
        <img
          src={`/players/${folder}/${card.player_id}.png`}
          alt={card.player_name}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
        />
      </div>

      {/* Player name — centered just below player circle */}
      <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 10px ${meta.glow}` }}>
          {card.player_name}
        </div>
      </div>

      {/* Team logo — bottom left */}
      <div style={{ position: "absolute", width: 18, height: 18, bottom: 5, left: 5, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,.55)", border: "1.5px solid rgba(255,255,255,.18)" }}>
        <img src={card.team_logo} alt={card.team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const current = cards[index];
  const meta = current ? RARITY_META[current.rarity] : null;
  const isRare = current?.rarity === "diamond" || current?.rarity === "mythic";
  const REVEAL_DURATION = current?.rarity === "mythic" ? 1400 : 1100;

  const flip = () => {
    if (revealing) return;
    if (!flipped) {
      if (isRare) {
        setRevealing(true);
        setTimeout(() => { setRevealing(false); setFlipped(true); }, REVEAL_DURATION);
      } else {
        setFlipped(true);
      }
      return;
    }
    setFlipped(false);
    if (index < cards.length - 1) {
      setTimeout(() => setIndex((i) => i + 1), 180);
    } else {
      setDone(true);
    }
  };

  const skipAll = () => { setRevealing(false); setDone(true); };

  if (done) {
    return (
      <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
        <div style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 24,
          padding: "20px 16px 16px",
          width: "100%",
          maxWidth: 480,
          animation: "slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.38)", marginBottom: 4 }}>
              PACK OPENED
            </div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#f8fafc" }}>
              {cards.length} Card{cards.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`,
            gap: 6,
            marginBottom: 14,
          }}>
            {cards.map((card, i) => {
              const m = RARITY_META[card.rarity];
              return (
                <div key={i} style={{ position: "relative", aspectRatio: "3/4.2", borderRadius: 10, overflow: "hidden", boxShadow: `0 0 0 1.5px ${m.color}99, 0 6px 20px ${m.glow}` }}>
                  <img src={`/cards/${card.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,.65) 72%, rgba(0,0,0,.92) 100%)" }} />
                  {/* Rating */}
                  <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.82)", borderRadius: 5, padding: "1px 5px", fontSize: 9, fontWeight: 1000, color: m.color, border: `1px solid ${m.color}44` }}>{card.rating}</div>
                  {/* NEW badge */}
                  {card.is_new && <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "2px 7px", fontSize: 7, fontWeight: 900, color: "#fff", letterSpacing: ".1em", boxShadow: "0 2px 8px rgba(34,197,94,.5)", whiteSpace: "nowrap" }}>✦ NEW</div>}
                  {/* Player circle */}
                  <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", border: `2px solid ${m.color}`, boxShadow: `0 0 10px ${m.glow}`, background: "#0a0a0a" }}>
                    <img src={card.player_image} alt={card.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                  </div>
                  {/* Player name */}
                  <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 4px" }}>
                    <div style={{ fontSize: 7, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 8px ${m.glow}` }}>{card.player_name}</div>
                  </div>
                  {/* Team logo */}
                  <div style={{ position: "absolute", width: 14, height: 14, bottom: 4, left: 4, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,.55)", border: "1.5px solid rgba(255,255,255,.18)" }}>
                    <img src={card.team_logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={onClose}
            style={{ display: "block", width: "100%", padding: "13px", borderRadius: 14, border: "none", background: "rgba(255,255,255,.12)", color: "#f8fafc", fontWeight: 900, fontSize: 15, cursor: "pointer" }}
          >
            Add to Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 340, padding: "0 20px" }} onClick={(e) => e.stopPropagation()}>

        {/* Counter */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          {cards.map((_, i) => (
            <div key={i} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 99, background: i < index ? "rgba(255,255,255,.5)" : i === index ? "#fff" : "rgba(255,255,255,.18)", transition: "all 0.25s ease" }} />
          ))}
        </div>

        {/* Card flip container */}
        <div style={{ position: "relative", width: "100%", maxWidth: 260, marginBottom: 28 }}>

          {/* Pre-reveal animation overlay (diamond/mythic only) */}
          {revealing && meta && (
            <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Radial glow background */}
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}30 0%, transparent 65%)`, animation: `revealFlash ${REVEAL_DURATION}ms ease-out forwards` }} />
              {/* Light rays */}
              <div style={{ position: "absolute", inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${meta.color}18 20deg, transparent 40deg, transparent 60deg, ${meta.color}12 80deg, transparent 100deg, transparent 120deg, ${meta.color}18 140deg, transparent 160deg, transparent 180deg, ${meta.color}14 200deg, transparent 220deg, transparent 240deg, ${meta.color}18 260deg, transparent 280deg, transparent 300deg, ${meta.color}12 320deg, transparent 340deg, transparent 360deg)`, animation: `revealRays ${REVEAL_DURATION}ms ease-out forwards`, borderRadius: "50%" }} />
              {/* Ring 1 */}
              <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${REVEAL_DURATION * 0.7}ms ease-out forwards` }} />
              {/* Ring 2 */}
              <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}88`, animation: `revealRing ${REVEAL_DURATION * 0.85}ms 80ms ease-out forwards` }} />
              {/* Ring 3 */}
              <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${REVEAL_DURATION}ms 160ms ease-out forwards` }} />
              {/* Rarity label */}
              <div style={{ position: "absolute", bottom: "12%", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", animation: `revealText ${REVEAL_DURATION}ms ease-out forwards` }}>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".28em", color: meta.color, textShadow: `0 0 20px ${meta.color}, 0 0 40px ${meta.color}88` }}>
                  {current?.rarity === "mythic" ? "✦ MYTHIC ✦" : "✦ DIAMOND ✦"}
                </div>
              </div>
            </div>
          )}

          <div
            onClick={flip}
            style={{ width: "100%", aspectRatio: "3/4.2", cursor: revealing ? "default" : "pointer", perspective: 800 }}
          >
            <div style={{
              position: "relative", width: "100%", height: "100%",
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)",
              transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1)",
            }}>
              {/* Front (card face) */}
              <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", backfaceVisibility: "hidden", boxShadow: flipped && meta ? `0 0 0 2px ${meta.color}88, 0 16px 48px ${meta.glow}, 0 0 80px ${meta.glow}44` : "none" }}>
                {current && meta && (
                  <>
                    <img src={`/cards/${current.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.05) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.92) 100%)" }} />
                    <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.8)", borderRadius: 9, padding: "3px 8px", fontSize: 14, fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>
                      {current.rating}
                    </div>
                    {current.is_new && (
                      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: ".12em", boxShadow: "0 2px 12px rgba(34,197,94,.55)", whiteSpace: "nowrap" }}>
                        ✦ NEW
                      </div>
                    )}
                    <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", border: `2.5px solid ${meta.color}`, boxShadow: `0 0 20px ${meta.glow}`, background: TEAM_COLORS[current.team] ?? "#111" }}>
                      <img src={current.player_image} alt={current.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                    </div>
                    <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 10px" }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 12px ${meta.glow}` }}>{current.player_name}</div>
                    </div>
                    <div style={{ position: "absolute", width: 26, height: 26, bottom: 8, left: 8, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,.55)", border: "1.5px solid rgba(255,255,255,.2)" }}>
                      <img src={current.team_logo} alt={current.team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  </>
                )}
              </div>

              {/* Back (card back / mystery) */}
              <div style={{
                position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden",
                backfaceVisibility: "hidden", transform: "rotateY(180deg)",
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                boxShadow: "0 0 0 1.5px rgba(255,255,255,.08), 0 12px 40px rgba(0,0,0,.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>🃏</div>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.28)" }}>TAP TO REVEAL</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <button
          onClick={flip}
          disabled={revealing}
          style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: flipped ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.1)", color: "#f8fafc", fontWeight: 900, fontSize: 15, cursor: revealing ? "default" : "pointer", marginBottom: 10, backdropFilter: "blur(12px)", transition: "background 0.15s ease", opacity: revealing ? 0.4 : 1 }}
        >
          {revealing ? "…" : !flipped ? "Reveal Card" : index < cards.length - 1 ? `Next Card  ·  ${cards.length - index - 1} left` : "View All"}
        </button>

        <button
          onClick={skipAll}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}
        >
          Skip to end
        </button>
      </div>
    </div>
  );
}

// ── Sell Confirm Modal ────────────────────────────────────────────────────────

function SellConfirmModal({ card, selling, isFeatured, featuredCount, onToggleFeatured, onConfirm, onCancel }: {
  card: UserCard;
  selling: boolean;
  isFeatured: boolean;
  featuredCount: number;
  onToggleFeatured: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"options" | "confirm">("options");
  const meta = RARITY_META[card.rarity];
  const value = RARITY_SELL_VALUE[card.rarity];

  return (
    <div style={{ ...modalOverlayStyle, alignItems: "center", justifyContent: "center", padding: "20px 16px" }} onClick={onCancel}>
      <div style={{ ...modalPanelStyle, maxWidth: 400, borderRadius: 24, animation: "slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".14em", color: "rgba(255,255,255,.38)", marginBottom: 8 }}>
            {step === "confirm" ? "ARE YOU SURE?" : "CARD OPTIONS"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 1000, color: "#f8fafc" }}>{card.player_name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, marginTop: 3 }}>{meta.label}</div>
        </div>

        {step === "options" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Feature / Unfeature */}
            <button
              onClick={onToggleFeatured}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "16px 18px", borderRadius: 16,
                border: `1px solid ${isFeatured ? "rgba(255,215,0,.35)" : "rgba(255,255,255,.1)"}`,
                background: isFeatured ? "rgba(255,215,0,.08)" : "rgba(255,255,255,.04)",
                color: isFeatured ? "#ffd700" : "#f1f5f9",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFeatured ? "#ffd700" : "none"} stroke={isFeatured ? "#ffd700" : "#94a3b8"} strokeWidth="2" style={{ flexShrink: 0 }}>
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{isFeatured ? "Remove from Featured" : "Add to Featured"}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {isFeatured ? "Currently in your featured cards" : featuredCount >= 5 ? "Featured slots full (5/5)" : `${featuredCount}/5 slots used`}
                </div>
              </div>
            </button>

            {/* Sell Card */}
            <button
              onClick={() => setStep("confirm")}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 16, border: "1px solid rgba(239,68,68,.25)", background: "rgba(239,68,68,.06)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>Sell Card</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <CoinIcon size={12} />
                  {value} coins
                </div>
              </div>
            </button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              style={{ padding: "14px", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "transparent", color: "#64748b", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>You will receive</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <CoinIcon size={18} />
                <span style={{ fontSize: 24, fontWeight: 1000, color: "#fbbf24" }}>{value.toLocaleString()}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.45)", fontWeight: 700 }}>coin{value !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.45)", fontSize: 13, fontWeight: 700, margin: "0 0 16px" }}>
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("options")}
                style={{ flex: 1, padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.6)", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
              >
                Go Back
              </button>
              <button
                onClick={onConfirm}
                disabled={selling}
                style={{ flex: 1, padding: "13px", borderRadius: 14, border: "none", background: selling ? "rgba(239,68,68,.4)" : "#ef4444", color: "#fff", fontWeight: 900, fontSize: 14, cursor: selling ? "default" : "pointer", fontFamily: "inherit" }}
              >
                {selling ? "Selling…" : "Yes, Sell"}
              </button>
            </div>
          </>
        )}
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
        background: active ? (color ? `${color}22` : "rgba(255,255,255,.12)") : "transparent",
        color: active ? (color ?? "#f8fafc") : "rgba(255,255,255,.38)",
        outline: active ? `1px solid ${color ? `${color}55` : "rgba(255,255,255,.18)"}` : "none",
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
  background: "#080808",
  color: "#f8fafc",
  paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
};

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "calc(env(safe-area-inset-top) + 12px) 18px 12px 58px",
  background: "rgba(0,0,0,.92)",
  backdropFilter: "blur(24px)",
  borderBottom: "0.5px solid rgba(255,255,255,.07)",
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

const guestBannerStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
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
  color: "#fff",
  fontWeight: 900,
  fontSize: 14,
  textDecoration: "none",
};

const shopHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingLeft: 2,
};

const packRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  marginBottom: 28,
};

const packCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 18,
  padding: 12,
  display: "flex",
  flexDirection: "column",
};

const openBtnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "9px 0",
  fontWeight: 900,
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  transition: "opacity 0.15s ease, box-shadow 0.15s ease",
  marginBottom: 6,
};

const oddsBtnStyle: React.CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  color: "#475569",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  padding: "2px 0",
  textAlign: "left" as const,
};

const oddsBoxStyle: React.CSSProperties = {
  marginTop: 6,
  padding: "8px 10px",
  background: "rgba(0,0,0,.4)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.06)",
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
  border: "1px solid rgba(255,255,255,.06)",
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
  color: "#475569",
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

const filterSelectStyle: React.CSSProperties = {
  width: "min(230px, 100%)",
  appearance: "none",
  backgroundColor: "rgba(255,255,255,.075)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 10,
  color: "#f8fafc",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  outline: "none",
  padding: "7px 34px 7px 12px",
  backgroundImage: [
    "linear-gradient(45deg, transparent 50%, rgba(255,255,255,.72) 50%)",
    "linear-gradient(135deg, rgba(255,255,255,.72) 50%, transparent 50%)",
    "linear-gradient(90deg, transparent, rgba(255,255,255,.08))",
  ].join(", "),
  backgroundPosition: "calc(100% - 16px) 50%, calc(100% - 11px) 50%, 100% 0",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 1px 8px rgba(0,0,0,.22)",
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
  background: "#0a0a0a",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: "24px 24px 0 0",
  padding: "28px 20px 24px",
  width: "100%",
  maxWidth: 520,
  maxHeight: "90dvh",
  overflowY: "auto",
};
