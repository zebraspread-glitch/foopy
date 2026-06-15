"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getGames, getGamesCached } from "@/app/lib/gameCache";
import { playerImgUrl } from "@/app/lib/playerImage";
import type { PlayerRank } from "@/app/api/power-rankings/route";

/* ─── Types ──────────────────────────────────────────────── */

type Game = {
  id: number;
  round: number;
  hteam?: string;
  ateam?: string;
  hscore?: number | null;
  ascore?: number | null;
  complete?: number;
  is_final?: number;
  date?: string;
};

type Period = "r1" | "r3" | "r5" | "season";
type View   = "player" | "team";

type TeamRank = {
  team: string;
  powerScore: number;
  wins: number;
  losses: number;
  draws: number;
  avgMargin: number;
  played: number;
};

/* ─── Helpers ─────────────────────────────────────────────── */

function isCompleted(g: Game) {
  return (g.complete ?? 0) >= 100 || g.is_final === 1;
}

function displayTeamName(name: string) {
  if (name === "Greater Western Sydney" || name === "GWS Giants") return "GWS";
  if (name === "Brisbane Lions") return "Brisbane";
  if (name === "Geelong Cats") return "Geelong";
  return name;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toTeamSlug(name: string): string {
  const overrides: Record<string, string> = {
    "Greater Western Sydney": "gws", "GWS Giants": "gws",
    "Brisbane": "brisbanelions", "Geelong Cats": "geelong",
  };
  return overrides[name] ?? slugify(name);
}

function teamFolder(team: string): string {
  const map: Record<string, string> = {
    Adelaide: "crows", "Adelaide Crows": "crows",
    Brisbane: "lions", "Brisbane Lions": "lions",
    Carlton: "blues",
    Collingwood: "magpies",
    Essendon: "bombers",
    Fremantle: "dockers",
    Geelong: "cats", "Geelong Cats": "cats",
    "Gold Coast": "suns", "Gold Coast Suns": "suns",
    GWS: "giants", "GWS Giants": "giants", "Greater Western Sydney": "giants",
    Hawthorn: "hawks",
    Melbourne: "demons",
    "North Melbourne": "kangaroos",
    "Port Adelaide": "power",
    Richmond: "tigers",
    "St Kilda": "saints",
    Sydney: "swans",
    "West Coast": "eagles",
    "Western Bulldogs": "bulldogs",
  };
  return map[team] ?? slugify(team);
}

function playerImageUrl(name: string, team: string) {
  return playerImgUrl(name, team);
}

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Geelong Cats": "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  "Greater Western Sydney": "/team-logos/giants.png", "GWS Giants": "/team-logos/giants.png", GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png", "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", Brisbane: "#a50034", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#ef4444", Fremantle: "#7c3aed",
  Geelong: "#1e3a8a", "Geelong Cats": "#1e3a8a", "Gold Coast": "#ef4444",
  GWS: "#f97316", "GWS Giants": "#f97316", "Greater Western Sydney": "#f97316",
  Hawthorn: "#f59e0b", Melbourne: "#ef4444", "North Melbourne": "#3b82f6",
  "Port Adelaide": "#06b6d4", Richmond: "#facc15", "St Kilda": "#ef4444",
  Sydney: "#ef4444", "West Coast": "#003087", "Western Bulldogs": "#2563eb",
};

/* ─── Team ranking computation ────────────────────────────── */

function computeTeamRankings(games: Game[], period: Period): TeamRank[] {
  const completedGames = games.filter((g) => isCompleted(g) && g.hteam && g.ateam);

  let filtered: Game[];
  if (period === "season") {
    filtered = completedGames;
  } else {
    const latestRound = completedGames.reduce((max, g) => Math.max(max, g.round ?? 0), 0);
    const roundCount  = period === "r1" ? 1 : period === "r3" ? 3 : 5;
    const cutoffRound = latestRound - roundCount + 1;
    filtered = completedGames.filter((g) => (g.round ?? 0) >= cutoffRound);
  }
  if (!filtered.length) return [];

  type Rec = { wins: number; losses: number; draws: number; ptsFor: number; ptsAgainst: number };
  const recs = new Map<string, Rec>();
  const ensureRec = (t: string) => {
    if (!recs.has(t)) recs.set(t, { wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 });
    return recs.get(t)!;
  };

  for (const g of filtered) {
    const hs = g.hscore ?? 0, as = g.ascore ?? 0;
    const home = ensureRec(g.hteam!), away = ensureRec(g.ateam!);
    home.ptsFor += hs; home.ptsAgainst += as;
    away.ptsFor += as; away.ptsAgainst += hs;
    if (hs > as) { home.wins++; away.losses++; }
    else if (as > hs) { away.wins++; home.losses++; }
    else { home.draws++; away.draws++; }
  }

  const winPct = (t: string) => {
    const r = recs.get(t);
    if (!r) return 0.5;
    const p = r.wins + r.losses + r.draws;
    return p === 0 ? 0.5 : (r.wins + r.draws * 0.5) / p;
  };

  type Acc = { margins: number[]; opponentWinPcts: number[] };
  const acc = new Map<string, Acc>();
  const ensureAcc = (t: string) => { if (!acc.has(t)) acc.set(t, { margins: [], opponentWinPcts: [] }); return acc.get(t)!; };
  for (const g of filtered) {
    const margin = (g.hscore ?? 0) - (g.ascore ?? 0);
    ensureAcc(g.hteam!).margins.push(margin);
    ensureAcc(g.hteam!).opponentWinPcts.push(winPct(g.ateam!));
    ensureAcc(g.ateam!).margins.push(-margin);
    ensureAcc(g.ateam!).opponentWinPcts.push(winPct(g.hteam!));
  }

  type RawEntry = { team: string; played: number; wins: number; losses: number; draws: number; avgMargin: number; raw: number };
  const raw: RawEntry[] = [];

  for (const [team, { margins, opponentWinPcts }] of acc) {
    if (!margins.length) continue;
    const rec = recs.get(team) ?? { wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 };
    const played = rec.wins + rec.losses + rec.draws;
    const wp = played > 0 ? (rec.wins + rec.draws * 0.5) / played : 0;
    const avgOppWinPct = opponentWinPcts.reduce((a, b) => a + b, 0) / opponentWinPcts.length;
    const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
    const pctRatio = rec.ptsAgainst > 0 ? rec.ptsFor / rec.ptsAgainst : 1;

    const sosAdjWinPct = wp * (1 + (avgOppWinPct - 0.5) * 0.6);
    const winComponent    = sosAdjWinPct * 30;
    const marginComponent = Math.max(-12, Math.min(12, (avgMargin / 40) * 12));
    const pctComponent    = Math.max(-5,  Math.min(10, (pctRatio  - 1) * 15));

    raw.push({ team, played, wins: rec.wins, losses: rec.losses, draws: rec.draws,
      avgMargin: Number(avgMargin.toFixed(1)), raw: winComponent + marginComponent + pctComponent });
  }

  if (!raw.length) return [];

  // Best team = 100. Add a base offset so the worst team lands ~40–55 naturally.
  const BASE   = 50;
  const maxRaw = Math.max(...raw.map(r => r.raw));

  const result: TeamRank[] = raw.map(r => ({
    team: r.team, played: r.played, wins: r.wins, losses: r.losses, draws: r.draws,
    avgMargin: r.avgMargin,
    powerScore: Number(Math.max(1, ((r.raw + BASE) / (maxRaw + BASE)) * 100).toFixed(1)),
  }));

  return result.sort((a, b) => b.powerScore - a.powerScore);
}

/* ─── Player avatar component ─────────────────────────────── */

function PlayerAvatar({ name, team, size = 44 }: { name: string; team: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = playerImageUrl(name, team);
  const bg  = TEAM_COLORS[team] ?? "#1e293b";

  const initials = name.trim().split(/\s+/).filter(Boolean)
    .map((w, i, arr) => (i === 0 || i === arr.length - 1) ? w[0] : "")
    .filter(Boolean).join("").toUpperCase().slice(0, 2);

  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0, display: "inline-flex",
      alignItems: "center", justifyContent: "center",
      background: bg, fontWeight: 900, fontSize: size * 0.33,
      color: "var(--text-1)", letterSpacing: "-0.02em",
    }}>
      {!failed && src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
      ) : initials}
    </span>
  );
}

/* ─── Rank badge ──────────────────────────────────────────── */

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : "rgba(255,255,255,.35)";
  return <span style={{ fontWeight: 900, fontSize: 15, color, minWidth: 26, textAlign: "center", display: "inline-block" }}>{rank}</span>;
}

/* ─── Main page ──────────────────────────────────────────── */

export default function PowerRankingsPage() {
  const [view,   setView]   = useState<View>("player");
  const [period, setPeriod] = useState<Period>("r1");
  const [games,  setGames]  = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [playerData, setPlayerData] = useState<Record<Period, PlayerRank[]>>({ r1: [], r3: [], r5: [], season: [] });
  const [playersLoading, setPlayersLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    const cached = getGamesCached() as Game[] | null;
    if (cached?.length) { setGames(cached); setGamesLoading(false); }
    getGames().then((d) => { setGames(d as Game[]); setGamesLoading(false); }).catch(() => setGamesLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/power-rankings")
      .then((r) => r.json())
      .then((d) => { setPlayerData(d); setPlayersLoading(false); })
      .catch(() => setPlayersLoading(false));
  }, []);

  useEffect(() => { setVisibleCount(50); }, [period, view]);

  const teamRankings = useMemo(() => computeTeamRankings(games, period), [games, period]);
  const players = playerData[period] ?? [];
  const visiblePlayers = players.slice(0, visibleCount);

  const PERIODS: { key: Period; label: string }[] = [
    { key: "r1", label: "1 Round" },
    { key: "r3", label: "3 Rounds" },
    { key: "r5", label: "5 Rounds" },
    { key: "season", label: "Season" },
  ];

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        @media (max-width: 700px) {
          .pr-wrap { padding: 10px 10px 0 !important; }
          .pr-item { padding: 12px 14px !important; }
          .pr-name { font-size: 14px !important; }
          .pr-score { font-size: 22px !important; }
        }
      `}</style>

      {/* ── Sticky header ── */}
      <header style={headerStyle}>
        <span style={{ ...titleStyle, position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "none", whiteSpace: "nowrap" }}>Power Rankings</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          {/* Player / Team toggle */}
          <div style={toggleWrapStyle}>
            <button onClick={() => setView("player")} style={{ ...toggleBtnStyle, ...(view === "player" ? toggleActiveStyle : {}) }}>
              Player
            </button>
            <button onClick={() => setView("team")} style={{ ...toggleBtnStyle, ...(view === "team" ? toggleActiveStyle : {}) }}>
              Team
            </button>
          </div>
        </div>
      </header>

      {/* ── Period tabs ── */}
      <div style={periodBarStyle}>
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{ ...periodBtnStyle, ...(period === key ? periodActiveStyle : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={wrapStyle} className="pr-wrap">

        {/* ══════════ PLAYER VIEW ══════════ */}
        {view === "player" && (
          <div style={cardStyle}>
            {playersLoading ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonPlayerItem key={i} />)
            ) : players.length === 0 ? (
              <div style={emptyStyle}>No player data available</div>
            ) : (
              <>
                {visiblePlayers.map((p, i) => (
                  <PlayerItem key={`${p.name}-${p.team}`} player={p} rank={i + 1} period={period} />
                ))}
                {visibleCount < players.length && (
                  <button
                    onClick={() => setVisibleCount(c => c + 50)}
                    style={{
                      width: "100%", padding: "16px", border: "none", background: "transparent",
                      color: "#3b82f6", fontSize: 13, fontWeight: 800, cursor: "pointer",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Load more ({players.length - visibleCount} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════ TEAM VIEW ══════════ */}
        {view === "team" && (
          <div style={cardStyle}>
            {gamesLoading ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonTeamItem key={i} />)
            ) : teamRankings.length === 0 ? (
              <div style={emptyStyle}>No team data for this period</div>
            ) : (
              teamRankings.map((t, i) => (
                <TeamItem key={t.team} team={t} rank={i + 1} />
              ))
            )}
          </div>
        )}

      </div>
    </main>
  );
}

/* ─── Player list item ────────────────────────────────────── */

function PlayerItem({ player, rank, period }: { player: PlayerRank; rank: number; period: Period }) {
  const router = useRouter();
  const scoreLabel = player.totalFoopy.toFixed(1);

  return (
    <div className="pr-item" style={{ ...itemStyle, cursor: player.id ? "pointer" : "default" }}
      onClick={() => player.id && router.push(`/player/${player.id}`)}>
      <div style={{ width: 38, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RankBadge rank={rank} />
      </div>
      <PlayerAvatar name={player.name} team={player.team} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="pr-name">
          {player.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 2 }}>
          {player.team} · {player.games} GP
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 20, color: "var(--text-1)", letterSpacing: "-0.03em", lineHeight: 1 }} className="pr-score">
          {scoreLabel}
        </div>
      </div>
    </div>
  );
}

/* ─── Team list item ──────────────────────────────────────── */

function TeamItem({ team, rank }: { team: TeamRank; rank: number }) {
  const router = useRouter();
  const logo = TEAM_LOGOS[team.team];
  const scoreColor = "#fff";

  return (
    <div className="pr-item" style={{ ...itemStyle, cursor: "pointer" }} onClick={() => router.push(`/team/${toTeamSlug(team.team)}`)}>
      <div style={{ width: 38, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RankBadge rank={rank} />
      </div>
      {logo ? (
        <img src={logo} alt={team.team} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: "50%", flexShrink: 0 }} />
      ) : (
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#1e293b", display: "block", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap" }} className="pr-name">
          {displayTeamName(team.team)}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 20, color: scoreColor, letterSpacing: "-0.03em", lineHeight: 1 }} className="pr-score">
          {team.powerScore.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

/* ─── Skeletons ───────────────────────────────────────────── */

function SkeletonPlayerItem() {
  return (
    <div style={{ ...itemStyle, gap: 14 }}>
      <div className="skeleton" style={{ width: 38, height: 16, borderRadius: 6 }} />
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton skeleton-line" style={{ width: 130, marginBottom: 8 }} />
        <div className="skeleton skeleton-line" style={{ width: 80 }} />
      </div>
      <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
    </div>
  );
}

function SkeletonTeamItem() {
  return (
    <div style={{ ...itemStyle, gap: 14 }}>
      <div className="skeleton" style={{ width: 38, height: 16, borderRadius: 6 }} />
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton skeleton-line" style={{ width: 110, marginBottom: 8 }} />
        <div className="skeleton skeleton-line" style={{ width: 90 }} />
      </div>
      <div className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  height: "calc(56px + env(safe-area-inset-top))",
  padding: "env(safe-area-inset-top) 16px 0 58px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
};

const titleStyle: CSSProperties = {
  fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em",
};

const toggleWrapStyle: CSSProperties = {
  display: "flex", padding: 3, borderRadius: 999,
  background: "var(--surface-3)", border: "1px solid var(--border-2)", gap: 2,
};

const toggleBtnStyle: CSSProperties = {
  border: "none", borderRadius: 999, padding: "7px 14px",
  background: "transparent", color: "var(--text-3)",
  fontSize: 12, fontWeight: 900, cursor: "pointer",
  letterSpacing: "0.01em", transition: "background 0.15s, color 0.15s",
};

const toggleActiveStyle: CSSProperties = { background: "var(--text-1)", color: "var(--bg)" };

const periodBarStyle: CSSProperties = {
  position: "sticky",
  top: "calc(56px + env(safe-area-inset-top))",
  zIndex: 49,
  display: "flex",
  gap: 0,
  background: "rgba(0,0,0,0.88)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "0.5px solid var(--border-1)",
  padding: "0 16px",
};

const periodBtnStyle: CSSProperties = {
  border: "none", background: "transparent",
  color: "var(--text-3)", fontWeight: 800, fontSize: 13,
  padding: "13px 18px 11px", cursor: "pointer",
  letterSpacing: "0.01em", borderBottom: "2px solid transparent",
  transition: "color 0.15s, border-color 0.15s",
};

const periodActiveStyle: CSSProperties = {
  color: "var(--text-1)", borderBottom: "2px solid #fff",
};

const wrapStyle: CSSProperties = {
  maxWidth: 640, margin: "0 auto", padding: "16px 14px 0",
};

const cardStyle: CSSProperties = {
  borderRadius: 18, border: "1px solid var(--border-2)",
  background: "var(--bg)", overflow: "hidden",
};

const itemStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-1)",
};

const emptyStyle: CSSProperties = {
  padding: "48px 24px", textAlign: "center",
  color: "var(--text-3)", fontSize: 14, fontWeight: 700,
};

const footerNoteStyle: CSSProperties = {
  padding: "12px 18px",
  fontSize: 11, color: "var(--text-4)", fontWeight: 700,
  textAlign: "center", letterSpacing: "0.02em",
};
