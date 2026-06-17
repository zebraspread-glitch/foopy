"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import teamStatsData from "@/app/data/team-stats.json";
import PageHeader from "@/app/components/PageHeader";

type TeamBlock = {
  team?: { id?: number | string };
  statistics?: {
    disposals?: {
      disposals?: number;
      kicks?: number;
      handballs?: number;
      free_kicks?: number;
    };
    stoppages?: {
      hitouts?: number;
      clearances?: number;
    };
    marks?: number;
    scoring?: {
      goals?: number;
      assists?: number;
      behinds?: number;
    };
    defence?: {
      tackles?: number;
    };
  };
};

type TeamStatGame = {
  gameId: number;
  date?: string;
  teams?: TeamBlock[];
  savedAt?: string;
};

type TeamTotals = {
  id: number;
  name: string;
  games: number;
  disposals: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  clearances: number;
  hitouts: number;
  goals: number;
  behinds: number;
  assists: number;
  freeKicks: number;
};

type StatKey =
  | "disposals"
  | "goals"
  | "kicks"
  | "handballs"
  | "marks"
  | "tackles"
  | "clearances"
  | "hitouts"
  | "assists"
  | "freeKicks";

const TEAM_NAMES: Record<number, string> = {
  1: "Adelaide",
  2: "Brisbane Lions",
  3: "Carlton",
  4: "Collingwood",
  5: "Essendon",
  6: "Fremantle",
  7: "Geelong",
  8: "Hawthorn",
  9: "Melbourne",
  10: "North Melbourne",
  11: "Port Adelaide",
  12: "Richmond",
  13: "St Kilda",
  14: "Sydney",
  15: "West Coast",
  16: "Western Bulldogs",
  17: "Gold Coast",
  18: "GWS",
};

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png",
  Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
  "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c",
  "Brisbane Lions": "#7a003c",
  Carlton: "#031a35",
  Collingwood: "#777777",
  Essendon: "#cc1020",
  Fremantle: "#4b1979",
  Geelong: "#003b73",
  Hawthorn: "#6b3310",
  Melbourne: "#031b4e",
  "North Melbourne": "#0055a4",
  "Port Adelaide": "#007b8a",
  Richmond: "#c8a800",
  "St Kilda": "#cc1122",
  Sydney: "#cc1122",
  "West Coast": "#003087",
  "Western Bulldogs": "#1a5fd4",
  "Gold Coast": "#e8281a",
  GWS: "#f15a22",
};

const STAT_CATEGORIES: { key: StatKey; label: string; sub: string }[] = [
  { key: "disposals", label: "Disposals", sub: "ball use" },
  { key: "goals", label: "Goals", sub: "scoring" },
  { key: "kicks", label: "Kicks", sub: "ball use" },
  { key: "handballs", label: "Handballs", sub: "ball use" },
  { key: "marks", label: "Marks", sub: "possession" },
  { key: "tackles", label: "Tackles", sub: "pressure" },
  { key: "clearances", label: "Clearances", sub: "stoppage" },
  { key: "hitouts", label: "Hitouts", sub: "ruck" },
  { key: "assists", label: "Assists", sub: "scoring" },
  { key: "freeKicks", label: "Free Kicks", sub: "discipline" },
];

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function teamSlug(name: string) {
  const overrides: Record<string, string> = {
    "Brisbane Lions": "brisbanelions",
    "North Melbourne": "northmelbourne",
    "Port Adelaide": "portadelaide",
    "St Kilda": "stkilda",
    "West Coast": "westcoast",
    "Western Bulldogs": "westernbulldogs",
    "Gold Coast": "goldcoast",
  };
  return overrides[name] ?? name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatValue(value: number, mode: "avg" | "total") {
  return mode === "avg" ? value.toFixed(1) : Math.round(value).toString();
}


function getStatValue(team: TeamTotals, key: StatKey, mode: "avg" | "total") {
  const total = team[key];
  return mode === "avg" ? total / Math.max(1, team.games) : total;
}

function aggregateTeamStatsFromData(data: Record<string, TeamStatGame>): TeamTotals[] {
  const totals: Record<number, TeamTotals> = {};
  for (const game of Object.values(data)) {
    for (const block of game.teams ?? []) {
      const id = num(block.team?.id);
      const name = TEAM_NAMES[id];
      if (!id || !name) continue;
      const stats = block.statistics ?? {};
      if (!totals[id]) {
        totals[id] = { id, name, games: 0, disposals: 0, kicks: 0, handballs: 0, marks: 0, tackles: 0, clearances: 0, hitouts: 0, goals: 0, behinds: 0, assists: 0, freeKicks: 0 };
      }
      totals[id].games += 1;
      totals[id].disposals += num(stats.disposals?.disposals);
      totals[id].kicks += num(stats.disposals?.kicks);
      totals[id].handballs += num(stats.disposals?.handballs);
      totals[id].freeKicks += num(stats.disposals?.free_kicks);
      totals[id].marks += num(stats.marks);
      totals[id].tackles += num(stats.defence?.tackles);
      totals[id].clearances += num(stats.stoppages?.clearances);
      totals[id].hitouts += num(stats.stoppages?.hitouts);
      totals[id].goals += num(stats.scoring?.goals);
      totals[id].behinds += num(stats.scoring?.behinds);
      totals[id].assists += num(stats.scoring?.assists);
    }
  }
  return Object.values(totals);
}

export default function TeamStatsPage() {
  const router = useRouter();
  const [cat, setCat] = useState<StatKey>("disposals");
  const [mode, setMode] = useState<"avg" | "total">("avg");
  const [liveData, setLiveData] = useState<Record<string, TeamStatGame> | null>(null);

  useEffect(() => {
    fetch("/api/team-season-stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLiveData(data); })
      .catch(() => {});
  }, []);

  const teams = useMemo(() => {
    const data = liveData ?? (teamStatsData as Record<string, TeamStatGame>);
    return aggregateTeamStatsFromData(data);
  }, [liveData]);
  const sorted = useMemo(() => {
    return [...teams].sort((a, b) => getStatValue(b, cat, mode) - getStatValue(a, cat, mode));
  }, [teams, cat, mode]);
  const topValue = sorted[0] ? getStatValue(sorted[0], cat, mode) : 1;
  const updatedAt = useMemo(() => {
    const saved = Object.values(teamStatsData as Record<string, TeamStatGame>)
      .map((game) => game.savedAt)
      .filter(Boolean) as string[];
    if (!saved.length) return null;
    return new Date(Math.max(...saved.map((date) => +new Date(date))));
  }, []);

  return (
    <>
      <style>{`
        .ts-btn { -webkit-tap-highlight-color: transparent; }
        .ts-btn:active { opacity: .65; }
        .ts-row { transition: background .12s; }
        .ts-row:active { background: var(--border-1) !important; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <main style={pageStyle}>
        <PageHeader
          title="Team Stats"
          subtitle="AFL 2026"
          right={
            <div style={toggleStyle}>
              {(["avg", "total"] as const).map((item) => (
                <button
                  key={item}
                  className="ts-btn"
                  onClick={() => setMode(item)}
                  style={{
                    ...toggleButtonStyle,
                    background: mode === item ? "var(--border-3)" : "transparent",
                    color: mode === item ? "#fff" : "#515151",
                  }}
                >
                  {item === "avg" ? "Avg" : "Total"}
                </button>
              ))}
            </div>
          }
        />

        <div style={tabsStyle}>
          {STAT_CATEGORIES.map((item) => {
            const active = item.key === cat;
            return (
              <button
                key={item.key}
                className="ts-btn"
                onClick={() => setCat(item.key)}
                style={{
                  ...tabStyle,
                  borderBottomColor: active ? "#fff" : "transparent",
                  color: active ? "#fff" : "#3d3d3d",
                  fontWeight: active ? 800 : 600,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div style={contentStyle}>
          {sorted.length === 0 ? (
            <div style={emptyStyle}>No team stats available yet.</div>
          ) : (
            <div>
              {sorted.map((team, index) => {
                const value = getStatValue(team, cat, mode);
                const color = TEAM_COLORS[team.name] ?? "#334155";
                const logo = TEAM_LOGOS[team.name];
                const pct = topValue > 0 ? Math.max(5, (value / topValue) * 100) : 0;
                return (
                  <button
                    key={team.id}
                    className="ts-row"
                    onClick={() => router.push(`/team/${teamSlug(team.name)}`)}
                    style={rowStyle}
                  >
                    <div style={rankStyle}>{index + 1}</div>
                    <div style={{ ...logoWrapStyle, background: `${color}22`, borderColor: `${color}55` }}>
                      {logo && <img src={logo} alt="" style={logoStyle} />}
                    </div>
                    <div style={teamBodyStyle}>
                      <div style={teamLineStyle}>
                        <span style={teamNameStyle}>{team.name}</span>
                        <span style={gamesStyle}>{team.games} games</span>
                      </div>
                      <div style={barTrackStyle}>
                        <div style={{ ...barFillStyle, width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                    <div style={valueStyle}>{formatValue(value, mode)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {updatedAt && (
            <div style={updatedStyle}>
              Updated {updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const toggleStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "var(--surface-2)",
  border: "1px solid var(--border-1)",
  borderRadius: 10,
  padding: 2,
  flexShrink: 0,
};

const toggleButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const tabsStyle: React.CSSProperties = {
  overflowX: "auto",
  scrollbarWidth: "none",
  display: "flex",
  background: "var(--bottom-nav-bg)",
  borderBottom: "1px solid var(--border-1)",
  position: "sticky",
  top: "calc(52px + env(safe-area-inset-top))",
  zIndex: 49,
};

const tabStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: "12px 15px 10px",
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const contentStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
};

const rowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 18px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid var(--border-1)",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const rankStyle: React.CSSProperties = {
  width: 24,
  flexShrink: 0,
  textAlign: "right",
  color: "#4a4a4a",
  fontSize: 12,
  fontWeight: 900,
};

const logoWrapStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  overflow: "hidden",
  flexShrink: 0,
  border: "1px solid var(--border-2)",
};

const logoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const teamBodyStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const teamLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 7,
};

const teamNameStyle: React.CSSProperties = {
  color: "#e8e8e8",
  fontSize: 14,
  fontWeight: 850,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const gamesStyle: React.CSSProperties = {
  color: "#3d3d3d",
  fontSize: 10,
  fontWeight: 800,
  flexShrink: 0,
};

const barTrackStyle: React.CSSProperties = {
  height: 3,
  borderRadius: 3,
  background: "var(--surface-3)",
  overflow: "hidden",
};

const barFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 3,
  opacity: .9,
};

const valueStyle: React.CSSProperties = {
  minWidth: 58,
  textAlign: "right",
  color: "var(--text-1)",
  fontSize: 21,
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const emptyStyle: React.CSSProperties = {
  padding: "72px 20px",
  textAlign: "center",
  color: "#444",
  fontSize: 14,
  fontWeight: 700,
};

const updatedStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "18px 18px 24px",
  color: "#252525",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".04em",
};
