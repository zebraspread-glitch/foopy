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
import { CARD_PLAYERS } from "@/app/data/cardPlayers";

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";

interface UserCard {
  id: string;
  player_id: string;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
}

const RARITY_ORDER: Record<Rarity, number> = {
  bronze: 0, silver: 1, gold: 2, emerald: 3, sapphire: 4,
  ruby: 5, amethyst: 6, diamond: 7, pinkdiamond: 8, mythic: 9,
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
  const [selling, setSelling] = useState(false);

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
    const { data, error } = await supabase
      .from("user_cards")
      .select("id, player_id, rarity, rating, duplicate_count")
      .eq("user_id", uid);
    if (!error && data) setUserCards(data as UserCard[]);
    setLoading(false);
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
    const isCurrentlyFeatured = featuredCards.some(f => f.player_id === playerId);
    let newFeatured: FeaturedCard[];
    if (isCurrentlyFeatured) {
      newFeatured = featuredCards.filter(f => f.player_id !== playerId);
    } else {
      if (featuredCards.length >= 5) return;
      newFeatured = [...featuredCards, { player_id: playerId, rarity }];
    }
    setFeaturedCards(newFeatured);
    await supabase.from("profiles").update({ featured_cards: newFeatured }).eq("id", user.id);
  }

  async function handleSell(card: UserCard) {
    if (selling || !user) return;
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
      setSelectedCard(null);
      fetchCards(user.id);
      // Also remove from featured if it was featured
      const wasFeatured = featuredCards.some(f => f.player_id === card.player_id);
      if (wasFeatured) {
        const newFeatured = featuredCards.filter(f => f.player_id !== card.player_id);
        setFeaturedCards(newFeatured);
        await supabase.from("profiles").update({ featured_cards: newFeatured }).eq("id", user.id);
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSelling(false);
    }
  }

  const cardsByPlayer = useMemo(() => {
    const map = new Map<string, UserCard[]>();
    for (const card of userCards) {
      const existing = map.get(card.player_id) ?? [];
      existing.push(card);
      map.set(card.player_id, existing);
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

        @media (min-width: 768px) {
          .ac-rating { font-size: 10px; top: 6px; right: 6px; padding: 2px 6px; }
          .ac-dup    { font-size: 9px; top: 6px; padding: 2px 6px; }
          .ac-name   { font-size: 12px; }
          .ac-logo   { width: 26px; height: 26px; bottom: 7px; left: 7px; }
          .ac-pos    { font-size: 10px; bottom: 7px; right: 7px; padding: 2px 6px; }
        }

        .album-tab-btn { transition: color 0.15s ease, background 0.15s ease; }
        .album-tab-btn:active { opacity: 0.7; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .album-grid { animation: fadeIn 0.22s ease; }
      `}</style>

      {/* Sticky header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--bottom-nav-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border-1)",
        paddingTop: "env(safe-area-inset-top)",
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 10px 58px" }}>
          <button
            onClick={() => router.back()}
            style={{
              appearance: "none", border: "none",
              background: "var(--surface-3)",
              borderRadius: "50%", width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-1)", fontSize: 17, flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            ←
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: "-.02em", lineHeight: 1.2 }}>Card Album</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontWeight: 600, marginTop: 1 }}>
              {unlockedCount} of {totalCount} unlocked · {pct}%
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ width: 52, height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "linear-gradient(90deg,#60a5fa,#a78bfa)", transition: "width 0.4s ease" }} />
          </div>
        </div>

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
                    isFeatured={featuredCards.some(f => f.player_id === player.id)}
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
          isFeatured={featuredCards.some(f => f.player_id === selectedCard.player.id)}
          featuredCount={featuredCards.length}
          selling={selling}
          onToggleFeatured={(card) => toggleFeatured(selectedCard.player.id, card.rarity)}
          onSell={handleSell}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </main>
  );
}

// ── Album Card Modal ──────────────────────────────────────────────────────────

function AlbumCardModal({ player, cards, isFeatured, featuredCount, selling, onToggleFeatured, onSell, onClose }: {
  player: typeof CARD_PLAYERS[0];
  cards: UserCard[];
  isFeatured: boolean;
  featuredCount: number;
  selling: boolean;
  onToggleFeatured: (card: UserCard) => void;
  onSell: (card: UserCard) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"options" | "confirm">("options");
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]),
    [cards],
  );
  const [selectedCardId, setSelectedCardId] = useState(sortedCards[0]?.id ?? "");
  const card = sortedCards.find((ownedCard) => ownedCard.id === selectedCardId) ?? sortedCards[0];

  useEffect(() => {
    setSelectedCardId(sortedCards[0]?.id ?? "");
    setStep("options");
  }, [sortedCards]);

  if (!card) return null;

  const meta = RARITY_META[card.rarity];
  const SELL_VALUES: Record<Rarity, number> = {
    bronze: 1, silver: 3, gold: 10, emerald: 25, sapphire: 60,
    ruby: 150, amethyst: 300, diamond: 600, pinkdiamond: 1200, mythic: 2500,
  };
  const sellValue = SELL_VALUES[card.rarity];
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
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".14em", color: "rgba(255,255,255,.35)", marginBottom: 8 }}>
            {step === "confirm" ? "ARE YOU SURE?" : "CARD OPTIONS"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 1000, color: "var(--text-1)" }}>{player.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, marginTop: 3 }}>
            {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
          </div>
        </div>

        {step === "options" ? (
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
                        onClick={() => { setSelectedCardId(ownedCard.id); setStep("options"); }}
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

            {/* Feature / Unfeature */}
            <button
              onClick={() => { onToggleFeatured(card); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 16, border: `1px solid ${isFeatured ? "rgba(255,215,0,.35)" : "var(--border-2)"}`, background: isFeatured ? "rgba(255,215,0,.08)" : "var(--border-1)", color: isFeatured ? "#ffd700" : "#f1f5f9", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFeatured ? "#ffd700" : "none"} stroke={isFeatured ? "#ffd700" : "#94a3b8"} strokeWidth="2" style={{ flexShrink: 0 }}>
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{isFeatured ? "Remove from Featured" : "Add to Featured"}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
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
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <img src="/coin/coin.png" alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />
                  {sellValue} coins
                </div>
              </div>
            </button>

            {/* Cancel */}
            <button
              onClick={onClose}
              style={{ padding: "14px", borderRadius: 16, border: "1px solid var(--border-2)", background: "transparent", color: "var(--text-3)", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: "rgba(239,68,68,.07)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>You will receive</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <img src="/coin/coin.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                <span style={{ fontSize: 22, fontWeight: 1000, color: "#fbbf24" }}>{sellValue.toLocaleString()}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.45)", fontWeight: 700 }}>coins</span>
              </div>
            </div>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,.4)", fontSize: 13, fontWeight: 700, margin: "0 0 16px" }}>
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("options")}
                style={{ flex: 1, padding: "13px", borderRadius: 14, border: "1px solid var(--border-2)", background: "transparent", color: "rgba(255,255,255,.6)", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
              >
                Go Back
              </button>
              <button
                onClick={() => onSell(card)}
                disabled={selling}
                style={{ flex: 1, padding: "13px", borderRadius: 14, border: "none", background: selling ? "rgba(239,68,68,.4)" : "#ef4444", color: "var(--text-1)", fontWeight: 900, fontSize: 14, cursor: selling ? "default" : "pointer", fontFamily: "inherit" }}
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
  const meta = topCard ? RARITY_META[topCard.rarity] : null;

  return (
    <div
      style={{ position: "relative", aspectRatio: "3/4.2", cursor: unlocked ? "pointer" : "default" }}
      onClick={() => { if (unlocked && ownedCards) onCardClick(ownedCards); }}
    >
      {/* Main card */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 9, overflow: "hidden", zIndex: 10,
        boxShadow: unlocked && meta
          ? `0 0 0 1.5px ${meta.color}99, 0 6px 20px ${meta.glow}`
          : "0 0 0 1px var(--border-1)",
        filter: unlocked ? "none" : "grayscale(1) brightness(0.18)",
        transition: "box-shadow 0.2s ease",
      }}>
        <img
          src={unlocked && topCard ? `/cards/${topCard.rarity}.png` : "/cards/bronze.png"}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,.65) 72%, rgba(0,0,0,.92) 100%)" }} />

        {unlocked && topCard && meta ? (
          <>
            {/* Rating */}
            <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>
              {topCard.rating}
            </div>

            {/* Duplicate count */}
            {totalCopies > 1 && (
              <div className="ac-dup" style={{ background: "rgba(0,0,0,.75)", fontWeight: 900, color: "rgba(255,255,255,.6)" }}>
                ×{totalCopies}
              </div>
            )}

            {/* Player circle */}
            <div style={{
              position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)",
              width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden",
              border: `2px solid ${meta.color}`,
              boxShadow: `0 0 12px ${meta.glow}`,
              background: TEAM_COLORS[player.team] ?? "#1a1a24",
            }}>
              <img
                src={`/players/${player.folder}/${player.id}.png`}
                alt={player.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
              />
            </div>

            {/* Player name */}
            <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
              <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 10px ${meta.glow}` }}>
                {player.name}
              </div>
            </div>

            {/* Team logo — bottom left */}
            <div className="ac-logo" style={{ background: "rgba(0,0,0,.55)", border: "1.5px solid var(--border-3)" }}>
              <img src={player.teamLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>

            {/* Position — bottom right */}
            <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>
              {player.position}
            </div>
          </>
        ) : (
          /* Locked */
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ fontSize: 14, opacity: 0.2 }}>🔒</div>
            <div className="ac-name" style={{ fontWeight: 800, color: "rgba(255,255,255,.2)", textAlign: "center", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
              {player.name}
            </div>
          </div>
        )}
      </div>

      {/* Featured badge — static indicator */}
      {isFeatured && (
        <div style={{
          position: "absolute", top: totalCopies > 1 ? 24 : 3, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, width: 16, height: 16, borderRadius: "50%",
          background: "#ffd700", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 6px rgba(255,215,0,0.8)", pointerEvents: "none",
        }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="#14141e">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        </div>
      )}
    </div>
  );
}
