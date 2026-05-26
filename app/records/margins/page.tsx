"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  "Brisbane Bears": "/former-logos/bears.png",
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
  Adelaide: "ADE", "Brisbane Lions": "BL", "Brisbane Bears": "BB",
  Carlton: "CAR", Collingwood: "COL", Essendon: "ESS", Fitzroy: "FTZ",
  Fremantle: "FRE", Geelong: "GEE", "Gold Coast": "GC",
  "Greater Western Sydney": "GWS", Hawthorn: "HAW", Melbourne: "MEL",
  "North Melbourne": "NM", "Port Adelaide": "PA", Richmond: "RIC",
  "St Kilda": "STK", "South Melbourne": "SM", Sydney: "SYD",
  "West Coast": "WCE", "Western Bulldogs": "WB",
};

const GAME_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", "Brisbane Bears": "#7b1a1f",
  Carlton: "#031a35", Collingwood: "#111217", Essendon: "#cc0000",
  Fitzroy: "#003087", Fremantle: "#4b1979", Geelong: "#003b73",
  "Gold Coast": "#c8102e", "Greater Western Sydney": "#f47920",
  Hawthorn: "#4d2004", Melbourne: "#061a3c", "North Melbourne": "#1d4ed8",
  "Port Adelaide": "#008aab", Richmond: "#b8a000", "St Kilda": "#ed1b2f",
  "South Melbourne": "#ed1b2f", Sydney: "#ed1b2f",
  "West Coast": "#003087", "Western Bulldogs": "#2563eb",
};

type MarginRecord = {
  winner: string; loser: string; margin: number;
  winnerScore: string; loserScore: string;
  round: string; year: number;
};

const BIGGEST_WINS: MarginRecord[] = [
  { winner: "Fitzroy",        loser: "Melbourne", margin: 190, winnerScore: "238", loserScore: "48", round: "R17", year: 1979 },
  { winner: "Geelong",        loser: "Melbourne", margin: 186, winnerScore: "233", loserScore: "47", round: "R19", year: 2011 },
  { winner: "Collingwood",    loser: "St Kilda",  margin: 178, winnerScore: "207", loserScore: "29", round: "R4",  year: 1979 },
  { winner: "Sydney",         loser: "West Coast",margin: 171, winnerScore: "205", loserScore: "34", round: "R15", year: 2023 },
  { winner: "South Melbourne",loser: "St Kilda",  margin: 171, winnerScore: "189", loserScore: "18", round: "R12", year: 1919 },
];

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

function MarginMatchBox({ record }: { record: MarginRecord }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, padding: "10px 0 0" }}>
        <TeamBar team={record.winner} total={record.winnerScore} breakdown={`+${record.margin} pts`} />
        <TeamBar team={record.loser} total={record.loserScore} faded />
        <div style={venueStyle}>{`${record.round} ${record.year}`}</div>
      </div>
    </div>
  );
}

export default function BiggestMarginsPage() {
  const router = useRouter();
  return (
    <main style={pageStyle} className="page-enter">
      <header style={headerStyle}>
        <button type="button" onClick={() => router.back()} style={backBtnStyle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={titleStyle}>Biggest Margins</span>
      </header>

      <div style={listStyle}>
        {BIGGEST_WINS.map((r, i) => (
          <div key={i}>
            <span style={rankLabelStyle}>{`${i + 1}`}</span>
            <MarginMatchBox record={r} />
          </div>
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
  gap: 4,
  height: "calc(56px + env(safe-area-inset-top))",
  padding: "env(safe-area-inset-top) 16px 0 8px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
};

const backBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: "8px",
  cursor: "pointer",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  borderRadius: 10,
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "14px 14px 0",
  maxWidth: 600,
  margin: "0 auto",
};

const rankLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "var(--text-3)",
  paddingLeft: 4,
  display: "block",
  marginBottom: 4,
};

const cardStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const venueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-3)",
  textAlign: "center",
  padding: "6px 12px 10px",
};
