"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import PageHeader from "@/app/components/PageHeader";

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  "Brisbane Bears": "/former-logos/bears.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fitzroy: "/former-logos/fitzroy.png",
  Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  "Greater Western Sydney": "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png",
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
  Footscray: "/team-logos/bulldogs.png",
};

type Tab = "teams" | "games" | "players";

type LeaderboardEntry = {
  team: string;
  count: number;
  lastYear?: number;
  note?: string;
};

type ScoreRecord = {
  team: string;
  score: string;       // "37.17 (239)"
  total: number;
  opponent: string;
  opponentScore?: string; // opponent total, if known
  round: string;
  year: number;
  venue?: string;
};

type MarginRecord = {
  winner: string;
  loser: string;
  margin: number;
  winnerScore: string;
  loserScore: string;
  round: string;
  year: number;
};

type PlayerRecord = {
  label: string;
  value: string;
  player: string;
  team: string;
  period?: string;
  detail?: string;
};

/* ─── Data ─────────────────────────────────────────────────── */

const PREMIERSHIPS: LeaderboardEntry[] = [
  { team: "Carlton", count: 16, lastYear: 1995 },
  { team: "Collingwood", count: 16, lastYear: 2023 },
  { team: "Essendon", count: 16, lastYear: 2000 },
  { team: "Hawthorn", count: 13, lastYear: 2015 },
  { team: "Melbourne", count: 13, lastYear: 2021 },
  { team: "Richmond", count: 13, lastYear: 2020 },
  { team: "Geelong", count: 10, lastYear: 2022 },
  { team: "Fitzroy", count: 8, lastYear: 1944, note: "Defunct" },
  { team: "Brisbane Lions", count: 5, lastYear: 2025 },
  { team: "Sydney", count: 5, lastYear: 2012, note: "Incl. South Melbourne" },
  { team: "North Melbourne", count: 4, lastYear: 1999 },
  { team: "West Coast", count: 4, lastYear: 2018 },
  { team: "Adelaide", count: 2, lastYear: 1998 },
  { team: "Western Bulldogs", count: 2, lastYear: 2016 },
  { team: "Port Adelaide", count: 1, lastYear: 2004 },
  { team: "St Kilda", count: 1, lastYear: 1966 },
];

const WOODEN_SPOONS: LeaderboardEntry[] = [
  { team: "St Kilda", count: 27 },
  { team: "Melbourne", count: 12 },
  { team: "Hawthorn", count: 11 },
  { team: "Sydney", count: 11, note: "Incl. South Melbourne" },
  { team: "Richmond", count: 8 },
];

const MINOR_PREMIERSHIPS: LeaderboardEntry[] = [
  { team: "Collingwood", count: 20, lastYear: 2023 },
  { team: "Carlton", count: 17, lastYear: 1999 },
  { team: "Essendon", count: 17, lastYear: 2000 },
  { team: "Geelong", count: 15, lastYear: 2022 },
];

const TOP_SCORES: ScoreRecord[] = [
  { team: "Geelong",        score: "37.17 (239)", total: 239, opponent: "Brisbane Bears", opponentScore: "75", round: "R7",  year: 1992, venue: "Carrara" },
  { team: "Fitzroy",        score: "36.22 (238)", total: 238, opponent: "Melbourne",      opponentScore: "48", round: "R17", year: 1979, venue: "Waverley Park" },
  { team: "Geelong",        score: "37.11 (233)", total: 233, opponent: "Melbourne",      opponentScore: "47", round: "R19", year: 2011, venue: "Kardinia Park" },
  { team: "Hawthorn",       score: "36.15 (231)", total: 231, opponent: "Fitzroy", opponentScore: "64",  round: "R6",  year: 1991, venue: "North Hobart" },
  { team: "North Melbourne",score: "35.19 (229)", total: 229, opponent: "Sydney",  opponentScore: "105", round: "R6",  year: 1993, venue: "Princes Park" },
];

const BIGGEST_WINS: MarginRecord[] = [
  { winner: "Fitzroy", loser: "Melbourne", margin: 190, winnerScore: "238", loserScore: "48", round: "R17", year: 1979 },
  { winner: "Geelong", loser: "Melbourne", margin: 186, winnerScore: "233", loserScore: "47", round: "R19", year: 2011 },
  { winner: "Collingwood", loser: "St Kilda", margin: 178, winnerScore: "207", loserScore: "29", round: "R4", year: 1979 },
  { winner: "Sydney", loser: "West Coast", margin: 171, winnerScore: "205", loserScore: "34", round: "R15", year: 2023 },
  { winner: "South Melbourne", loser: "St Kilda", margin: 171, winnerScore: "189", loserScore: "18", round: "R12", year: 1919 },
];

const PLAYER_RECORDS: PlayerRecord[] = [
  {
    label: "Most Career Games",
    value: "432",
    player: "Brent Harvey",
    team: "North Melbourne",
    period: "1996–2016",
    detail: "AFL record",
  },
  {
    label: "Most Career Goals",
    value: "1,360",
    player: "Tony Lockett",
    team: "St Kilda / Sydney",
    period: "1983–2002",
    detail: "VFL/AFL record",
  },
  {
    label: "Most Career Disposals",
    value: "10,328",
    player: "Scott Pendlebury",
    team: "Collingwood",
    period: "2006–present",
    detail: "Across 430 games",
  },
  {
    label: "Most Goals in a Game",
    value: "18",
    player: "Fred Fanning",
    team: "Melbourne",
    period: "1947",
    detail: "vs St Kilda",
  },
  {
    label: "Most Goals in a Season",
    value: "150",
    player: "Bob Pratt / Peter Hudson",
    team: "South Melb. / Hawthorn",
    period: "1934 / 1971",
    detail: "Shared record",
  },
  {
    label: "Most Brownlow Medals",
    value: "3",
    player: "Bunton · Skilton · Reynolds · Stewart",
    team: "Fitzroy / S. Melbourne / Essendon / St Kilda",
    detail: "Four three-time winners",
  },
  {
    label: "Most Disposals in a Game",
    value: "54",
    player: "Tom Mitchell / Harry Sheezel",
    team: "Hawthorn / North Melbourne",
    period: "2018 / 2025",
    detail: "Shared record",
  },
  {
    label: "Most Disposals in a Season",
    value: "880",
    player: "Jack Macrae",
    team: "Western Bulldogs",
    period: "2021",
    detail: "Across 22 games",
  },
  {
    label: "Most Goals on Debut",
    value: "12",
    player: "John Coleman",
    team: "Essendon",
    period: "1949",
    detail: "vs Hawthorn, Round 1",
  },
  {
    label: "Consec. Games Kicking a Goal",
    value: "121",
    player: "Peter McKenna",
    team: "Collingwood",
    period: "1968–1974",
  },
  {
    label: "Highest Career Goals Per Game",
    value: "5.64",
    player: "Peter Hudson",
    team: "Hawthorn",
    period: "1967–1977",
    detail: "143 games, 807 goals",
  },
  {
    label: "Most Grand Final Appearances",
    value: "7",
    player: "Michael Tuck",
    team: "Hawthorn",
    period: "1983–1991",
    detail: "Won all 7",
  },
  {
    label: "Most Games Coached",
    value: "718",
    player: "Mick Malthouse",
    team: "Footscray / West Coast / Collingwood / Carlton",
    period: "1984–2015",
  },
  {
    label: "Most Premierships as Coach",
    value: "8",
    player: "Jock McHale",
    team: "Collingwood",
    period: "1917–1936",
  },
];

/* ─── Additional game records ───────────────────────────────── */

type GameRecord = {
  teamA: string; scoreA: string;
  teamB: string; scoreB?: string;
  round: string; year: number; venue?: string;
};

// Highest combined score both teams together
const HIGHEST_COMBINED: GameRecord[] = [
  { teamA: "St Kilda",       scoreA: "31.18 (204)", teamB: "Melbourne",       scoreB: "141", round: "R6",  year: 1978, venue: "345 combined · M.C.G." },
  { teamA: "Geelong",        scoreA: "35.18 (228)", teamB: "St Kilda",        scoreB: "109", round: "R7",  year: 1989, venue: "337 combined · Kardinia Park" },
  { teamA: "Richmond",       scoreA: "29.14 (188)", teamB: "Hawthorn",        scoreB: "149", round: "R5",  year: 1985, venue: "337 combined · Princes Park" },
  { teamA: "North Melbourne",scoreA: "35.19 (229)", teamB: "Sydney",          scoreB: "105", round: "R6",  year: 1993, venue: "334 combined · Princes Park" },
  { teamA: "Hawthorn",       scoreA: "26.15 (171)", teamB: "Geelong",         scoreB: "163", round: "R6",  year: 1989, venue: "334 combined · Princes Park" },
];

// Lowest scoring games (combined, both teams)
const LOWEST_COMBINED: GameRecord[] = [
  { teamA: "Melbourne",      scoreA: "0.8 (8)",   teamB: "Essendon",        scoreB: "14",  round: "SF",  year: 1897, venue: "22 combined · Lake Oval" },
  { teamA: "South Melbourne",scoreA: "0.9 (9)",   teamB: "Essendon",        scoreB: "15",  round: "R3",  year: 1899, venue: "24 combined · East Melbourne" },
  { teamA: "Melbourne",      scoreA: "0.10 (10)", teamB: "Geelong",         scoreB: "15",  round: "R9",  year: 1897, venue: "25 combined · Corio Oval" },
  { teamA: "Carlton",        scoreA: "3.6 (24)",  teamB: "South Melbourne", scoreB: "5",   round: "R8",  year: 1899, venue: "29 combined · Princes Park" },
  { teamA: "Carlton",        scoreA: "4.5 (29)",  teamB: "South Melbourne", scoreB: "0",   round: "R17", year: 1897, venue: "29 combined · Victoria Park" },
];

// Most scoring shots in a game by one team
const MOST_SHOTS: GameRecord[] = [
  { teamA: "Hawthorn", scoreA: "25.41 (191)", teamB: "St Kilda",  scoreB: "103", round: "R6",  year: 1977, venue: "66 scoring shots · Princes Park" },
  { teamA: "Carlton",  scoreA: "30.30 (210)", teamB: "Hawthorn",  scoreB: "82",  round: "R2",  year: 1969, venue: "60 scoring shots · Princes Park" },
  { teamA: "Fitzroy",  scoreA: "36.22 (238)", teamB: "Melbourne", scoreB: "48",  round: "R17", year: 1979, venue: "58 scoring shots · Waverley Park" },
];

// Fewest scoring shots in a game by one team
const LEAST_SHOTS: GameRecord[] = [
  { teamA: "St Kilda", scoreA: "1.0 (6)",  teamB: "Collingwood", scoreB: "65",  round: "R13", year: 1898, venue: "1 scoring shot · Victoria Park" },
  { teamA: "St Kilda", scoreA: "1.0 (6)",  teamB: "Essendon",    scoreB: "85",  round: "R9",  year: 1899, venue: "1 scoring shot · East Melbourne" },
  { teamA: "St Kilda", scoreA: "0.1 (1)",  teamB: "Geelong",     scoreB: "162", round: "R17", year: 1899, venue: "1 scoring shot · Corio Oval" },
  { teamA: "Fitzroy",  scoreA: "0.1 (1)",  teamB: "Footscray",   scoreB: "66",  round: "R5",  year: 1953, venue: "1 scoring shot · Western Oval" },
];

// Most behinds by one team in a game
const MOST_BEHINDS: GameRecord[] = [
  { teamA: "Hawthorn", scoreA: "25.41 (191)", teamB: "St Kilda",       scoreB: "103", round: "R6",  year: 1977, venue: "41 behinds · Princes Park" },
  { teamA: "Geelong",  scoreA: "22.35 (167)", teamB: "Melbourne",      scoreB: "79",  round: "R16", year: 1981, venue: "35 behinds · M.C.G." },
  { teamA: "Melbourne",scoreA: "12.34 (106)", teamB: "North Melbourne", scoreB: "49",  round: "R7",  year: 1940, venue: "34 behinds · Arden St" },
];

/* ─── Player leaderboards ───────────────────────────────────── */

type PlayerLeaderboardEntry = {
  name: string;
  team: string;       // display string (may have " / ")
  count: number;
  period?: string;
  logoTeam?: string;  // explicit logo key if team string is compound
};

const CAREER_GAMES: PlayerLeaderboardEntry[] = [
  { name: "Brent Harvey",    team: "North Melbourne",      count: 432, period: "1996–2016" },
  { name: "Michael Tuck",    team: "Hawthorn",             count: 426, period: "1972–1991" },
  { name: "Kevin Bartlett",  team: "Richmond",             count: 403, period: "1965–1983" },
  { name: "Dustin Fletcher", team: "Essendon",             count: 400, period: "1993–2015" },
  { name: "Robert Harvey",   team: "St Kilda",             count: 383, period: "1988–2008" },
];

const CAREER_GOALS_LB: PlayerLeaderboardEntry[] = [
  { name: "Tony Lockett",    team: "St Kilda / Sydney",         count: 1360, period: "1983–2002", logoTeam: "St Kilda" },
  { name: "Gordon Coventry", team: "Collingwood",               count: 1299, period: "1920–1937" },
  { name: "Jason Dunstall",  team: "Hawthorn",                  count: 1254, period: "1985–1998" },
  { name: "Lance Franklin",  team: "Hawthorn / Sydney",         count: 1066, period: "2005–2023", logoTeam: "Hawthorn" },
  { name: "Doug Wade",       team: "Geelong / North Melbourne", count: 1057, period: "1959–1975", logoTeam: "Geelong" },
];

const CAREER_DISPOSALS_LB: PlayerLeaderboardEntry[] = [
  { name: "Scott Pendlebury", team: "Collingwood",           count: 10328, period: "2006–present" },
  { name: "Robert Harvey",    team: "St Kilda",              count: 9656,  period: "1988–2008" },
  { name: "Brent Harvey",     team: "North Melbourne",       count: 9213,  period: "1996–2016" },
  { name: "Kevin Bartlett",   team: "Richmond",              count: 9151,  period: "1965–1983" },
  { name: "Gary Ablett Jr.",  team: "Geelong / Gold Coast",  count: 8896,  period: "2002–2020", logoTeam: "Geelong" },
];

/* ─── Team win-percentage leaderboard ───────────────────────── */

type WinPctEntry = { team: string; pct: string; wins: number; games: number };

const WIN_PCT_DATA: WinPctEntry[] = [
  { team: "Collingwood",     pct: "60.9%", wins: 1600, games: 2649 },
  { team: "Carlton",         pct: "57.3%", wins: 1472, games: 2600 },
  { team: "Essendon",        pct: "56.1%", wins: 1421, games: 2564 },
  { team: "Geelong",         pct: "55.3%", wins: 1397, games: 2548 },
  { team: "West Coast",      pct: "54.6%", wins: 468,  games: 863  },
];

/* ─── Grand final runners-up leaderboard ────────────────────── */

const RUNNERS_UP: LeaderboardEntry[] = [
  { team: "Collingwood",     count: 27 },
  { team: "Essendon",        count: 14 },
  { team: "Sydney",          count: 14, note: "Incl. South Melbourne" },
  { team: "Carlton",         count: 13 },
  { team: "Richmond",        count: 12 },
];

/* ─── Sub-components ────────────────────────────────────────── */

function TeamLogo({ team, size = 34 }: { team: string; size?: number }) {
  const src = TEAM_LOGOS[team];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {src && <img src={src} alt={team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}

const RANK_COLORS = ["#f59e0b"];

function LeaderboardCard({ data, showLastYear }: { data: LeaderboardEntry[]; showLastYear?: boolean }) {
  // Compute true ranks accounting for ties
  const ranks = data.map((entry, i) => {
    const trueRank = data.findIndex((e) => e.count === entry.count) + 1;
    const tied = data.filter((e) => e.count === entry.count).length > 1;
    return { trueRank, tied };
  });

  return (
    <div style={cardStyle}>
      {data.map((entry, i) => {
        const { trueRank, tied } = ranks[i];
        const colorIdx = trueRank === 1 ? 0 : -1;
        const rankColor = colorIdx >= 0 ? RANK_COLORS[colorIdx] : "var(--text-3)";
        const rankLabel = tied ? `=${trueRank}` : `${trueRank}`;
        return (
          <div key={entry.team}>
            {i > 0 && <div style={divStyle} />}
            <div style={lbRowStyle}>
              <div style={{ width: 34, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <span style={{ fontSize: tied ? 11 : 13, fontWeight: 900, color: rankColor, fontVariantNumeric: "tabular-nums" }}>
                  {rankLabel}
                </span>
              </div>
              <TeamLogo team={entry.team} size={32} />
              <div style={lbInfoStyle}>
                <span style={lbNameStyle}>{entry.team}</span>
                {showLastYear && entry.lastYear && (
                  <span style={lbSubStyle}>Last: {entry.lastYear}</span>
                )}
              </div>
              <span style={{ ...lbCountStyle, color: colorIdx >= 0 ? rankColor : "var(--text-1)" }}>
                {entry.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Game match-box helpers ─────────────────────────────────── */

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

function parseScoreStr(score: string): { breakdown: string; total: string } | null {
  const m = score.match(/^([\d.]+)\s*\((\d+)\)$/);
  return m ? { breakdown: m[1], total: m[2] } : null;
}

function RecordTeamBar({ team, total, breakdown, faded }: {
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
            <img src={logo} alt={team} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", background: "var(--surface-2)", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "var(--text-3)" }}>
              {team.slice(0, 2).toUpperCase()}
            </div>
          )}
          <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: '"Druk Wide","Arial Black",Impact,sans-serif', fontSize: 15, lineHeight: 1.1, fontWeight: 700, fontStyle: "italic" as const, letterSpacing: 0 }}>
            {GAME_ABBR[team] ?? team.slice(0, 3).toUpperCase()}
          </strong>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", justifyContent: "center", gap: 2, flexShrink: 0 }}>
          <strong style={{ fontSize: 23, fontWeight: 900, lineHeight: 1, letterSpacing: 0, fontVariantNumeric: "tabular-nums", color: "#ffffff", textAlign: "right" as const }}>
            {total ?? "-"}
          </strong>
          {breakdown && (
            <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
              {breakdown}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GameMatchBox({
  teamA, scoreA, teamB, scoreB, venue, round, year,
}: {
  teamA: string; scoreA: string; teamB: string; scoreB?: string;
  venue?: string; round?: string; year?: number;
}) {
  const parsed = parseScoreStr(scoreA);
  const detail = [venue, round && year ? `${round} ${year}` : (round ?? year?.toString())].filter(Boolean).join(" · ");
  return (
    <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", boxShadow: "0 2px 12px rgba(0,0,0,0.35)", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, padding: "10px 0 0" }}>
        <RecordTeamBar team={teamA} total={parsed?.total ?? null} breakdown={parsed?.breakdown} />
        <RecordTeamBar team={teamB} total={scoreB ?? null} faded />
        {detail && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textAlign: "center" as const, padding: "6px 12px 10px" }}>{detail}</div>}
      </div>
    </div>
  );
}

function MarginMatchBox({ record }: { record: MarginRecord }) {
  const detail = `+${record.margin} pts · ${record.round} ${record.year}`;
  return (
    <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", boxShadow: "0 2px 12px rgba(0,0,0,0.35)", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, padding: "10px 0 0" }}>
        <RecordTeamBar team={record.winner} total={record.winnerScore} />
        <RecordTeamBar team={record.loser} total={record.loserScore} faded />
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textAlign: "center" as const, padding: "6px 12px 10px" }}>{detail}</div>
      </div>
    </div>
  );
}

function LinkedMatchBox({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }} className="rec-tab">
      {children}
    </Link>
  );
}

function ExpandableScoreSection() {
  const top = TOP_SCORES[0];
  return (
    <LinkedMatchBox href="/records/scores">
      <GameMatchBox
        teamA={top.team} scoreA={top.score}
        teamB={top.opponent} scoreB={top.opponentScore}
        venue={top.venue} round={top.round} year={top.year}
      />
    </LinkedMatchBox>
  );
}

function ExpandableMarginSection() {
  const top = BIGGEST_WINS[0];
  return (
    <LinkedMatchBox href="/records/margins">
      <MarginMatchBox record={top} />
    </LinkedMatchBox>
  );
}

function ExpandableCombinedSection() {
  const top = HIGHEST_COMBINED[0];
  return (
    <LinkedMatchBox href="/records/combined">
      <GameMatchBox teamA={top.teamA} scoreA={top.scoreA} teamB={top.teamB} scoreB={top.scoreB} venue={top.venue} round={top.round} year={top.year} />
    </LinkedMatchBox>
  );
}

function ExpandableLowestSection() {
  const top = LOWEST_COMBINED[0];
  return (
    <LinkedMatchBox href="/records/lowest">
      <GameMatchBox teamA={top.teamA} scoreA={top.scoreA} teamB={top.teamB} scoreB={top.scoreB} venue={top.venue} round={top.round} year={top.year} />
    </LinkedMatchBox>
  );
}

function ExpandableShotsSection() {
  const top = MOST_SHOTS[0];
  return (
    <LinkedMatchBox href="/records/most-shots">
      <GameMatchBox teamA={top.teamA} scoreA={top.scoreA} teamB={top.teamB} scoreB={top.scoreB} venue={top.venue} round={top.round} year={top.year} />
    </LinkedMatchBox>
  );
}

function ExpandableLeastShotsSection() {
  const top = LEAST_SHOTS[0];
  return (
    <LinkedMatchBox href="/records/least-shots">
      <GameMatchBox teamA={top.teamA} scoreA={top.scoreA} teamB={top.teamB} scoreB={top.scoreB} venue={top.venue} round={top.round} year={top.year} />
    </LinkedMatchBox>
  );
}

function ExpandableBehindsSection() {
  const top = MOST_BEHINDS[0];
  return (
    <LinkedMatchBox href="/records/behinds">
      <GameMatchBox teamA={top.teamA} scoreA={top.scoreA} teamB={top.teamB} scoreB={top.scoreB} venue={top.venue} round={top.round} year={top.year} />
    </LinkedMatchBox>
  );
}

const TEAM_ABBREV_MAP: Record<string, string> = {
  "South Melb.": "South Melbourne",
  "S. Melbourne": "South Melbourne",
};

/** Returns one logo team name per holder (supports shared records). */
function getLogos(record: PlayerRecord): string[] {
  if (!record.team) {
    // player field doubles as team name for team-level records
    return [TEAM_ABBREV_MAP[record.player] ?? record.player];
  }
  return record.team.split(" / ").map(t => {
    const trimmed = t.trim();
    return TEAM_ABBREV_MAP[trimmed] ?? trimmed;
  });
}

function PlayerRecordCard({ record }: { record: PlayerRecord }) {
  const logos = getLogos(record);
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "12px 14px" }}>
      {/* Record label */}
      <span style={playerLabelStyle}>{record.label}</span>

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9 }}>
        {/* One or more overlapping logos */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          {logos.map((team, i) => (
            <div key={i} style={{ marginLeft: i > 0 ? -10 : 0, position: "relative" as const, zIndex: logos.length - i }}>
              <TeamLogo team={team} size={34} />
            </div>
          ))}
        </div>

        {/* Player name + team */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={playerNameStyle}>{record.player}</div>
          {record.team && <div style={playerTeamStyle}>{record.team}</div>}
        </div>

        {/* Value + period + detail */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", color: "var(--text-1)", lineHeight: 1 }}>
            {record.value}
          </span>
          {record.period && <span style={playerDetailStyle}>{record.period}</span>}
          {record.detail && <span style={playerDetailStyle}>{record.detail}</span>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, entity, entitySub, period, detail, showLogo }: {
  label: string; value: string; entity: string; entitySub?: string;
  period?: string; detail?: string; showLogo?: boolean;
}) {
  return (
    <div style={playerCardStyle}>
      <span style={playerLabelStyle}>{label}</span>
      <span style={playerValueStyle}>{value}</span>
      <div style={playerFooterStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: showLogo ? 10 : 0 }}>
          {showLogo && <TeamLogo team={entity} size={28} />}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
            <span style={playerNameStyle}>{entity}</span>
            {entitySub && <span style={playerTeamStyle}>{entitySub}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 1 }}>
          {period && <span style={playerPeriodStyle}>{period}</span>}
          {detail && <span style={playerDetailStyle}>{detail}</span>}
        </div>
      </div>
    </div>
  );
}

function PlayerLeaderboardCard({ data, formatCount }: {
  data: PlayerLeaderboardEntry[];
  formatCount?: (n: number) => string;
}) {
  return (
    <div style={cardStyle}>
      {data.map((entry, i) => {
        const logoTeam = entry.logoTeam ?? entry.team.split(" / ")[0].trim();
        const isFirst = i === 0;
        return (
          <div key={i}>
            {i > 0 && <div style={divStyle} />}
            <div style={lbRowStyle}>
              <div style={{ width: 34, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: isFirst ? "#f59e0b" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                  {i + 1}
                </span>
              </div>
              <TeamLogo team={TEAM_ABBREV_MAP[logoTeam] ?? logoTeam} size={32} />
              <div style={lbInfoStyle}>
                <span style={lbNameStyle}>{entry.name}</span>
                <span style={lbSubStyle}>{entry.team}</span>
                {entry.period && <span style={lbSubStyle}>{entry.period}</span>}
              </div>
              <span style={{ ...lbCountStyle, fontSize: 19, color: isFirst ? "#f59e0b" : "var(--text-1)" }}>
                {formatCount ? formatCount(entry.count) : entry.count.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WinPctLeaderboard({ data }: { data: WinPctEntry[] }) {
  return (
    <div style={cardStyle}>
      {data.map((entry, i) => (
        <div key={i}>
          {i > 0 && <div style={divStyle} />}
          <div style={lbRowStyle}>
            <div style={{ width: 34, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? "#f59e0b" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                {i + 1}
              </span>
            </div>
            <TeamLogo team={entry.team} size={32} />
            <div style={lbInfoStyle}>
              <span style={lbNameStyle}>{entry.team}</span>
              <span style={lbSubStyle}>{entry.wins.toLocaleString()} wins from {entry.games.toLocaleString()} games</span>
            </div>
            <span style={{ ...lbCountStyle, fontSize: 18, color: i === 0 ? "#f59e0b" : "var(--text-1)" }}>
              {entry.pct}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <span style={sectionLabelStyle}>{children}</span>;
}

/* ─── Page ──────────────────────────────────────────────────── */

export default function RecordsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("teams");

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .rec-tab { transition: color 0.15s; }
        .rec-tab:active { opacity: 0.7; }
      `}</style>

      <PageHeader title="Records" />

      {/* Segmented control */}
      <div style={segWrapStyle}>
        <div style={segStyle}>
          {(["teams", "games", "players"] as Tab[]).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "teams" ? "Teams" : tab === "games" ? "Games" : "Players";
            return (
              <button
                key={tab}
                type="button"
                className="rec-tab"
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 10,
                  padding: "7px 0",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 800 : 600,
                  color: active ? "var(--text-1)" : "var(--text-3)",
                  background: active ? "var(--bg)" : "transparent",
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.18)" : "none",
                  letterSpacing: "-0.01em",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={contentStyle}>
        {activeTab === "teams" && (
          <>
            <SectionLabel>Most Premierships</SectionLabel>
            <LeaderboardCard data={PREMIERSHIPS} showLastYear />

            <SectionLabel>Most Wooden Spoons</SectionLabel>
            <LeaderboardCard data={WOODEN_SPOONS} />

            <SectionLabel>Most Minor Premierships</SectionLabel>
            <LeaderboardCard data={MINOR_PREMIERSHIPS} showLastYear />

            <SectionLabel>Most Grand Final Appearances (Runner-Up)</SectionLabel>
            <LeaderboardCard data={RUNNERS_UP} />

            <SectionLabel>All-Time Win Percentage</SectionLabel>
            <WinPctLeaderboard data={WIN_PCT_DATA} />

            <SectionLabel>Longest Winning Streak</SectionLabel>
            <StatCard label="Consecutive Wins" value="23" entity="Geelong" period="1952–1953" detail="R12 1952 – R13 1953" showLogo />

            <SectionLabel>Longest Losing Streak</SectionLabel>
            <StatCard label="Consecutive Losses" value="48" entity="St Kilda" period="1897–1900" detail="R1 1897 – R1 1900" showLogo />

            <SectionLabel>Most Consecutive Finals Appearances</SectionLabel>
            <StatCard label="Finals Appearances" value="9" entity="Hawthorn" period="1983–1991" detail="7 premierships in that run" showLogo />
          </>
        )}

        {activeTab === "games" && (
          <>
            <SectionLabel>Highest Score</SectionLabel>
            <ExpandableScoreSection />

            <SectionLabel>Biggest Winning Margin</SectionLabel>
            <ExpandableMarginSection />

            <SectionLabel>Highest Scoring Game</SectionLabel>
            <ExpandableCombinedSection />

            <SectionLabel>Lowest Scoring Game</SectionLabel>
            <ExpandableLowestSection />

            <SectionLabel>Most Scoring Shots</SectionLabel>
            <ExpandableShotsSection />

            <SectionLabel>Fewest Scoring Shots</SectionLabel>
            <ExpandableLeastShotsSection />

            <SectionLabel>Most Behinds in a Game</SectionLabel>
            <ExpandableBehindsSection />

            <SectionLabel>Biggest Comeback</SectionLabel>
            <GameMatchBox
              teamA="Essendon" scoreA="27.9 (171)"
              teamB="North Melbourne" scoreB="159"
              venue="69 pts down in Q2 · R16 2001"
            />

            <SectionLabel>Highest Attendance</SectionLabel>
            <GameMatchBox
              teamA="Carlton" scoreA="17.9 (111)"
              teamB="Collingwood" scoreB="101"
              venue="121,696 crowd · M.C.G."
              round="GF" year={1970}
            />
          </>
        )}

        {activeTab === "players" && (
          <>
            <SectionLabel>Most Career Games</SectionLabel>
            <PlayerLeaderboardCard data={CAREER_GAMES} />

            <SectionLabel>Most Career Goals</SectionLabel>
            <PlayerLeaderboardCard data={CAREER_GOALS_LB} />

            <SectionLabel>Most Career Disposals</SectionLabel>
            <PlayerLeaderboardCard data={CAREER_DISPOSALS_LB} />

            <SectionLabel>Individual Records</SectionLabel>
            {PLAYER_RECORDS.map((r) => (
              <PlayerRecordCard key={r.label} record={r} />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

/* ─── Styles ────────────────────────────────────────────────── */

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const segWrapStyle: CSSProperties = {
  padding: "12px 14px 0",
  maxWidth: 600,
  margin: "0 auto",
};

const segStyle: CSSProperties = {
  display: "flex",
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
  borderRadius: 12,
  padding: 3,
  gap: 2,
};

const contentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "10px 14px 0",
  maxWidth: 600,
  margin: "0 auto",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  paddingTop: 6,
  paddingLeft: 4,
};

const cardStyle: CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  overflow: "hidden",
};

const divStyle: CSSProperties = {
  height: 1,
  background: "var(--border-1)",
  marginLeft: 64,
};

const lbRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
};

const lbInfoStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const lbNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--text-1)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const lbSubStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
};

const lbCountStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  letterSpacing: "-0.04em",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const playerCardStyle: CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const playerLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const playerValueStyle: CSSProperties = {
  fontSize: 34,
  fontWeight: 950,
  letterSpacing: "-0.05em",
  color: "var(--text-1)",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const playerFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  marginTop: 6,
  paddingTop: 10,
  borderTop: "1px solid var(--border-1)",
};

const playerNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "var(--text-1)",
};

const playerTeamStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
};

const playerPeriodStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-2)",
  textAlign: "right",
};

const playerDetailStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  textAlign: "right",
};

/* ─── Game match-box styles ─────────────────────────────────── */

const gmExpandHintStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-3)",
  textAlign: "center",
  padding: "8px 0 2px",
  letterSpacing: "0.02em",
};
