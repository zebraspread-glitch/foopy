"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CARD_PLAYERS, canonicalCardPlayerIdForCard, findCardPlayerForCard } from "@/app/data/cardPlayers";
import { getPassLevel, xpProgressLabel, PLAYER_PASS_LEVELS, TEAM_PASS_LEVELS, dedupePlayerPasses, type PlayerPass, type TeamPass } from "@/app/lib/passes";
import PassLeaderboard from "@/app/components/PassLeaderboard";
import TeamPassLeaderboard from "@/app/components/TeamPassLeaderboard";
import { supabase } from "@/app/lib/supabase";
import { PlayerCard as SharedPlayerCard } from "@/app/components/PlayerCard";

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

interface ProfileInfo {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const USER_CARDS_SELECT = "id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count";
const USER_CARDS_PAGE_SIZE = 1000;

async function fetchAllAlbumCards(userId: string) {
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

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const MYTHIC_TEXT = "#29276b";
const MYTHIC_MUTED = "rgba(41,39,107,0.62)";
const MYTHIC_ACCENT = "#5b5ff0";

function isMythicLevel(level: { name: string }) {
  return level.name === "Mythic";
}

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

type SelectedCard = { player: typeof CARD_PLAYERS[0]; cards: UserCard[] };

export default function UserAlbumPage() {
  const router = useRouter();
  const params = useParams();
  const username = String(params.username || "").toLowerCase();
  const teamTabsRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTeam, setActiveTeam] = useState(TEAMS[0]);
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [view, setView] = useState<"album" | "passes">("album");
  const [playerPasses, setPlayerPasses] = useState<PlayerPass[]>([]);
  const [teamPasses, setTeamPasses] = useState<TeamPass[]>([]);
  const [leaderboardPlayerPass, setLeaderboardPlayerPass] = useState<PlayerPass | null>(null);
  const [leaderboardTeamPass,   setLeaderboardTeamPass]   = useState<TeamPass | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [tradeTarget, setTradeTarget] = useState<{ card: UserCard; player: typeof CARD_PLAYERS[0] } | null>(null);
  const [cardPicker, setCardPicker] = useState<{ player: typeof CARD_PLAYERS[0]; cards: UserCard[] } | null>(null);


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMyUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetch(`/api/album/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) { setLoading(false); return; }
        setProfile(data.profile);
        setUserCards(data.cards);
        setPlayerPasses(dedupePlayerPasses((data.playerPasses ?? []) as PlayerPass[]));
        setTeamPasses(data.teamPasses ?? []);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [username]);

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

  const displayName = profile?.display_name || (profile?.username ? `@${profile.username}` : username);

  if (notFound) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>User not found</div>
        <button onClick={() => router.back()} style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.5)", background: "none", border: "none", cursor: "pointer" }}>← Go back</button>
      </main>
    );
  }

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
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--bottom-nav-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border-1)",
        paddingTop: "env(safe-area-inset-top)",
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 10px" }}>
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

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: "-.02em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loading ? "Loading…" : `${displayName}`}
            </div>
            {!loading && view === "album" && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontWeight: 600, marginTop: 1 }}>
                {unlockedCount} of {totalCount} unlocked · {pct}%
              </div>
            )}
            {!loading && view === "passes" && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontWeight: 600, marginTop: 1 }}>
                {playerPasses.length} player pass{playerPasses.length !== 1 ? "es" : ""}{teamPasses.length > 0 ? ` · ${teamPasses.length} team pass${teamPasses.length !== 1 ? "es" : ""}` : ""}
              </div>
            )}
          </div>

          {/* Progress bar (album only) */}
          {!loading && view === "album" && (
            <div style={{ width: 52, height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden", flexShrink: 0 }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "linear-gradient(90deg,#60a5fa,#a78bfa)", transition: "width 0.4s ease" }} />
            </div>
          )}

        </div>

        {/* Album / Passes toggle */}
        <div style={{ display: "flex", padding: "0 12px 10px", gap: 8 }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.07)", borderRadius: 999, padding: 3, flex: 1 }}>
            {(["album", "passes"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                flex: 1, padding: "7px 0", borderRadius: 999, border: "none",
                background: view === v ? "rgba(255,255,255,0.13)" : "transparent",
                color: view === v ? "#fff" : "rgba(255,255,255,.38)",
                fontWeight: view === v ? 800 : 600, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}>
                {v === "album" ? "Album" : "Passes"}
              </button>
            ))}
          </div>
        </div>

        {/* Team tabs — only in album view */}
        {view === "album" && (
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            {/* Left arrow */}
            <button
              onClick={() => teamTabsRef.current?.scrollBy({ left: -160, behavior: "instant" as ScrollBehavior })}
              style={{ position: "absolute", left: 0, zIndex: 5, appearance: "none", border: "none", background: "linear-gradient(to right, var(--bottom-nav-bg) 60%, transparent)", padding: "0 10px 0 6px", height: "100%", cursor: "pointer", color: "rgba(255,255,255,.5)", fontSize: 14, flexShrink: 0 }}
              aria-label="Scroll left"
            >‹</button>

            <div
              ref={teamTabsRef}
              style={{ display: "flex", overflowX: "scroll", scrollbarWidth: "none", msOverflowStyle: "none", padding: "0 32px", flex: 1, scrollSnapType: "x proximity" } as React.CSSProperties}
            >
              <style>{`.team-tabs-inner::-webkit-scrollbar { display: none; }`}</style>
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
                    {!loading && (
                      <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: active ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.2)" }}>
                        {unlocked}/{players.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right arrow */}
            <button
              onClick={() => teamTabsRef.current?.scrollBy({ left: 160, behavior: "instant" as ScrollBehavior })}
              style={{ position: "absolute", right: 0, zIndex: 5, appearance: "none", border: "none", background: "linear-gradient(to left, var(--bottom-nav-bg) 60%, transparent)", padding: "0 6px 0 10px", height: "100%", cursor: "pointer", color: "rgba(255,255,255,.5)", fontSize: 14, flexShrink: 0 }}
              aria-label="Scroll right"
            >›</button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 14 }}>
          <div className="spinner" />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Loading…</div>
        </div>
      ) : view === "album" ? (
        <div style={{ padding: "10px 10px 0" }}>
          <div className="album-grid">
            {teamPlayers.map((player) => {
              const ownedCards = cardsByPlayer.get(player.id) ?? null;
              const isOwnAlbum = myUserId && profile && myUserId === profile.id;
              return (
                <AlbumSlot
                  key={player.id}
                  player={player}
                  ownedCards={ownedCards}
                  onCardClick={(cards) => {
                    if (isOwnAlbum) {
                      setSelectedCard({ player, cards });
                    } else if (cards.length === 1) {
                      setTradeTarget({ card: cards[0], player });
                    } else {
                      setCardPicker({ player, cards });
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <PassesView
          playerPasses={playerPasses}
          teamPasses={teamPasses}
          onPlayerPassClick={(p) => setLeaderboardPlayerPass(p)}
          onTeamPassClick={(t) => setLeaderboardTeamPass(t)}
        />
      )}

      {selectedCard && (
        <AlbumCardListModal
          player={selectedCard.player}
          cards={selectedCard.cards}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {cardPicker && profile && myUserId && myUserId !== profile.id && (
        <CardPickerModal
          player={cardPicker.player}
          cards={cardPicker.cards}
          onClose={() => setCardPicker(null)}
          onSelect={(card) => {
            setCardPicker(null);
            setTradeTarget({ card, player: cardPicker.player });
          }}
        />
      )}

      {tradeTarget && profile && myUserId && myUserId !== profile.id && (
        <TradeOfferModal
          requestCard={tradeTarget.card}
          requestPlayer={tradeTarget.player}
          receiverId={profile.id}
          receiverName={profile.username ?? username}
          myUserId={myUserId}
          onClose={() => setTradeTarget(null)}
        />
      )}

      {leaderboardPlayerPass && (
        <PassLeaderboard pass={leaderboardPlayerPass} onClose={() => setLeaderboardPlayerPass(null)} />
      )}
      {leaderboardTeamPass && (
        <TeamPassLeaderboard pass={leaderboardTeamPass} onClose={() => setLeaderboardTeamPass(null)} />
      )}
    </main>
  );
}

// ── Passes View ───────────────────────────────────────────────────────────────

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  "Geelong Cats": "/team-logos/cats.png", Geelong: "/team-logos/cats.png",
  "Gold Coast Suns": "/team-logos/suns.png", "Gold Coast": "/team-logos/suns.png",
  "GWS Giants": "/team-logos/giants.png", GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
  "Sydney Swans": "/team-logos/swans.png", Sydney: "/team-logos/swans.png",
  "West Coast Eagles": "/team-logos/eagles.png", "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows",
  Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues", Collingwood: "magpies", Essendon: "bombers",
  Fremantle: "dockers", GWS: "giants", "GWS Giants": "giants",
  Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns",
  Hawthorn: "hawks", Melbourne: "demons",
  "North Melbourne": "kangaroos", "Port Adelaide": "power",
  Richmond: "tigers", "St Kilda": "saints",
  Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
};

function playerImgSrc(playerName: string, teamName: string): string {
  const folder = TEAM_FOLDER[teamName] ?? teamName.toLowerCase().replace(/[^a-z]/g, "");
  const slug   = playerName.toLowerCase().replace(/[^a-z]/g, "");
  if (!folder || !slug) return "";
  return `/players/${folder}/${slug}.png`;
}

type PassSortKey = "recent" | "level";

function PassesView({ playerPasses, teamPasses, onPlayerPassClick, onTeamPassClick }: {
  playerPasses: PlayerPass[];
  teamPasses: TeamPass[];
  onPlayerPassClick: (p: PlayerPass) => void;
  onTeamPassClick: (t: TeamPass) => void;
}) {
  const [sortBy, setSortBy] = useState<PassSortKey>("recent");

  const sortedPlayerPasses = useMemo(() => {
    const copy = [...playerPasses];
    if (sortBy === "level") {
      copy.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
    } else {
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return copy;
  }, [playerPasses, sortBy]);

  const hasAny = playerPasses.length > 0 || teamPasses.length > 0;

  if (!hasAny) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🎫</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text-1)" }}>No passes yet</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", fontWeight: 600 }}>This user hasn't bought any passes.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Team passes */}
      {teamPasses.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
            Team Pass{teamPasses.length !== 1 ? "es" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teamPasses.map((tp) => {
              const level = getPassLevel(tp.xp ?? 0, TEAM_PASS_LEVELS);
              const logo  = TEAM_LOGOS[tp.team_name] ?? "/team-logos/default.png";
              const isMythic = isMythicLevel(level);
              return (
                <div key={tp.id} onClick={() => onTeamPassClick(tp)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, background: level.gradient, border: `1.5px solid ${isMythic ? "rgba(125,211,252,0.75)" : level.color + "44"}`, boxShadow: isMythic ? "0 6px 26px rgba(125,211,252,0.24), 0 0 18px rgba(167,139,250,0.18)" : "none", position: "relative", overflow: "hidden", cursor: "pointer" }}>
                  {isMythic && <div className="mythic-pass-shine" style={{ zIndex: 1 }} />}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,0.3)", position: "relative", zIndex: 2 }}>
                    <img src={logo} alt={tp.team_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isMythic ? MYTHIC_TEXT : "#fff" }}>{tp.team_name}</div>
                      {tp.serial_number != null && <div style={{ fontSize: 13, fontWeight: 900, color: isMythic ? MYTHIC_TEXT : "#fff" }}>#{tp.serial_number}</div>}
                    </div>
                    <div style={{ fontSize: 11, color: isMythic ? MYTHIC_ACCENT : level.color, fontWeight: 800, letterSpacing: "0.05em", marginBottom: 6 }}>{level.name.toUpperCase()} · {level.multiplier}×</div>
                    <div style={{ background: isMythic ? "rgba(91,95,240,0.16)" : "rgba(0,0,0,0.35)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: isMythic ? `linear-gradient(90deg,${level.darkColor},#22d3ee,#ffffff)` : `linear-gradient(90deg,${level.darkColor},${level.color})` }} />
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: isMythic ? MYTHIC_MUTED : "rgba(255,255,255,.3)", fontWeight: 600 }}>
                      {xpProgressLabel(level)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player passes */}
      {playerPasses.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Player Passes · {playerPasses.length}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {(["recent", "level"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  style={{
                    appearance: "none", border: "none", cursor: "pointer",
                    padding: "4px 10px", borderRadius: 999,
                    fontSize: 10, fontWeight: 800, fontFamily: "inherit",
                    background: sortBy === key ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                    color: sortBy === key ? "#fff" : "rgba(255,255,255,.38)",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {key === "recent" ? "Recent" : "Level"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {sortedPlayerPasses.map((pass) => {
              const level  = getPassLevel(pass.xp ?? 0, PLAYER_PASS_LEVELS);
              const imgSrc = playerImgSrc(pass.player_name, pass.team_name);
              const isMythic = isMythicLevel(level);
              return (
                <div key={pass.id} onClick={() => onPlayerPassClick(pass)} style={{
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  background: level.gradient, cursor: "pointer",
                  border: `1.5px solid ${isMythic ? "rgba(125,211,252,0.75)" : level.color + "55"}`,
                  boxShadow: isMythic
                    ? "0 4px 26px rgba(125,211,252,0.30), 0 0 18px rgba(167,139,250,0.22), 0 0 0 0.5px rgba(255,255,255,0.70)"
                    : `0 4px 24px ${level.color}22, 0 0 0 0.5px rgba(255,255,255,0.06)`,
                  aspectRatio: "3/4",
                  display: "flex", flexDirection: "column",
                }}>
                  {isMythic && <div className="mythic-pass-shine" style={{ zIndex: 2 }} />}
                  {/* shimmer */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  {/* level badge */}
                  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 4, background: isMythic ? "linear-gradient(135deg,rgba(255,255,255,0.82),rgba(125,211,252,0.34),rgba(167,139,250,0.36))" : level.color, color: isMythic ? MYTHIC_ACCENT : "#000", border: isMythic ? "1px solid rgba(125,211,252,0.55)" : "none", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>
                    {level.name.toUpperCase()}
                  </div>
                  {/* serial number */}
                  {pass.serial_number != null && (
                    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 4, fontSize: 8, fontWeight: 900, color: isMythic ? MYTHIC_TEXT : "#fff", letterSpacing: "0.06em" }}>#{pass.serial_number}</div>
                  )}
                  {/* photo */}
                  <div style={{ flex: 1, overflow: "hidden", position: "relative", background: isMythic ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.2)" }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={pass.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
                    }
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: isMythic ? "linear-gradient(to bottom,transparent,rgba(238,247,255,0.92))" : `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#0a0a14"})` }} />
                  </div>
                  {/* footer */}
                  <div style={{ padding: "8px 10px 10px", background: isMythic ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.25)", flexShrink: 0, position: "relative", zIndex: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: isMythic ? MYTHIC_TEXT : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{pass.player_name}</div>
                    </div>
                    <div style={{ fontSize: 9.5, color: isMythic ? MYTHIC_MUTED : "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: isMythic ? MYTHIC_ACCENT : level.color, letterSpacing: "0.06em" }}>{level.name.toUpperCase()} · {level.multiplier}×</span>
                        <span style={{ fontSize: 9, color: isMythic ? MYTHIC_MUTED : "rgba(255,255,255,0.4)", fontWeight: 600 }}>{xpProgressLabel(level)}</span>
                      </div>
                      <div style={{ background: isMythic ? "rgba(91,95,240,0.16)" : "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: isMythic ? `linear-gradient(90deg,${level.darkColor},#22d3ee,#ffffff)` : `linear-gradient(90deg,${level.darkColor},${level.color})`, boxShadow: `0 0 6px ${level.color}80` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CardPickerModal({ player, cards, onClose, onSelect }: {
  player: typeof CARD_PLAYERS[0];
  cards: UserCard[];
  onClose: () => void;
  onSelect: (card: UserCard) => void;
}) {
  const sorted = useMemo(
    () => [...cards].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]),
    [cards],
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#111", borderRadius: 20, width: "100%", maxWidth: 420, padding: "20px 20px 28px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "0 0 18px" }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-.02em" }}>{player.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
            Which card do you want to trade for?
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(sorted.length, 3)}, 1fr)`, gap: 12, padding: "0 16px" }}>
          {sorted.map((card) => {
            const meta = RARITY_META[card.rarity];
            return (
              <button
                key={card.id}
                onClick={() => onSelect(card)}
                style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", padding: 0, position: "relative" }}
              >
                <div style={{
                  position: "relative", aspectRatio: "3/4.2", borderRadius: 12, overflow: "hidden",
                  boxShadow: `0 0 0 2px ${meta.color}88, 0 6px 24px ${meta.glow}`,
                  transition: "transform 0.15s",
                }}>
                  <img src={`/cards/${card.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.1) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,.72) 72%, rgba(0,0,0,.9) 100%)" }} />
                  {/* Player photo */}
                  <div style={{ position: "absolute", top: "16%", left: "50%", transform: "translateX(-50%)", width: "66%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[player.team] ?? "#1e2438") + "44" }}>
                    <img src={`/players/${player.folder}/${player.id}.png`} alt={player.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                  </div>
                  {/* Rating */}
                  <div style={{ position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: 1000, color: meta.color, background: "rgba(0,0,0,.85)", borderRadius: 5, padding: "2px 5px", border: `1px solid ${meta.color}44` }}>{card.rating}</div>
                  {/* Duplicate count */}
                  {card.duplicate_count > 1 && (
                    <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.7)", background: "rgba(0,0,0,.8)", borderRadius: 5, padding: "2px 5px" }}>×{card.duplicate_count}</div>
                  )}
                  {/* Rarity */}
                  <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: meta.color, letterSpacing: ".1em" }}>{card.rarity.toUpperCase()}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AlbumCardListModal({ player, cards, onClose }: {
  player: typeof CARD_PLAYERS[0];
  cards: UserCard[];
  onClose: () => void;
}) {
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]),
    [cards],
  );
  const totalCopies = sortedCards.reduce((sum, card) => sum + card.duplicate_count, 0);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 24, padding: "24px 20px 18px", width: "100%", maxWidth: 420 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".16em", color: "rgba(255,255,255,.35)", marginBottom: 8 }}>
            OWNED CARDS
          </div>
          <div style={{ fontSize: 20, fontWeight: 1000, color: "var(--text-1)" }}>{player.name}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.45)", marginTop: 3 }}>
            {totalCopies} card{totalCopies !== 1 ? "s" : ""}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 10 }}>
          {sortedCards.map((card) => {
            const meta = RARITY_META[card.rarity];
            return (
              <div key={card.id} style={{ border: `1.5px solid ${meta.color}88`, background: `${meta.color}12`, borderRadius: 12, padding: 6, boxShadow: `0 0 14px ${meta.glow}` }}>
                <div style={{ position: "relative", aspectRatio: "3/4.2", borderRadius: 8, overflow: "hidden" }}>
                  <img src={`/cards/${card.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,.7) 100%)" }} />
                  <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.82)", borderRadius: 5, padding: "1px 5px", fontSize: 10, fontWeight: 1000, color: meta.color }}>
                    {card.rating}
                  </div>
                  {card.duplicate_count > 1 && (
                    <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.78)", borderRadius: 5, padding: "1px 5px", fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.72)" }}>
                      x{card.duplicate_count}
                    </div>
                  )}
                  <div style={{ position: "absolute", left: 5, right: 5, bottom: 5, fontSize: 10, fontWeight: 900, color: "var(--text-1)", textTransform: "uppercase", textAlign: "center" }}>
                    {card.rarity}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 14, border: "1px solid var(--border-2)", background: "transparent", color: "var(--text-3)", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Trade Offer Modal ─────────────────────────────────────────────────────────

type MyCard = {
  id: string;
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
};

const LAZY_BATCH = 20;

function LazyCardGrid({ cards, selectedIds, onSelect }: {
  cards: (UserCard | MyCard)[];
  selectedIds: Set<string>;
  onSelect: (card: UserCard | MyCard) => void;
}) {
  const [visible, setVisible] = useState(LAZY_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset count when the card list changes (search query changed)
  useEffect(() => { setVisible(LAZY_BATCH); }, [cards]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(v => Math.min(v + LAZY_BATCH, cards.length)); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length]);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
        {cards.slice(0, visible).map(card => {
          const player = findCardPlayerForCard(card);
          return (
            <MiniCard
              key={card.id}
              card={card as MyCard}
              player={player}
              selected={selectedIds.has(card.id)}
              onToggle={() => onSelect(card)}
            />
          );
        })}
      </div>
      {visible < cards.length && (
        <div ref={sentinelRef} style={{ height: 1, marginTop: 8 }} />
      )}
    </>
  );
}

function MiniCard({ card, player, selected, onToggle }: {
  card: MyCard;
  player: typeof CARD_PLAYERS[0] | null | undefined;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = RARITY_META[card.rarity];
  return (
    <button
      onClick={onToggle}
      style={{
        appearance: "none", border: "none", background: "none",
        cursor: "pointer", padding: 0, position: "relative",
        outline: "none", borderRadius: 8,
        transform: selected ? "scale(1.04)" : "scale(1)",
        transition: "transform 0.15s",
      }}
    >
      {/* Card shell */}
      <div style={{
        position: "relative", aspectRatio: "3/4.2", borderRadius: 8, overflow: "hidden",
        boxShadow: selected
          ? `0 0 0 2.5px ${meta.color}, 0 4px 18px ${meta.glow}`
          : `0 0 0 1px ${meta.color}55, 0 2px 8px rgba(0,0,0,.4)`,
        transition: "box-shadow 0.15s",
      }}>
        {/* Card art */}
        <img
          src={`/cards/${card.rarity}.png`}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Gradient */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.1) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,.7) 72%, rgba(0,0,0,.88) 100%)" }} />
        {/* Player photo */}
        {player && (
          <div style={{
            position: "absolute", top: "14%", left: "50%", transform: "translateX(-50%)",
            width: "70%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden",
            background: (TEAM_COLORS[player.team] ?? "#1e2438") + "33",
          }}>
            <img
              src={`/players/${player.folder}/${player.id}.png`}
              alt={player.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
            />
          </div>
        )}
        {/* Rating */}
        <div style={{
          position: "absolute", top: 3, right: 3, fontSize: 7, fontWeight: 1000,
          color: meta.color, background: "rgba(0,0,0,.8)", borderRadius: 4,
          padding: "1px 4px", border: `1px solid ${meta.color}44`, lineHeight: 1.5,
        }}>{card.rating}</div>
        {/* Name */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 4px 4px",
          textAlign: "center", fontSize: 7.5, fontWeight: 900, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textShadow: `0 0 8px ${meta.glow}`,
        }}>{card.player_name.split(" ").pop()}</div>
      </div>
      {/* Check badge */}
      {selected && (
        <div style={{
          position: "absolute", top: -4, left: -4, width: 16, height: 16,
          borderRadius: "50%", background: meta.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 6px ${meta.glow}`,
        }}>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </button>
  );
}

function TradeCardSlot({ card, player, onRemove }: { card: UserCard | MyCard; player: typeof CARD_PLAYERS[0] | null | undefined; onRemove: () => void }) {
  const meta = RARITY_META[card.rarity];
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Card art — overflow hidden only here */}
      <div style={{ position: "relative", aspectRatio: "3/4.2", borderRadius: 10, overflow: "hidden", boxShadow: `0 0 0 2px ${meta.color}88, 0 4px 16px ${meta.glow}` }}>
        <img src={`/cards/${card.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,0) 35%,rgba(0,0,0,.75) 72%,rgba(0,0,0,.92) 100%)" }} />
        {player && (
          <div style={{ position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)", width: "65%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[player.team] ?? "#1e2438") + "44" }}>
            <img src={`/players/${player.folder}/${player.id}.png`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
          </div>
        )}
        <div style={{ position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 1000, color: meta.color, background: "rgba(0,0,0,.85)", borderRadius: 4, padding: "1px 4px" }}>{card.rating}</div>
        <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center", fontSize: 7, fontWeight: 900, color: meta.color, letterSpacing: ".08em" }}>{card.rarity.toUpperCase()}</div>
      </div>
      {/* X button — outside overflow:hidden so it's never clipped */}
      <button onClick={onRemove} style={{ position: "absolute", top: -7, left: -7, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", border: "2px solid #111", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 2 }}>
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

function EmptyCardSlot({ label, onClick, disabled }: { label?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{ width: "100%", aspectRatio: "3/4.2", borderRadius: 10, border: "1.5px dashed rgba(255,255,255,.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer", gap: 4, transition: "border-color 0.15s", background: "rgba(255,255,255,.03)" }}
    >
      {!disabled && <div style={{ fontSize: 20, color: "rgba(255,255,255,.2)", lineHeight: 1 }}>+</div>}
      {label && <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.2)", textAlign: "center", padding: "0 4px" }}>{label}</div>}
    </div>
  );
}

function TradeOfferModal({
  requestCard,
  requestPlayer,
  receiverId,
  receiverName,
  myUserId,
  onClose,
}: {
  requestCard: UserCard;
  requestPlayer: typeof CARD_PLAYERS[0];
  receiverId: string;
  receiverName: string;
  myUserId: string;
  onClose: () => void;
}) {
  // "Want" = cards we're requesting from receiver
  const [wantCards, setWantCards] = useState<UserCard[]>([requestCard]);
  const [wantPlayers, setWantPlayers] = useState<(typeof CARD_PLAYERS[0])[]>([requestPlayer]);
  const [receiverAllCards, setReceiverAllCards] = useState<UserCard[]>([]);
  const [receiverSearch, setReceiverSearch] = useState("");
  const [showWantPicker, setShowWantPicker] = useState(false);

  // "Offer" = cards we're giving to receiver
  const [myCards, setMyCards] = useState<MyCard[]>([]);
  const [offerIds, setOfferIds] = useState<Set<string>>(new Set());
  const [offerSearch, setOfferSearch] = useState("");
  const [showOfferPicker, setShowOfferPicker] = useState(false);

  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingTheirs, setLoadingTheirs] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setLoadingMine(false); setLoadingTheirs(false); return; }
      // Fetch independently so each picker shows up as soon as its data arrives
      fetchAllAlbumCards(myUserId)
        .then((data) => { setMyCards([...data].sort((a, b) => b.rating - a.rating) as MyCard[]); })
        .finally(() => { setLoadingMine(false); });
      fetchAllAlbumCards(receiverId)
        .then((data) => { setReceiverAllCards([...data].sort((a, b) => b.rating - a.rating)); })
        .finally(() => { setLoadingTheirs(false); });
    });
  }, [myUserId, receiverId]);

  function addWant(card: UserCard) {
    const player = findCardPlayerForCard(card);
    if (!player) return;
    setWantCards(prev => [...prev, card]);
    setWantPlayers(prev => [...prev, player]);
    setShowWantPicker(false);
    setReceiverSearch("");
  }
  function removeWant(idx: number) {
    setWantCards(prev => prev.filter((_, i) => i !== idx));
    setWantPlayers(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleOffer(id: string) {
    setOfferIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 3) next.add(id);
      return next;
    });
  }

  async function sendOffer() {
    if (sending || sent) return;
    setSending(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not logged in."); setSending(false); return; }

    const offerItems = myCards.filter(c => offerIds.has(c.id)).map(c => ({
      card_id: c.id, player_id: c.player_id, player_name: c.player_name,
      team: c.team, team_logo: c.team_logo, rarity: c.rarity, rating: c.rating,
    }));
    const requestItems = wantCards.map((c, i) => ({
      card_id: c.id, player_id: wantPlayers[i]?.id ?? "", player_name: wantPlayers[i]?.name ?? c.player_id,
      team: wantPlayers[i]?.team ?? "", team_logo: wantPlayers[i]?.teamLogo ?? "", rarity: c.rarity, rating: c.rating,
    }));

    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ receiver_id: receiverId, offer_items: offerItems, request_items: requestItems }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to send."); setSending(false); return; }
    setSent(true); setSending(false);
  }

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [sent]);

  const canSend = wantCards.length > 0 && offerIds.size > 0 && !sending && !sent;

  // Filtered receiver cards for want-picker (exclude already wanted)
  const wantedIds = new Set(wantCards.map(c => c.id));
  const filteredReceiverCards = (() => {
    const q = receiverSearch.trim().toLowerCase();
    const pool = receiverAllCards.filter(c => !wantedIds.has(c.id));
    if (!q) return pool;
    return pool.filter(c => {
      const p = findCardPlayerForCard(c);
      return (p?.name ?? c.player_name ?? "").toLowerCase().includes(q) || c.rarity.toLowerCase().includes(q) || (p?.team ?? c.team ?? "").toLowerCase().includes(q);
    });
  })();

  // Filtered own cards for offer-picker (exclude already offered)
  const filteredMyCards = (() => {
    const q = offerSearch.trim().toLowerCase();
    const pool = myCards.filter(c => !offerIds.has(c.id));
    if (!q) return pool;
    return pool.filter(c => c.player_name.toLowerCase().includes(q) || c.rarity.toLowerCase().includes(q) || c.team.toLowerCase().includes(q));
  })();

  const offeredCards = myCards.filter(c => offerIds.has(c.id));

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#111", borderRadius: 20, width: "100%", maxWidth: 540, maxHeight: "90dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-.02em" }}>
            Trade with <span style={{ color: "#60a5fa" }}>@{receiverName}</span>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Two-column trade area */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "rgba(255,255,255,.07)" }}>

            {/* LEFT — You want */}
            <div style={{ background: "#111", padding: "14px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: ".1em", marginBottom: 10 }}>YOU WANT</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {wantCards.map((card, i) => (
                  <TradeCardSlot key={card.id} card={card} player={wantPlayers[i]} onRemove={() => removeWant(i)} />
                ))}
                {wantCards.length < 3 && (
                  <EmptyCardSlot label="Add card" onClick={() => { setShowWantPicker(true); setShowOfferPicker(false); }} />
                )}
                {Array.from({ length: Math.max(0, 2 - wantCards.length) }).map((_, i) => (
                  <EmptyCardSlot key={i} disabled />
                ))}
              </div>
            </div>

            {/* RIGHT — You offer */}
            <div style={{ background: "#111", padding: "14px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.4)", letterSpacing: ".1em", marginBottom: 10 }}>YOU OFFER</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {offeredCards.map(card => {
                  const player = findCardPlayerForCard(card);
                  return <TradeCardSlot key={card.id} card={card} player={player} onRemove={() => toggleOffer(card.id)} />;
                })}
                {offerIds.size < 3 && (
                  <EmptyCardSlot label="Add card" onClick={() => { setShowOfferPicker(true); setShowWantPicker(false); }} />
                )}
                {Array.from({ length: Math.max(0, 2 - offerIds.size) }).map((_, i) => (
                  <EmptyCardSlot key={i} disabled />
                ))}
              </div>
            </div>
          </div>

          {/* Picker area */}
          {(showWantPicker || showOfferPicker) && (
            <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", marginBottom: 8 }}>
                {showWantPicker ? `PICK FROM @${receiverName}'S CARDS` : "PICK FROM YOUR CARDS"}
              </div>

              {(showWantPicker ? loadingTheirs : loadingMine) ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                  <div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,.1)", borderTop: "2.5px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                </div>
              ) : (
                <>
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.3 }} width="13" height="13" viewBox="0 0 20 20" fill="none">
                      <circle cx="8.5" cy="8.5" r="5.5" stroke="white" strokeWidth="2"/>
                      <path d="M13 13l3.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      value={showWantPicker ? receiverSearch : offerSearch}
                      onChange={e => showWantPicker ? setReceiverSearch(e.target.value) : setOfferSearch(e.target.value)}
                      placeholder="Search…"
                      style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, color: "#fff", fontSize: 13, padding: "8px 12px 8px 30px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  {(() => {
                    const cards = showWantPicker ? filteredReceiverCards : filteredMyCards;
                    if (cards.length === 0) return <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(255,255,255,.3)", fontSize: 12 }}>No cards found</div>;
                    return (
                      <LazyCardGrid
                        cards={cards}
                        onSelect={(card) => {
                          if (showWantPicker) {
                            addWant(card as UserCard);
                          } else {
                            toggleOffer(card.id);
                            setShowOfferPicker(false);
                            setOfferSearch("");
                          }
                        }}
                        selectedIds={showWantPicker ? wantedIds : offerIds}
                      />
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ padding: "12px 14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {error && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fca5a5", fontWeight: 600 }}>{error}</div>
            )}
            {sent ? (
              <div style={{ textAlign: "center", padding: "8px 0", fontSize: 14, fontWeight: 900, color: "#4ade80" }}>Trade offer sent! ✓</div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "rgba(255,255,255,.45)", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button
                  onClick={sendOffer}
                  disabled={!canSend}
                  style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: canSend ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "rgba(255,255,255,.08)", color: canSend ? "#fff" : "rgba(255,255,255,.25)", fontWeight: 900, fontSize: 13, cursor: canSend ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.15s" }}
                >
                  {sending ? "Sending…" : "Send Offer"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Album Slot ────────────────────────────────────────────────────────────────

function AlbumSlot({ player, ownedCards, onCardClick }: {
  player: typeof CARD_PLAYERS[0];
  ownedCards: UserCard[] | null;
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
      onClick={unlocked && ownedCards ? () => onCardClick(ownedCards) : undefined}
    />
  );
}
