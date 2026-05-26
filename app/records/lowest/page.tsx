"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fitzroy: "/former-logos/fitzroy.png",
  Geelong: "/team-logos/cats.png",
  Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png",
  Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png",
  "South Melbourne": "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const GAME_ABBR: Record<string, string> = {
  Adelaide: "ADE", "Brisbane Lions": "BL", Carlton: "CAR", Collingwood: "COL",
  Essendon: "ESS", Fitzroy: "FTZ", Fremantle: "FRE", Geelong: "GEE",
  "Gold Coast": "GC", "Greater Western Sydney": "GWS", Hawthorn: "HAW",
  Melbourne: "MEL", "North Melbourne": "NM", "Port Adelaide": "PA",
  Richmond: "RIC", "St Kilda": "STK", "South Melbourne": "SM",
  Sydney: "SYD", "West Coast": "WCE", "Western Bulldogs": "WB",
};

const GAME_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#111217", Essendon: "#cc0000", Fitzroy: "#003087",
  Fremantle: "#4b1979", Geelong: "#003b73", "Gold Coast": "#c8102e",
  "Greater Western Sydney": "#f47920", Hawthorn: "#4d2004",
  Melbourne: "#061a3c", "North Melbourne": "#1d4ed8", "Port Adelaide": "#008aab",
  Richmond: "#b8a000", "St Kilda": "#ed1b2f", "South Melbourne": "#ed1b2f",
  Sydney: "#ed1b2f", "West Coast": "#003087", "Western Bulldogs": "#2563eb",
};

type LowRecord = {
  team: string; score: string;
  opponent: string; opponentScore: string;
  combined: number; round: string; year: number; venue?: string;
};

// team = the lowest-scoring team (record holder), opponent = other team
const LOW_RECORDS: LowRecord[] = [
  { team: "Melbourne",      score: "0.8 (8)",   opponent: "Essendon",        opponentScore: "14",  combined: 22, round: "SF",  year: 1897, venue: "Lake Oval" },
  { team: "South Melbourne",score: "0.9 (9)",   opponent: "Essendon",        opponentScore: "15",  combined: 24, round: "R3",  year: 1899, venue: "East Melbourne" },
  { team: "Melbourne",      score: "0.10 (10)", opponent: "Geelong",         opponentScore: "15",  combined: 25, round: "R9",  year: 1897, venue: "Corio Oval" },
  { team: "Carlton",        score: "3.6 (24)",  opponent: "South Melbourne", opponentScore: "5",   combined: 29, round: "R8",  year: 1899, venue: "Princes Park" },
  { team: "Carlton",        score: "0.9 (9)",   opponent: "South Melbourne", opponentScore: "20",  combined: 29, round: "R17", year: 1897, venue: "Victoria Park" },
];

function parseScoreStr(score: string) {
  const m = score.match(/^([\d.]+)\s*\((\d+)\)$/);
  return m ? { breakdown: m[1], total: m[2] } : null;
}

function TeamBar({ team, total, breakdown, faded }: {
  team: string; total: string | null; breakdown?: string | null; faded?: boolean;
}) {
  const logo = TEAM_LOGOS[team];
  const color = GAME_COLORS[team] ?? "#444";
  return (
    <div style={{ display: "flex", minHeight: 44, opacity: faded ? 0.45 : 1 }}>
      <div style={{ width: 8, flexShrink: 0, background: color, borderRadius: "0 8px 8px 0" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "0 14px 0 10px" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {logo ? (
            <img src={logo} alt={team} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "var(--text-3)" }}>
              {team.slice(0, 2).toUpperCase()}
            </div>
          )}
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: '"Druk Wide","Arial Black",Impact,sans-serif', fontSize: 15, lineHeight: 1.1, fontWeight: 700, fontStyle: "italic" as const }}>
            {GAME_ABBR[team] ?? team.slice(0, 3).toUpperCase()}
          </strong>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <strong style={{ fontSize: 23, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: "#ffffff" }}>
            {total ?? "-"}
          </strong>
          {breakdown && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{breakdown}</span>}
        </div>
      </div>
    </div>
  );
}

function LowMatchBox({ record }: { record: LowRecord }) {
  const parsed = parseScoreStr(record.score);
  const detail = [`${record.combined} combined pts`, record.venue, `${record.round} ${record.year}`].filter(Boolean).join(" · ");
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, padding: "10px 0 0" }}>
        {/* Low-scoring team on top as the record holder */}
        <TeamBar team={record.team} total={parsed?.total ?? null} breakdown={parsed?.breakdown} />
        <TeamBar team={record.opponent} total={record.opponentScore} faded />
        {detail && <div style={venueStyle}>{detail}</div>}
      </div>
    </div>
  );
}

export default function LowestScoresPage() {
  const router = useRouter();
  const combinedVals = LOW_RECORDS.map(r => r.combined);

  return (
    <main style={pageStyle} className="page-enter">
      <header style={headerStyle}>
        <button type="button" onClick={() => router.back()} style={backBtnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={titleStyle}>Lowest Scoring Games</span>
      </header>

      <div style={listStyle}>
        {LOW_RECORDS.map((r, i) => {
          const trueRank = combinedVals.indexOf(r.combined) + 1;
          const tied = combinedVals.filter(v => v === r.combined).length > 1;
          const rankLabel = tied ? `=${trueRank}` : `${i + 1}`;
          return (
            <div key={i}>
              <span style={rankLabelStyle}>{rankLabel}</span>
              <LowMatchBox record={r} />
            </div>
          );
        })}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(90px + env(safe-area-inset-bottom))" };
const headerStyle: CSSProperties = { position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 4, height: "calc(56px + env(safe-area-inset-top))", padding: "env(safe-area-inset-top) 16px 0 8px", background: "var(--bottom-nav-bg)", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", borderBottom: "0.5px solid var(--border-2)" };
const backBtnStyle: CSSProperties = { background: "none", border: "none", padding: "8px", cursor: "pointer", color: "var(--text-1)", display: "flex", alignItems: "center", borderRadius: 10, flexShrink: 0 };
const titleStyle: CSSProperties = { fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em" };
const listStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, padding: "14px 14px 0", maxWidth: 600, margin: "0 auto" };
const rankLabelStyle: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", paddingLeft: 4, display: "block", marginBottom: 4 };
const cardStyle: CSSProperties = { borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", boxShadow: "0 2px 12px rgba(0,0,0,0.35)", overflow: "hidden" };
const venueStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-3)", textAlign: "center", padding: "6px 12px 10px" };
