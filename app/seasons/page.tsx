"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import seasons from "@/app/data/seasons.json";

type Season = {
  year: number;
  premier: string;
  runnerUp: string;
  premierScore: string | null;
  runnerUpScore: string | null;
  margin: number | null;
  wasReplay?: boolean;
};

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fitzroy: "/former-logos/fitzroy.png",
  Footscray: "/team-logos/bulldogs.png",
  Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  "Greater Western Sydney": "/team-logos/giants.png",
  GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png",
  Kangaroos: "/team-logos/kangaroos.png",
  Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png",
  "South Melbourne": "/team-logos/swans.png",
  Sydney: "/team-logos/swans.png",
  University: "/former-logos/university.png",
  "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

function parseScore(score: string | null): { total: string; breakdown: string } | null {
  if (!score) return null;
  // e.g. "18.14 (122)" → total "122", breakdown "18.14"
  const m = score.match(/^([\d.]+)\s*\((\d+)\)$/);
  if (m) return { breakdown: m[1], total: m[2] };
  return { total: score, breakdown: "" };
}

function TeamRow({
  team,
  label,
  score,
}: {
  team: string;
  label: string;
  score: string | null;
}) {
  const logo = TEAM_LOGOS[team];
  const parsed = parseScore(score);
  return (
    <div style={teamRowStyle}>
      <div style={teamLogoWrapStyle}>
        {logo ? (
          <img src={logo} alt={team} style={teamLogoStyle} />
        ) : (
          <div style={teamLogoFallbackStyle} />
        )}
      </div>
      <div style={teamInfoStyle}>
        <span style={teamNameStyle}>{team}</span>
        <span style={teamLabelStyle}>{label}</span>
      </div>
      {parsed && (
        <div style={scoreWrapStyle}>
          <strong style={scoreTotalStyle}>{parsed.total}</strong>
          {parsed.breakdown && <span style={scoreBreakdownStyle}>{parsed.breakdown}</span>}
        </div>
      )}
    </div>
  );
}

function SeasonCard({ season, onClick }: { season: Season; onClick: () => void }) {
  const currentYear = new Date().getFullYear();
  const isCurrentSeason = season.year === currentYear;

  return (
    <button type="button" style={cardStyle} onClick={onClick} className="season-card">
      <div style={cardHeaderStyle}>
        <span style={cardYearStyle}>{season.year}</span>
        {season.wasReplay && (
          <span style={replayBadgeStyle}>Replay</span>
        )}
        {isCurrentSeason && (
          <span style={currentBadgeStyle}>Current</span>
        )}
        {!isCurrentSeason && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
      <div style={dividerStyle} />
      <TeamRow team={season.premier} label="Premiers" score={season.premierScore} />
      <div style={dividerStyle} />
      <TeamRow team={season.runnerUp} label="Runner-up" score={season.runnerUpScore} />
    </button>
  );
}

export default function SeasonsPage() {
  const router = useRouter();

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .season-card {
          transition: opacity 0.15s;
        }
        .season-card:active {
          opacity: 0.7;
        }
        @media (hover: hover) {
          .season-card:hover {
            border-color: rgba(255,255,255,0.12) !important;
          }
        }
      `}</style>

      <header style={headerStyle}>
        <span style={titleStyle}>Seasons</span>
      </header>

      <div style={listStyle}>
        {(seasons as Season[]).map((season) => (
          <SeasonCard
            key={season.year}
            season={season}
            onClick={() => router.push(`/seasons/${season.year}`)}
          />
        ))}
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

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  height: "calc(56px + env(safe-area-inset-top))",
  padding: "env(safe-area-inset-top) 16px 0 58px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "14px 14px 0",
  maxWidth: 600,
  margin: "0 auto",
};

const cardStyle: CSSProperties = {
  width: "100%",
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  padding: 0,
  overflow: "hidden",
  cursor: "pointer",
  textAlign: "left",
  display: "block",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px 12px",
};

const cardYearStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: "-0.03em",
  color: "var(--text-1)",
  flex: 1,
};

const replayBadgeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  color: "#f59e0b",
  background: "rgba(245,158,11,0.12)",
  border: "1px solid rgba(245,158,11,0.25)",
  borderRadius: 999,
  padding: "2px 8px",
};

const currentBadgeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  color: "#22c55e",
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.25)",
  borderRadius: 999,
  padding: "2px 8px",
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: "var(--border-1)",
  margin: "0",
};

const teamRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
};

const teamLogoWrapStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  overflow: "hidden",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const teamLogoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const teamLogoFallbackStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "var(--surface-3)",
};

const teamInfoStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const teamNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "var(--text-1)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const teamLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-3)",
};

const scoreWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: 2,
  flexShrink: 0,
};

const scoreTotalStyle: CSSProperties = {
  fontSize: 23,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: 0,
  fontVariantNumeric: "tabular-nums",
  color: "var(--text-1)",
};

const scoreBreakdownStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  color: "var(--text-3)",
  fontVariantNumeric: "tabular-nums",
};
