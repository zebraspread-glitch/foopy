"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getGames, getGamesCached } from "@/app/lib/gameCache";
import PageHeader from "@/app/components/PageHeader";

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

type FinalsSlot = {
  seed?: number;
  team?: LadderTeam;
  label?: string;
  detail?: string;
};

type FinalsMatchup = {
  id: string;
  label: string;
  accent: string;
  left: FinalsSlot;
  right: FinalsSlot;
};

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

function finalsTeamBackground(team?: string) {
  const key = String(team ?? "").toLowerCase().trim();
  const map: Record<string, string> = {
    adelaide: "#002b5c",
    "brisbane lions": "#a50034",
    brisbane: "#a50034",
    carlton: "#031a35",
    collingwood: "#111217",
    essendon: "#111217",
    fremantle: "#4b1979",
    geelong: "#003b73",
    "geelong cats": "#003b73",
    "gold coast": "#ef4444",
    "gws giants": "#f97316",
    "greater western sydney": "#f97316",
    gws: "#f97316",
    hawthorn: "#f59e0b",
    melbourne: "#061a3c",
    "north melbourne": "#1d4ed8",
    "port adelaide": "#111217",
    richmond: "#ffd200",
    "st kilda": "#ed1b2f",
    sydney: "#ef4444",
    "west coast": "#003087",
    "western bulldogs": "#2563eb",
  };
  return map[key] ?? "#1e293b";
}

function seedSlot(ladder: LadderTeam[], seed: number): FinalsSlot {
  return { seed, team: ladder[seed - 1], label: ladder[seed - 1]?.team ?? `Seed ${seed}` };
}

function buildFinalsMatchups(ladder: LadderTeam[]): FinalsMatchup[] {
  return [
    {
      id: "qf-1-4",
      label: "Double chance",
      accent: "#fbbf24",
      left: seedSlot(ladder, 1),
      right: seedSlot(ladder, 4),
    },
    {
      id: "qf-2-3",
      label: "Double chance",
      accent: "#fbbf24",
      left: seedSlot(ladder, 2),
      right: seedSlot(ladder, 3),
    },
    {
      id: "wc-7-10",
      label: "Wildcard",
      accent: "#3b82f6",
      left: seedSlot(ladder, 7),
      right: seedSlot(ladder, 10),
    },
    {
      id: "wc-8-9",
      label: "Wildcard",
      accent: "#3b82f6",
      left: seedSlot(ladder, 8),
      right: seedSlot(ladder, 9),
    },
    {
      id: "ef-5-lowest",
      label: "Elimination final",
      accent: "#ffffff",
      left: seedSlot(ladder, 5),
      right: { label: "Lowest-ranked Wildcard winner", detail: "Wildcard winner" },
    },
    {
      id: "ef-6-highest",
      label: "Elimination final",
      accent: "#ffffff",
      left: seedSlot(ladder, 6),
      right: { label: "Highest-ranked Wildcard winner", detail: "Wildcard winner" },
    },
  ];
}

function FinalsTeamStrip({ slot }: { slot: FinalsSlot }) {
  const logo = slot.team ? TEAM_LOGOS[slot.team.team] : "";
  const seedText = slot.seed ? String(slot.seed) : "WC";
  const label = slot.team ? displayTeamName(slot.team.team) : slot.label ?? "Wildcard winner";
  const panelBg = slot.team
    ? finalsTeamBackground(slot.team.team)
    : "linear-gradient(135deg, #1d4ed8, #0f172a)";

  return (
    <div style={finalsStripRowStyle} className="finals-strip-row" title={label}>
      <span style={finalsSeedBlockStyle}>{seedText}</span>
      <span style={{ ...finalsTeamPanelStyle, background: panelBg }}>
        {logo ? (
          <img src={logo} alt="" style={finalsLogoStyle} />
        ) : (
          <span style={finalsPlaceholderStyle}>{slot.detail ?? "Wildcard winner"}</span>
        )}
      </span>
    </div>
  );
}

function FinalsStageBox({ label, matchup }: { label: string; matchup?: FinalsMatchup }) {
  const matchupText = matchup
    ? matchup.left.seed && matchup.right.seed
      ? `${matchup.left.seed} v ${matchup.right.seed}`
      : matchup.left.seed
      ? `${matchup.left.seed} v WC`
      : ""
    : "";

  return (
    <div style={finalsStageBoxStyle} className="finals-stage-box">
      <span style={finalsStageLabelStyle}>{label}</span>
      {matchupText && <span style={finalsStageSubStyle}>{matchupText}</span>}
    </div>
  );
}

function FinalsVerticalConnector({ height = 18 }: { height?: number }) {
  return <span style={{ ...finalsVerticalConnectorStyle, height }} aria-hidden="true" />;
}

function FinalsWildcardCard({ matchup }: { matchup?: FinalsMatchup }) {
  if (!matchup) return null;
  return (
    <div style={finalsWildcardCardStyle} className="finals-wildcard-card">
      <FinalsTeamStrip slot={matchup.left} />
      <FinalsTeamStrip slot={matchup.right} />
    </div>
  );
}

function FinalsMatchups({ matchups }: { matchups: FinalsMatchup[] }) {
  const matchupById = new Map(matchups.map((matchup) => [matchup.id, matchup]));
  const qf1 = matchupById.get("qf-1-4");
  const qf2 = matchupById.get("qf-2-3");
  const wc1 = matchupById.get("wc-7-10");
  const wc2 = matchupById.get("wc-8-9");
  const ef1 = matchupById.get("ef-5-lowest");
  const ef2 = matchupById.get("ef-6-highest");

  return (
    <section style={finalsMatchupsSectionStyle} className="finals-matchups">
      <div style={finalsHeaderStyle}>
        <span style={finalsTitleStyle}>Finals Picture</span>
      </div>

      <div style={finalsBracketPanelStyle} className="finals-bracket">
        <div style={finalsTopRowStyle}>
          <FinalsStageBox label="GF" />
        </div>

        <FinalsVerticalConnector height={18} />

        <div style={finalsTwoColumnRowStyle}>
          <FinalsStageBox label="PF1" />
          <FinalsStageBox label="PF2" />
        </div>

        <div style={finalsCrossConnectorStyle} aria-hidden="true">
          <span style={{ ...finalsCrossLineStyle, transform: "rotate(16deg)" }} />
          <span style={{ ...finalsCrossLineStyle, transform: "rotate(-16deg)" }} />
        </div>

        <div style={finalsTwoColumnRowStyle}>
          <FinalsStageBox label="SF1" />
          <FinalsStageBox label="SF2" />
        </div>

        <FinalsVerticalConnector height={18} />

        <div style={finalsFourColumnRowStyle} className="finals-stage-row-four">
          <FinalsStageBox label="QF1" matchup={qf1} />
          <FinalsStageBox label="EF1" matchup={ef1} />
          <FinalsStageBox label="EF2" matchup={ef2} />
          <FinalsStageBox label="QF2" matchup={qf2} />
        </div>

        <FinalsVerticalConnector height={16} />

        <div style={finalsAllCardsRowStyle} className="finals-wildcard-row">
          <FinalsWildcardCard matchup={qf1} />
          <FinalsWildcardCard matchup={wc1} />
          <FinalsWildcardCard matchup={wc2} />
          <FinalsWildcardCard matchup={qf2} />
        </div>
      </div>
    </section>
  );
}

function SkeletonRow({ i }: { i: number }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-1)" }}>
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
  const tabs: Tab[] = hasLiveGames ? ["league", "live"] : ["league"];

  useEffect(() => {
    if (!hasLiveGames && activeTab === "live") setActiveTab("league");
  }, [hasLiveGames, activeTab]);

  const shownLadder = activeTab === "live" ? liveLadder : ladder;

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

        .finals-team-name-mobile {
          display: none;
        }

        .finals-strip-row:last-child {
          border-bottom: 0 !important;
        }

        @media (max-width: 700px) {
          .ladder-wrap {
            padding: 14px 12px 0 !important;
            max-width: none !important;
          }

          .ladder-card {
            border-radius: 22px !important;
            background: var(--surface-1) !important;
            border: 1px solid var(--border-2) !important;
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
            background: var(--surface-1) !important;
            font-size: 11px !important;
            color: var(--text-2) !important;
            border-bottom: 1px solid var(--border-2) !important;
          }

          .ladder-row {
            height: 56px !important;
            background: var(--surface-1) !important;
            border-bottom: 1px solid var(--border-1) !important;
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
            color: var(--text-1) !important;
            font-size: 16px !important;
            font-weight: 950 !important;
          }

          .ladder-team-cell {
            padding: 0 4px !important;
            width: 110px !important;
            min-width: 110px !important;
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
            letter-spacing: -0.01em !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-overflow: clip !important;
            max-width: none !important;
          }

          .ladder-row {
            background-clip: padding-box !important;
          }

          .ladder-stat-cell {
            padding: 0 3px !important;
            font-size: 13px !important;
            font-weight: 950 !important;
            color: var(--text-1) !important;
          }

          .ladder-points-cell {
            padding: 0 9px 0 3px !important;
            font-size: 14px !important;
            color: var(--text-1) !important;
            font-weight: 950 !important;
          }

          .ladder-percent-cell {
            color: var(--text-1) !important;
          }


          .ladder-header {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          .finals-matchups {
            padding: 16px 12px 14px !important;
          }

          .finals-bracket {
            padding: 18px 10px 14px !important;
          }

          .finals-stage-row-four {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .finals-wildcard-row {
            grid-template-columns: 1fr !important;
            max-width: 260px !important;
          }

          .finals-team-name-full {
            display: none !important;
          }

          .finals-team-name-mobile {
            display: inline !important;
          }
        }
      `}</style>

      <PageHeader
        title="Ladder"
        right={
          <div style={tabsStyle}>
            {tabs.map((t) => (
              <button
                type="button"
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
        }
      />

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
                            borderBottom: "1px solid var(--border-1)",
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
                          <td style={{ ...tdCentreStyle, color: "var(--text-1)", fontWeight: 900, fontSize: 15 }} className="ladder-points-cell">
                            {team.points}
                          </td>
                          <td style={{ ...tdCentreStyle, color: "var(--text-1)" }} className="ladder-percent-cell">
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
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const tabsStyle: CSSProperties = {
  display: "flex",
  padding: 3,
  borderRadius: 999,
  background: "var(--surface-3)",
  border: "1px solid var(--border-2)",
  gap: 2,
};

const tabBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "7px 14px",
  background: "transparent",
  color: "var(--text-3)",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  letterSpacing: "0.01em",
};

const activeTabStyle: CSSProperties = {
  background: "var(--text-1)",
  color: "var(--bg)",
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
  border: "1px solid var(--border-2)",
  background: "var(--surface-1)",
  overflow: "hidden",
  overflowX: "auto",
};

const thStyle: CSSProperties = {
  padding: "12px",
  fontSize: 11,
  color: "var(--text-3)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "center",
  borderBottom: "1px solid var(--border-2)",
  background: "var(--bg)",
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
  background: "var(--surface-3)",
  display: "block",
};

const teamNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontFamily: '"Druk Wide", "Arial Black", Impact, sans-serif',
};

const legendStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  justifyContent: "center",
  flexWrap: "wrap",
  padding: "14px 16px",
  borderTop: "1px solid var(--border-1)",
  background: "var(--bg)",
};

const legendItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12,
  fontWeight: 800,
  color: "var(--text-2)",
};

const legendDotStyle: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
};

const finalsMatchupsSectionStyle: CSSProperties = {
  padding: "18px 16px 16px",
  borderTop: "1px solid var(--border-1)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.025), transparent)",
};

const finalsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const finalsTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 950,
  letterSpacing: "-0.02em",
  color: "var(--text-1)",
};

const finalsBracketPanelStyle: CSSProperties = {
  position: "relative",
  padding: "22px 18px 18px",
  borderRadius: 18,
  border: "1px solid rgba(214,194,138,0.22)",
  background: "radial-gradient(circle at 50% 0%, rgba(214,194,138,0.08), rgba(0,0,0,0) 42%), #060708",
  overflow: "hidden",
};

const finalsTopRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
};

const finalsTwoColumnRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 40,
  alignItems: "center",
  maxWidth: 420,
  margin: "0 auto",
};

const finalsFourColumnRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  alignItems: "center",
  marginTop: 4,
};

const finalsStageBoxStyle: CSSProperties = {
  minHeight: 58,
  borderRadius: 10,
  border: "2px solid #d6c28a",
  background: "#070914",
  color: "#f5e6b2",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const finalsStageLabelStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 1000,
  lineHeight: 1,
  letterSpacing: 0,
};

const finalsStageSubStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 950,
  color: "rgba(245,230,178,0.72)",
  lineHeight: 1,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const finalsVerticalConnectorStyle: CSSProperties = {
  display: "block",
  width: 2,
  margin: "0 auto",
  background: "#d6c28a",
  opacity: 0.8,
};

const finalsCrossConnectorStyle: CSSProperties = {
  position: "relative",
  height: 44,
  maxWidth: 300,
  margin: "-2px auto 0",
};

const finalsCrossLineStyle: CSSProperties = {
  position: "absolute",
  top: 20,
  left: "15%",
  width: "70%",
  height: 2,
  background: "#d6c28a",
  transformOrigin: "center",
  opacity: 0.82,
};

const finalsWildcardRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 40,
  maxWidth: 520,
  margin: "0 auto",
};

const finalsAllCardsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const finalsWildcardCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  minWidth: 0,
  width: "100%",
  overflow: "hidden",
  border: "2px solid #d6c28a",
  background: "#070914",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
};

const finalsStripRowStyle: CSSProperties = {
  height: 52,
  width: "100%",
  display: "grid",
  gridTemplateColumns: "46px minmax(0, 1fr)",
  borderBottom: "2px solid var(--bg)",
};

const finalsSeedBlockStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  background: "#070914",
  color: "#f8fafc",
  fontSize: 25,
  fontWeight: 1000,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const finalsTeamPanelStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  placeItems: "center",
  padding: "5px 14px",
  boxSizing: "border-box",
};

const finalsLogoStyle: CSSProperties = {
  width: 44,
  height: 44,
  objectFit: "contain",
  display: "block",
  filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
};

const finalsPlaceholderStyle: CSSProperties = {
  display: "block",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 950,
  color: "#ffffff",
  textTransform: "uppercase",
  letterSpacing: 0,
};

const errorStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "60px 24px",
  textAlign: "center",
  color: "var(--text-2)",
};

const retryBtnStyle: CSSProperties = {
  marginTop: 6,
  padding: "10px 24px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.15)",
  background: "transparent",
  color: "var(--text-1)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
