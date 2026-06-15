"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Expand past the 760px page-shell while on this page
function useFullWidth() {
  useEffect(() => {
    document.body.classList.add("full-width-page");
    return () => document.body.classList.remove("full-width-page");
  }, []);
}
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";
import { CARD_PLAYERS, canonicalCardPlayerIdForCard, resolveCardPlayerId } from "@/app/data/cardPlayers";
import { PlayerCard as SharedPlayerCard } from "@/app/components/PlayerCard";
import PageHeader from "@/app/components/PageHeader";

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";

interface UserCard {
  id: string;
  player_id: string;
  player_name?: string | null;
  team?: string | null;
  team_logo?: string | null;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
}

const USER_CARDS_SELECT = "id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count";
const USER_CARDS_PAGE_SIZE = 1000;

async function fetchAllUserCardsForAlbum(userId: string) {
  const cards: UserCard[] = [];

  for (let from = 0; ; from += USER_CARDS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("user_cards")
      .select(USER_CARDS_SELECT)
      .eq("user_id", userId)
      .order("player_id", { ascending: true })
      .order("rarity", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + USER_CARDS_PAGE_SIZE - 1);

    if (error) throw error;
    cards.push(...((data ?? []) as UserCard[]));
    if (!data || data.length < USER_CARDS_PAGE_SIZE) break;
  }

  return cards;
}

const RARITY_ORDER: Record<Rarity, number> = {
  bronze: 0, silver: 1, gold: 2, emerald: 3, sapphire: 4,
  ruby: 5, amethyst: 6, diamond: 7, pinkdiamond: 8, mythic: 9,
};

const RARITY_META: Record<Rarity, { color: string; glow: string }> = {
  bronze:      { color: "#cd7f32", glow: "rgba(205,127,50,0.6)" },
  silver:      { color: "#c0c0c0", glow: "rgba(192,192,192,0.6)" },
  gold:        { color: "#ffd700", glow: "rgba(255,215,0,0.6)" },
  emerald:     { color: "#10b981", glow: "rgba(16,185,129,0.65)" },
  sapphire:    { color: "#3b82f6", glow: "rgba(59,130,246,0.65)" },
  ruby:        { color: "#ef4444", glow: "rgba(239,68,68,0.65)" },
  amethyst:    { color: "#a78bfa", glow: "rgba(167,139,250,0.70)" },
  diamond:     { color: "#67e8f9", glow: "rgba(103,232,249,0.70)" },
  pinkdiamond: { color: "#f472b6", glow: "rgba(244,114,182,0.70)" },
  mythic:      { color: "#c084fc", glow: "rgba(192,132,252,0.80)" },
};

const TEAMS = [
  "Adelaide", "Brisbane Lions", "Carlton", "Collingwood",
  "Essendon", "Fremantle", "Geelong", "GWS", "Gold Coast",
  "Hawthorn", "Melbourne", "North Melbourne", "Port Adelaide",
  "Richmond", "St Kilda", "Sydney", "West Coast", "Western Bulldogs",
];



type FeaturedCard = { player_id: string; rarity: Rarity };
type SelectedCard = { player: typeof CARD_PLAYERS[0]; cards: UserCard[] };

function teamShortName(team: string) {
  const map: Record<string, string> = {
    "Western Bulldogs": "Bulldogs",
    "Brisbane Lions": "Lions",
    "North Melbourne": "North",
    "Port Adelaide": "Port",
    "Gold Coast": "Suns",
    "West Coast": "Eagles",
    "St Kilda": "Saints",
    "GWS": "GWS",
  };
  return map[team] ?? team;
}

export default function AlbumPage() {
  useFullWidth();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTeam, setActiveTeam] = useState(TEAMS[0]);

  const [featuredCards, setFeaturedCards] = useState<FeaturedCard[]>([]);

  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
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

  const fetchCards = useCallback(async (uid: string) => {
    setLoading(true);
    await supabase.auth.getSession();
    try {
      setUserCards(await fetchAllUserCardsForAlbum(uid));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchCards(user.id);
    supabase
      .from("profiles")
      .select("featured_cards")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.featured_cards && Array.isArray(data.featured_cards)) {
          setFeaturedCards(data.featured_cards as FeaturedCard[]);
        }
      });
  }, [user, fetchCards]);

  async function toggleFeatured(playerId: string, rarity: Rarity) {
    if (!user) return;
    const isCurrentlyFeatured = featuredCards.some(f => resolveCardPlayerId(f.player_id) === playerId);
    let newFeatured: FeaturedCard[];
    if (isCurrentlyFeatured) {
      newFeatured = featuredCards.filter(f => resolveCardPlayerId(f.player_id) !== playerId);
    } else {
      if (featuredCards.length >= 15) return;
      newFeatured = [...featuredCards, { player_id: playerId, rarity }];
    }
    setFeaturedCards(newFeatured);
    await supabase.from("profiles").update({ featured_cards: newFeatured }).eq("id", user.id);
  }

  const cardsByPlayer = useMemo(() => {
    const map = new Map<string, UserCard[]>();
    for (const card of userCards) {
      const playerKey = canonicalCardPlayerIdForCard(card);
      const existing = map.get(playerKey) ?? [];
      existing.push(card);
      map.set(playerKey, existing);
    }
    for (const [pid, cards] of map) {
      map.set(pid, cards.sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]));
    }
    return map;
  }, [userCards]);

  const teamPlayers = useMemo(() => CARD_PLAYERS.filter((p) => p.team === activeTeam), [activeTeam]);
  const unlockedCount = teamPlayers.filter((p) => cardsByPlayer.has(p.id)).length;
  const totalCount = teamPlayers.length;
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const featuredPlayerIds = useMemo(() => new Set(featuredCards.map((card) => resolveCardPlayerId(card.player_id))), [featuredCards]);

  if (authLoading) return null;

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
      <style>{`
        .album-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          width: 100%;
        }
        @media (min-width: 768px) {
          .album-grid {
            grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
            gap: 10px;
            align-items: start;
          }
        }
        @media (min-width: 1200px) {
          .album-grid {
            grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
            gap: 12px;
          }
        }

        /* Card detail elements — scale for mobile */
        .ac-rating { position: absolute; top: 4px; right: 4px; font-size: 8px; padding: 1px 4px; border-radius: 4px; line-height: 1.5; }
        .ac-dup    { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); font-size: 7px; padding: 1px 4px; border-radius: 4px; line-height: 1.5; }
        .ac-name   { font-size: 9px; }
        .ac-logo   { position: absolute; width: 16px; height: 16px; bottom: 4px; left: 4px; border-radius: 50%; overflow: hidden; }
        .ac-pos    { position: absolute; font-size: 7px; bottom: 4px; right: 4px; padding: 1px 3px; border-radius: 4px; }
        .ac-year   { position: absolute; top: 4px; left: 4px; font-size: 7px; font-weight: 900; color: rgba(255,255,255,0.35); letter-spacing: 0.05em; }

        @media (min-width: 768px) {
          .ac-rating { font-size: 10px; top: 6px; right: 6px; padding: 2px 6px; }
          .ac-dup    { font-size: 9px; top: 6px; padding: 2px 6px; }
          .ac-name   { font-size: 12px; }
          .ac-logo   { width: 26px; height: 26px; bottom: 7px; left: 7px; }
          .ac-pos    { font-size: 10px; bottom: 7px; right: 7px; padding: 2px 6px; }
          .ac-year   { top: 6px; left: 6px; font-size: 9px; }
        }

        .album-tab-btn { transition: color 0.15s ease, background 0.15s ease; }
        .album-tab-btn:active { opacity: 0.7; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .album-grid { animation: fadeIn 0.22s ease; }
      `}</style>

      {/* Sticky header */}
      <PageHeader
        title="Card Album"
        subtitle={`${unlockedCount} of ${totalCount} unlocked · ${pct}%`}
        onBack={() => router.back()}
        right={
          <div style={{ width: 52, height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "linear-gradient(90deg,#60a5fa,#a78bfa)", transition: "width 0.4s ease" }} />
          </div>
        }
      />

      <div style={{
        background: "var(--bottom-nav-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border-1)",
      }}>
        {/* Team tabs */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "0 12px" }}>
          {TEAMS.map((team) => {
            const players = CARD_PLAYERS.filter((p) => p.team === team);
            const unlocked = players.filter((p) => cardsByPlayer.has(p.id)).length;
            const active = team === activeTeam;
            return (
              <button
                key={team}
                className="album-tab-btn"
                onClick={() => setActiveTeam(team)}
                style={{
                  appearance: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  padding: "9px 14px 10px", flexShrink: 0,
                  fontSize: 13, fontWeight: 800,
                  background: "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,.35)",
                  borderBottom: active ? "2px solid #fff" : "2px solid transparent",
                }}
              >
                {teamShortName(team)}
                <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: active ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.2)" }}>
                  {unlocked}/{players.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: "10px 10px 0" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 14 }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid var(--border-2)", borderTop: "2.5px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Loading collection…</div>
          </div>
        ) : (
          <div className="album-grid">
            {teamPlayers.map((player) => (
              (() => {
                const ownedCards = cardsByPlayer.get(player.id) ?? null;
                return (
                  <AlbumSlot
                    key={player.id}
                    player={player}
                    ownedCards={ownedCards}
                    isFeatured={featuredPlayerIds.has(player.id)}
                    onCardClick={(cards) => setSelectedCard({ player, cards })}
                  />
                );
              })()
            ))}
          </div>
        )}
      </div>

      {/* ── Card options modal ── */}
      {selectedCard && (
        <AlbumCardModal
          player={selectedCard.player}
          cards={selectedCard.cards}
          isFeatured={featuredPlayerIds.has(selectedCard.player.id)}
          featuredCount={featuredCards.length}
          onToggleFeatured={(card) => toggleFeatured(selectedCard.player.id, card.rarity)}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </main>
  );
}

// ── Album Card Modal ──────────────────────────────────────────────────────────

function AlbumCardModal({ player, cards, isFeatured, featuredCount, onToggleFeatured, onClose }: {
  player: typeof CARD_PLAYERS[0];
  cards: UserCard[];
  isFeatured: boolean;
  featuredCount: number;
  onToggleFeatured: (card: UserCard) => void;
  onClose: () => void;
}) {
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]),
    [cards],
  );
  const [selectedCardId, setSelectedCardId] = useState(sortedCards[0]?.id ?? "");
  const card = sortedCards.find((ownedCard) => ownedCard.id === selectedCardId) ?? sortedCards[0];

  useEffect(() => {
    setSelectedCardId(sortedCards[0]?.id ?? "");
  }, [sortedCards]);

  if (!card) return null;

  const meta = RARITY_META[card.rarity];
  const totalCopies = sortedCards.reduce((sum, ownedCard) => sum + ownedCard.duplicate_count, 0);
  const showOwnedCards = sortedCards.length > 1 || totalCopies > 1;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 24, padding: "24px 20px", width: "100%", maxWidth: 360 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{player.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginTop: 2 }}>
              {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.5)", width: 28, height: 28, borderRadius: "50%", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {showOwnedCards && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".14em", color: "rgba(255,255,255,.35)", textAlign: "center" }}>
                  OWNED CARDS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(78px, 1fr))", gap: 8 }}>
                  {sortedCards.map((ownedCard) => {
                    const ownedMeta = RARITY_META[ownedCard.rarity];
                    const active = ownedCard.id === card.id;
                    return (
                      <button
                        key={ownedCard.id}
                        onClick={() => { setSelectedCardId(ownedCard.id); }}
                        style={{
                          appearance: "none",
                          border: active ? `2px solid ${ownedMeta.color}` : "1px solid var(--border-2)",
                          background: active ? `${ownedMeta.color}22` : "var(--border-1)",
                          borderRadius: 12,
                          padding: 5,
                          cursor: "pointer",
                          color: "var(--text-1)",
                          fontFamily: "inherit",
                          boxShadow: active ? `0 0 14px ${ownedMeta.glow}` : "none",
                        }}
                      >
                        <div style={{ position: "relative", aspectRatio: "3/4.2", borderRadius: 8, overflow: "hidden" }}>
                          <img src={`/cards/${ownedCard.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,.7) 100%)" }} />
                          <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.82)", borderRadius: 5, padding: "1px 5px", fontSize: 9, fontWeight: 1000, color: ownedMeta.color }}>
                            {ownedCard.rating}
                          </div>
                          {ownedCard.duplicate_count > 1 && (
                            <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.78)", borderRadius: 5, padding: "1px 5px", fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,.72)" }}>
                              x{ownedCard.duplicate_count}
                            </div>
                          )}
                          <div style={{ position: "absolute", left: 5, right: 5, bottom: 5, fontSize: 9, fontWeight: 900, color: "var(--text-1)", textTransform: "uppercase", textAlign: "center" }}>
                            {ownedCard.rarity}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action list */}
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }}>
              <button
                onClick={() => { onToggleFeatured(card); onClose(); }}
                style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", padding: "14px 16px", border: "none", background: "rgba(255,255,255,0.03)", color: isFeatured ? "#fbbf24" : "var(--text-1)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
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
            </div>

            {/* Cancel */}
            <button
              onClick={onClose}
              style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
      </div>
    </div>
  );
}

// ── Album Slot ────────────────────────────────────────────────────────────────

function AlbumSlot({ player, ownedCards, isFeatured, onCardClick }: {
  player: typeof CARD_PLAYERS[0];
  ownedCards: UserCard[] | null;
  isFeatured: boolean;
  onCardClick: (cards: UserCard[]) => void;
}) {
  const unlocked = !!ownedCards && ownedCards.length > 0;
  const topCard = unlocked ? ownedCards[0] : null;
  const totalCopies = unlocked ? ownedCards.reduce((s, c) => s + c.duplicate_count, 0) : 0;

  return (
    <SharedPlayerCard
      card={{
        playerId: player.id,
        playerName: player.name,
        playerFolder: player.folder,
        playerTeam: player.team,
        playerTeamLogo: player.teamLogo,
        rarity: topCard?.rarity ?? "bronze",
        rating: topCard?.rating,
        duplicateCount: totalCopies > 1 ? totalCopies : undefined,
      }}
      locked={!unlocked}
      featured={isFeatured}
      onClick={unlocked && ownedCards ? () => onCardClick(ownedCards) : undefined}
    />
  );
}
