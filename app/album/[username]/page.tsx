"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { getPassLevel, PLAYER_PASS_LEVELS, TEAM_PASS_LEVELS, type PlayerPass, type TeamPass } from "@/app/lib/passes";
import PassLeaderboard from "@/app/components/PassLeaderboard";
import TeamPassLeaderboard from "@/app/components/TeamPassLeaderboard";

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";

interface UserCard {
  id: string;
  player_id: string;
  rarity: Rarity;
  rating: number;
  duplicate_count: number;
}

interface ProfileInfo {
  id: string;
  username: string | null;
  avatar_url: string | null;
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

  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTeam, setActiveTeam] = useState(TEAMS[0]);
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [view, setView] = useState<"album" | "passes">("album");
  const [playerPasses, setPlayerPasses] = useState<PlayerPass[]>([]);
  const [teamPass, setTeamPass] = useState<TeamPass | null>(null);
  const [leaderboardPlayerPass, setLeaderboardPlayerPass] = useState<PlayerPass | null>(null);
  const [leaderboardTeamPass,   setLeaderboardTeamPass]   = useState<TeamPass | null>(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetch(`/api/album/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setProfile(data.profile);
        setUserCards(data.cards);
        setPlayerPasses(data.playerPasses ?? []);
        setTeamPass(data.teamPass ?? null);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [username]);

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

  const displayName = profile?.username ? `@${profile.username}` : username;

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
                {playerPasses.length} player pass{playerPasses.length !== 1 ? "es" : ""}{teamPass ? " · 1 team pass" : ""}
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
                  {!loading && (
                    <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: active ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.2)" }}>
                      {unlocked}/{players.length}
                    </span>
                  )}
                </button>
              );
            })}
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
              return (
                <AlbumSlot
                  key={player.id}
                  player={player}
                  ownedCards={ownedCards}
                  onCardClick={(cards) => setSelectedCard({ player, cards })}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <PassesView
          playerPasses={playerPasses}
          teamPass={teamPass}
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

function PassesView({ playerPasses, teamPass, onPlayerPassClick, onTeamPassClick }: {
  playerPasses: PlayerPass[];
  teamPass: TeamPass | null;
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

  const hasAny = playerPasses.length > 0 || !!teamPass;

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

      {/* Team pass */}
      {teamPass && (() => {
        const level = getPassLevel(teamPass.xp ?? 0, TEAM_PASS_LEVELS);
        const logo  = TEAM_LOGOS[teamPass.team_name] ?? "/team-logos/default.png";
        return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Team Pass</div>
            <div onClick={() => onTeamPassClick(teamPass!)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, background: level.gradient, border: `1.5px solid ${level.color}44`, position: "relative", overflow: "hidden", cursor: "pointer" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)` }} />
              <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,0.3)" }}>
                <img src={logo} alt={teamPass.team_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>{teamPass.team_name}</div>
                  {teamPass.serial_number != null && <div style={{ fontSize: 13, fontWeight: 900, color: level.color }}>#{teamPass.serial_number}</div>}
                </div>
                <div style={{ fontSize: 11, color: level.color, fontWeight: 800, letterSpacing: "0.05em", marginBottom: 6 }}>{level.name.toUpperCase()} · {level.multiplier}×</div>
                <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${level.darkColor},${level.color})` }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>
                  {level.isMaxed ? "MAX" : `${teamPass.xp ?? 0} / ${level.nextXp} XP`}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
              return (
                <div key={pass.id} onClick={() => onPlayerPassClick(pass)} style={{
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  background: level.gradient, cursor: "pointer",
                  border: `1.5px solid ${level.color}55`,
                  boxShadow: `0 4px 24px ${level.color}22, 0 0 0 0.5px rgba(255,255,255,0.06)`,
                  aspectRatio: "3/4",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* shimmer */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  {/* level badge */}
                  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 4, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>
                    {level.name.toUpperCase()}
                  </div>
                  {/* year */}
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 4, fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>2026</div>
                  {/* photo */}
                  <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "rgba(0,0,0,0.2)" }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={pass.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
                    }
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#0a0a14"})` }} />
                  </div>
                  {/* footer */}
                  <div style={{ padding: "8px 10px 10px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{pass.player_name}</div>
                      {pass.serial_number != null && <div style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.04em", flexShrink: 0, marginLeft: 5 }}>#{pass.serial_number}</div>}
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.06em" }}>{level.name.toUpperCase()} · {level.multiplier}×</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{level.isMaxed ? "MAX" : `${pass.xp ?? 0}/${level.nextXp}`}</span>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${level.darkColor},${level.color})`, boxShadow: `0 0 6px ${level.color}80` }} />
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

// ── Album Card List Modal ─────────────────────────────────────────────────────

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

// ── Album Slot ────────────────────────────────────────────────────────────────

function AlbumSlot({ player, ownedCards, onCardClick }: {
  player: typeof CARD_PLAYERS[0];
  ownedCards: UserCard[] | null;
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
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />

        {unlocked && topCard && meta ? (
          <>
            <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>
              {topCard.rating}
            </div>

            {totalCopies > 1 && (
              <div className="ac-dup" style={{ background: "rgba(0,0,0,.75)", fontWeight: 900, color: "rgba(255,255,255,.6)" }}>
                ×{totalCopies}
              </div>
            )}

            <div style={{
              position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)",
              width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden",
              background: (TEAM_COLORS[player.team] ?? "#1e2438") + "33",
            }}>
              <img
                src={`/players/${player.folder}/${player.id}.png`}
                alt={player.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
              />
            </div>

            <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
              <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 10px ${meta.glow}` }}>
                {player.name}
              </div>
            </div>

            <div className="ac-logo" style={{ background: "rgba(0,0,0,.55)", border: "1.5px solid var(--border-3)" }}>
              <img src={player.teamLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>

            <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>
              2025
            </div>
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ fontSize: 14, opacity: 0.2 }}>🔒</div>
            <div className="ac-name" style={{ fontWeight: 800, color: "rgba(255,255,255,.2)", textAlign: "center", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
              {player.name}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
