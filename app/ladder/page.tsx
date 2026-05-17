"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getGames, getGamesCached } from "@/app/lib/gameCache";

function toTeamSlug(name: string): string {
  const overrides: Record<string, string> = {
    "Greater Western Sydney": "gws", "GWS Giants": "gws",
    "Brisbane": "brisbanelions", "Geelong Cats": "geelong",
  };
  return overrides[name] ?? name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Game = {
  id: number;
  round: number;
  hteam?: string;
  ateam?: string;
  hscore?: number | null;
  ascore?: number | null;
  complete?: number;
  is_final?: number;
};

type LadderTeam = {
  team: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  for: number;
  against: number;
  percentage: number;
};

type Tab = "league" | "finals" | "live";

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png",
  "Geelong Cats": "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  "Greater Western Sydney": "/team-logos/giants.png",
  "GWS Giants": "/team-logos/giants.png",
  GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

function isCompleted(g: Game) {
  return (g.complete ?? 0) >= 100 || g.is_final === 1;
}

function displayTeamName(name: string) {
  if (name === "Greater Western Sydney" || name === "GWS Giants") return "GWS";
  if (name === "Brisbane Lions") return "Brisbane";
  if (name === "Geelong Cats") return "Geelong";
  return name;
}

function displayTeamAbbrev(name: string) {
  const map: Record<string, string> = {
    Adelaide: "ADE",
    "Brisbane Lions": "BRI",
    Brisbane: "BRI",
    Carlton: "CAR",
    Collingwood: "COL",
    Essendon: "ESS",
    Fremantle: "FRE",
    Geelong: "GEE",
    "Geelong Cats": "GEE",
    "Gold Coast": "GC",
    "Greater Western Sydney": "GWS",
    "GWS Giants": "GWS",
    GWS: "GWS",
    Hawthorn: "HAW",
    Melbourne: "MEL",
    "North Melbourne": "NM",
    "Port Adelaide": "PA",
    Richmond: "RIC",
    "St Kilda": "STK",
    Sydney: "SYD",
    "West Coast": "WC",
    "Western Bulldogs": "WB",
  };

  return map[name] ?? displayTeamName(name).slice(0, 3).toUpperCase();
}

function makeLadder(games: Game[]): LadderTeam[] {
  const teams: Record<string, LadderTeam> = {};

  function ensure(name: string) {
    if (!teams[name]) {
      teams[name] = {
        team: name,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        for: 0,
        against: 0,
        percentage: 0,
      };
    }
    return teams[name];
  }

  games.forEach((g) => {
    if (!isCompleted(g) || !g.hteam || !g.ateam) return;

    const hs = g.hscore ?? 0;
    const as = g.ascore ?? 0;
    const home = ensure(g.hteam);
    const away = ensure(g.ateam);

    home.played += 1;
    away.played += 1;
    home.for += hs;
    home.against += as;
    away.for += as;
    away.against += hs;

    if (hs > as) {
      home.wins += 1;
      home.points += 4;
      away.losses += 1;
    } else if (as > hs) {
      away.wins += 1;
      away.points += 4;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 2;
      away.points += 2;
    }
  });

  return Object.values(teams)
    .map((t) => ({ ...t, percentage: t.against > 0 ? (t.for / t.against) * 100 : 0 }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : b.percentage - a.percentage));
}

function isLiveGame(g: Game) {
  return (g.complete ?? 0) > 0 && !isCompleted(g);
}

function makeLiveLadder(games: Game[]): LadderTeam[] {
  const teams: Record<string, LadderTeam> = {};

  function ensure(name: string) {
    if (!teams[name]) {
      teams[name] = { team: name, played: 0, wins: 0, losses: 0, draws: 0, points: 0, for: 0, against: 0, percentage: 0 };
    }
    return teams[name];
  }

  // Process all completed games first
  games.filter(isCompleted).forEach((g) => {
    if (!g.hteam || !g.ateam) return;
    const hs = g.hscore ?? 0;
    const as = g.ascore ?? 0;
    const home = ensure(g.hteam);
    const away = ensure(g.ateam);
    home.played++; away.played++;
    home.for += hs; home.against += as;
    away.for += as; away.against += hs;
    if (hs > as) { home.wins++; home.points += 4; away.losses++; }
    else if (as > hs) { away.wins++; away.points += 4; home.losses++; }
    else { home.draws++; away.draws++; home.points += 2; away.points += 2; }
  });

  // Provisionally apply current live game scores
  games.filter(isLiveGame).forEach((g) => {
    if (!g.hteam || !g.ateam) return;
    const hs = g.hscore ?? 0;
    const as = g.ascore ?? 0;
    const home = ensure(g.hteam);
    const away = ensure(g.ateam);
    home.played++; away.played++;
    home.for += hs; home.against += as;
    away.for += as; away.against += hs;
    if (hs > as) { home.wins++; home.points += 4; away.losses++; }
    else if (as > hs) { away.wins++; away.points += 4; home.losses++; }
    else { home.draws++; away.draws++; home.points += 2; away.points += 2; }
  });

  return Object.values(teams)
    .map((t) => ({ ...t, percentage: t.against > 0 ? (t.for / t.against) * 100 : 0 }))
    .sort((a, b) => b.points !== a.points ? b.points - a.points : b.percentage - a.percentage);
}

function sideColour(index: number) {
  if (index < 4) return "#fbbf24"; // Gold: Double Chance
  if (index < 6) return "#ffffff"; // White
  if (index < 10) return "#3b82f6"; // Blue: Wildcard
  return "transparent";
}

function SkeletonRow({ i }: { i: number }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <td style={{ padding: "14px 12px", textAlign: "center", width: 32 }}>
        <div className="skeleton skeleton-line" style={{ width: 14, margin: "0 auto" }} />
      </td>
      <td style={{ padding: "14px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
          <div className="skeleton skeleton-line" style={{ width: `${55 + (i % 4) * 18}px` }} />
        </div>
      </td>
      {[40, 52, 40, 52].map((w, j) => (
        <td key={j} style={{ padding: "14px 12px", textAlign: "center" }}>
          <div className="skeleton skeleton-line" style={{ width: w, margin: "0 auto" }} />
        </td>
      ))}
    </tr>
  );
}

export default function LadderPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("league");

  useEffect(() => {
    const cached = getGamesCached() as Game[] | null;
    if (cached && cached.length > 0) {
      setGames(cached);
      setLoading(false);
    }

    getGames()
      .then((data) => {
        setGames(data as Game[]);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const ladder = useMemo(() => makeLadder(games), [games]);
  const liveLadder = useMemo(() => makeLiveLadder(games), [games]);
  const liveTeams = useMemo(() => new Set(
    games.filter(isLiveGame).flatMap(g => [g.hteam, g.ateam].filter(Boolean) as string[])
  ), [games]);
  const hasLiveGames = liveTeams.size > 0;

  const shownLadder =
    activeTab === "finals" ? ladder.slice(0, 10) :
    activeTab === "live"   ? liveLadder :
    ladder;

  // Poll quickly when on the live tab so standings stay current
  useEffect(() => {
    if (activeTab !== "live") return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      getGames().then(data => setGames(data as Game[])).catch(() => {});
    }, 5_000);
    return () => clearInterval(timer);
  }, [activeTab]);

  function retry() {
    setError(false);
    setLoading(true);
    getGames()
      .then((data) => setGames(data as Game[]))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .ladder-team-name-mobile {
          display: none;
        }

        @media (max-width: 700px) {
          .ladder-wrap {
            padding: 14px 12px 0 !important;
            max-width: none !important;
          }

          .ladder-card {
            border-radius: 22px !important;
            background: #1b1b1b !important;
            border: 1px solid rgba(255, 255, 255, 0.11) !important;
            overflow-x: hidden !important;
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.32) !important;
          }

          .ladder-table {
            min-width: 0 !important;
            table-layout: fixed !important;
          }

          .ladder-table th,
          .ladder-table td {
            box-sizing: border-box;
          }

          .ladder-th {
            height: 48px !important;
            padding: 10px 4px !important;
            background: #1b1b1b !important;
            font-size: 11px !important;
            color: rgba(255, 255, 255, 0.76) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.13) !important;
          }

          .ladder-row {
            height: 56px !important;
            background: #1b1b1b !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.09) !important;
            position: relative;
          }

          .ladder-rank-cell {
            width: 38px !important;
            padding: 0 0 0 8px !important;
          }

          .ladder-rank-pill {
            width: auto !important;
            height: auto !important;
            background: transparent !important;
            color: #fff !important;
            font-size: 16px !important;
            font-weight: 950 !important;
          }

          .ladder-team-cell {
            padding: 0 4px !important;
            width: 90px !important;
            min-width: 90px !important;
          }

          .ladder-team-inner {
            gap: 8px !important;
          }

          .ladder-logo-wrap {
  width: 30px !important;
  height: 30px !important;
  border-radius: 999px !important;
  overflow: hidden !important;  
  background: none !important;  
  border: none !important;       
  display: block !important;
}

          .ladder-logo {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  display: block !important;
}

          .ladder-team-name {
            font-size: 15px !important;
            max-width: 105px !important;
          }

          .ladder-team-name-full {
            display: none !important;
          }

          .ladder-team-name-mobile {
            display: inline !important;
            font-size: 13px !important;
            font-weight: 950 !important;
            letter-spacing: 0.02em !important;
            white-space: nowrap !important;
          }

          .ladder-row {
            background-clip: padding-box !important;
          }

          .ladder-stat-cell {
            padding: 0 3px !important;
            font-size: 13px !important;
            font-weight: 950 !important;
            color: #ffffff !important;
          }

          .ladder-points-cell {
            padding: 0 9px 0 3px !important;
            font-size: 14px !important;
            color: #fff !important;
            font-weight: 950 !important;
          }

          .ladder-percent-cell {
            color: #ffffff !important;
          }


          .ladder-header {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
        }
      `}</style>

      <header style={headerStyle} className="ladder-header">
        <span style={titleStyle}>Ladder</span>
        <div style={tabsStyle}>
          {(["league", "finals", "live"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ ...tabBtnStyle, ...(activeTab === t ? (t === "live" ? activeTabLiveStyle : activeTabStyle) : {}) }}
            >
              {t === "live" ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: hasLiveGames ? "#22c55e" : "#475569",
                    boxShadow: hasLiveGames ? "0 0 0 2px rgba(34,197,94,0.3)" : "none",
                    animation: hasLiveGames ? "livePulse 1.8s ease-in-out infinite" : "none",
                  }} />
                  Live
                </span>
              ) : t === "league" ? "League" : "Finals"}
            </button>
          ))}
        </div>
      </header>

      <div style={wrapStyle} className="ladder-wrap">
        {error && (
          <div style={errorStyle}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Couldn't load ladder</div>
            <button onClick={retry} style={retryBtnStyle}>
              Try again
            </button>
          </div>
        )}

        {!error && (
          <div style={cardStyle} className="ladder-card">
            <table style={{ width: "100%", borderCollapse: "collapse" }} className="ladder-table">
              <colgroup>
                <col style={{ width: "52px" }} />
                <col />
                <col style={{ width: "54px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "74px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 52 }} className="ladder-th">#</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="ladder-th">Team</th>
                  <th style={thStyle} className="ladder-th">P</th>
                  <th style={thStyle} className="ladder-th">W-L</th>
                  <th style={thStyle} className="ladder-th">PTS</th>
                  <th style={thStyle} className="ladder-th">%</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 18 }).map((_, i) => <SkeletonRow key={i} i={i} />)
                  : shownLadder.map((team, i) => {
                      const logo = TEAM_LOGOS[team.team];
                      const colour = sideColour(i);
                      const stripe = i % 2 === 1 ? "rgba(255,255,255,.018)" : "transparent";
                      const teamIsLive = activeTab === "live" && liveTeams.has(team.team);

                      return (
                        <tr
                          key={team.team}
                          className="ladder-row"
                          onClick={() => router.push(`/team/${toTeamSlug(team.team)}`)}
                          style={{
                            background: stripe,
                            borderBottom: "1px solid rgba(255,255,255,.05)",
                            borderLeft: colour !== "transparent" ? `5px solid ${colour}` : "5px solid transparent",
                            cursor: "pointer",
                          }}
                        >
                          <td style={tdCentreStyle} className="ladder-rank-cell">
                            <span style={rankPillStyle} className="ladder-rank-pill">
                              {i + 1}
                            </span>
                          </td>

                          <td style={{ padding: "13px 12px" }} className="ladder-team-cell">
                            <div style={teamInnerStyle} className="ladder-team-inner">
                              <span style={logoWrapStyle} className="ladder-logo-wrap">
                                {logo ? (
                                  <img
  src={logo}
  alt={team.team}
  style={{
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "50%",
    display: "block",
  }}
  className="ladder-logo"
/>
                                ) : (
                                  <span style={logoFallbackStyle} />
                                )}
                              </span>
                              <span style={{ ...teamNameStyle, color: teamIsLive ? "#4ade80" : undefined }} className="ladder-team-name ladder-team-name-full">
                                {displayTeamName(team.team)}
                              </span>
                              <span style={{ ...teamNameStyle, color: teamIsLive ? "#4ade80" : undefined }} className="ladder-team-name ladder-team-name-mobile">
                                {displayTeamAbbrev(team.team)}
                              </span>
                              {teamIsLive && (
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0, animation: "livePulse 1.8s ease-in-out infinite" }} />
                              )}
                            </div>
                          </td>

                          <td style={tdCentreStyle} className="ladder-stat-cell">{team.played}</td>
                          <td style={tdCentreStyle} className="ladder-stat-cell">
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>
                              {team.wins}-{team.losses}{team.draws > 0 ? `-${team.draws}` : ""}
                            </span>
                          </td>
                          <td style={{ ...tdCentreStyle, color: "#ffffff", fontWeight: 900, fontSize: 15 }} className="ladder-points-cell">
                            {team.points}
                          </td>
                          <td style={{ ...tdCentreStyle, color: "#ffffff" }} className="ladder-percent-cell">
                            {team.percentage.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>

            {!loading && (
              <div style={legendStyle}>
                {activeTab === "live" ? (
                  <span style={{ ...legendItemStyle, color: "#4ade80" }}>
                    <span style={{ ...legendDotStyle, background: "#22c55e", animation: "livePulse 1.8s ease-in-out infinite" }} />
                    Provisional — includes live game scores
                  </span>
                ) : (
                  <>
                    <span style={legendItemStyle}>
                      <span style={{ ...legendDotStyle, background: "#fbbf24" }} /> Gold = Double Chance
                    </span>
                    <span style={legendItemStyle}>
                      <span style={{ ...legendDotStyle, background: "#3b82f6" }} /> Blue = Wildcard
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#14141e",
  color: "#fff",
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
  background: "rgba(24,24,31,0.96)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid rgba(255,255,255,.08)",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const tabsStyle: CSSProperties = {
  display: "flex",
  padding: 3,
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.1)",
  gap: 2,
};

const tabBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "7px 14px",
  background: "transparent",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  letterSpacing: "0.01em",
};

const activeTabStyle: CSSProperties = {
  background: "white",
  color: "#14141e",
};

const activeTabLiveStyle: CSSProperties = {
  background: "#166534",
  color: "#4ade80",
  border: "1px solid rgba(74,222,128,0.3)",
};

const wrapStyle: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "16px 14px 0",
};

const cardStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.09)",
  background: "#070707",
  overflow: "hidden",
  overflowX: "auto",
};

const thStyle: CSSProperties = {
  padding: "12px",
  fontSize: 11,
  color: "#475569",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "center",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "#050505",
};

const tdCentreStyle: CSSProperties = {
  padding: "13px 12px",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const rankPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: "50%",
  fontSize: 12,
  fontWeight: 900,
  background: "transparent",
  color: "rgba(255,255,255,.85)",
};

const teamInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const logoWrapStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  overflow: "hidden",
  display: "block",
  flexShrink: 0,
};

const logoStyle: CSSProperties = {
  width: 28,
  height: 28,
  objectFit: "contain",
  flexShrink: 0,
};

const logoFallbackStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "#272731",
  display: "block",
};

const teamNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const legendStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  justifyContent: "center",
  flexWrap: "wrap",
  padding: "14px 16px",
  borderTop: "1px solid rgba(255,255,255,.06)",
  background: "#050505",
};

const legendItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12,
  fontWeight: 800,
  color: "#94a3b8",
};

const legendDotStyle: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
};

const errorStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "60px 24px",
  textAlign: "center",
  color: "#94a3b8",
};

const retryBtnStyle: CSSProperties = {
  marginTop: 6,
  padding: "10px 24px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.15)",
  background: "transparent",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
