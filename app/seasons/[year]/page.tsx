"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import seasonsData from "@/app/data/seasons.json";

type Season = {
  year: number;
  premier: string;
  runnerUp: string;
  premierScore: string | null;
  runnerUpScore: string | null;
  margin: number | null;
  wasReplay?: boolean;
};

type Game = {
  id: number;
  year: number;
  round: number;
  roundname: string;
  hteam: string;
  ateam: string;
  hscore: number | null;
  ascore: number | null;
  hgoals: number | null;
  hbehinds: number | null;
  agoals: number | null;
  abehinds: number | null;
  venue: string;
  date: string;
  winner: string | null;
  is_final: number;
  is_grand_final: number;
  complete: number;
};

type Standing = {
  name: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  pts: number;
  for: number;
  against: number;
  percentage: number;
  id: number;
};

type Tab = "fixtures" | "ladder";

const BRISBANE_BEARS_LOGO = "/former-logos/bears.png";

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

const TEAM_NICKNAMES: Record<string, string> = {
  Adelaide: "Crows",
  "Brisbane Lions": "Lions",
  Brisbane: "Lions",
  Carlton: "Blues",
  Collingwood: "Magpies",
  Essendon: "Bombers",
  Fitzroy: "Fitzroy",
  Footscray: "Bulldogs",
  Fremantle: "Dockers",
  Geelong: "Cats",
  "Gold Coast": "Suns",
  "Greater Western Sydney": "Giants",
  GWS: "Giants",
  Hawthorn: "Hawks",
  Kangaroos: "Kangaroos",
  Melbourne: "Demons",
  "North Melbourne": "Kangaroos",
  "Port Adelaide": "Power",
  Richmond: "Tigers",
  "St Kilda": "Saints",
  "South Melbourne": "S. Melbourne",
  Sydney: "Swans",
  University: "University",
  "West Coast": "Eagles",
  "Western Bulldogs": "Bulldogs",
};

const TEAM_ABBR: Record<string, string> = {
  Adelaide: "ADE",
  "Brisbane Lions": "BRI",
  Brisbane: "BRI",
  Carlton: "CAR",
  Collingwood: "COL",
  Essendon: "ESS",
  Fitzroy: "FTZ",
  Footscray: "FSC",
  Fremantle: "FRE",
  Geelong: "GEE",
  "Gold Coast": "GC",
  "Greater Western Sydney": "GWS",
  GWS: "GWS",
  Hawthorn: "HAW",
  Kangaroos: "NM",
  Melbourne: "MEL",
  "North Melbourne": "NM",
  "Port Adelaide": "PA",
  Richmond: "RIC",
  "St Kilda": "STK",
  "South Melbourne": "SM",
  Sydney: "SYD",
  University: "UNI",
  "West Coast": "WCE",
  "Western Bulldogs": "WB",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c",
  "Brisbane Lions": "#a50034",
  Brisbane: "#a50034",
  Carlton: "#031a35",
  Collingwood: "#111217",
  Essendon: "#cc0000",
  Fitzroy: "#003087",
  Footscray: "#2563eb",
  Fremantle: "#4b1979",
  Geelong: "#003b73",
  "Gold Coast": "#c8102e",
  "Greater Western Sydney": "#f47920",
  GWS: "#f47920",
  Hawthorn: "#4d2004",
  Kangaroos: "#1d4ed8",
  Melbourne: "#061a3c",
  "North Melbourne": "#1d4ed8",
  "Port Adelaide": "#008aab",
  Richmond: "#b8a000",
  "St Kilda": "#ed1b2f",
  "South Melbourne": "#ed1b2f",
  Sydney: "#ed1b2f",
  University: "#003087",
  "West Coast": "#003087",
  "Western Bulldogs": "#2563eb",
};

function parseHeroScore(score: string | null): { total: string; breakdown: string } | null {
  if (!score) return null;
  const m = score.match(/^([\d.]+)\s*\((\d+)\)$/);
  if (m) return { breakdown: m[1], total: m[2] };
  return { total: score, breakdown: "" };
}

function normalizeTeamName(name: string, year: number): string {
  if (name === "Sydney" && year <= 1981) return "South Melbourne";
  return name;
}

function teamLogo(name: string, year?: number) {
  if (name === "Brisbane" && year !== undefined) {
    return year <= 1996 ? BRISBANE_BEARS_LOGO : "/team-logos/lions.png";
  }
  return TEAM_LOGOS[name] ?? null;
}

function teamColor(name: string) {
  return TEAM_COLORS[name] ?? "#333";
}

function formatDateLabel(date?: string) {
  if (!date) return "TBA";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function roundLabel(round: number, roundname: string) {
  if (roundname) return roundname;
  return round === 0 ? "Opening Round" : `Round ${round}`;
}

/* ── Game card (home-page style) ── */

function TeamBar({ team, score, goals, behinds, faded, isWide, year }: {
  team: string;
  score: number | null;
  goals: number | null;
  behinds: number | null;
  faded: boolean;
  isWide: boolean;
  year?: number;
}) {
  const logo = teamLogo(team, year);
  const color = teamColor(team);
  const goalsText = goals !== null && behinds !== null ? `${goals}.${behinds}` : "";
  const displayName = isWide
    ? (TEAM_NICKNAMES[team] ?? team)
    : (TEAM_ABBR[team] ?? team.slice(0, 3).toUpperCase());

  return (
    <div style={{ ...teamWrapStyle, opacity: faded ? 0.45 : 1 }}>
      <div style={{ width: 8, flexShrink: 0, background: color, borderRadius: "0 8px 8px 0" }} />
      <div style={teamRowInnerStyle}>
        <div style={teamLeftStyle}>
          {logo ? (
            <img src={logo} alt={team} style={logoStyle} loading="lazy" />
          ) : (
            <div style={logoFallbackStyle}>{team.slice(0, 2).toUpperCase()}</div>
          )}
          <strong style={teamNameStyle}>{displayName}</strong>
        </div>
        <div style={scoreWrapStyle}>
          <strong style={scoreTotalStyle}>{score ?? "-"}</strong>
          {goalsText && <span style={scoreBreakdownStyle}>{goalsText}</span>}
        </div>
      </div>
    </div>
  );
}

function GameCard({ game, isWide, year }: { game: Game; isWide: boolean; year?: number }) {
  const hWon = game.winner === game.hteam;
  const aWon = game.winner === game.ateam;
  const isGF = game.is_grand_final === 1;

  return (
    <div style={gameCardStyle}>
      <div style={gameCardInnerStyle}>
        <TeamBar team={game.hteam} score={game.hscore} goals={game.hgoals} behinds={game.hbehinds} faded={!hWon && aWon} isWide={isWide} year={year} />
        <TeamBar team={game.ateam} score={game.ascore} goals={game.agoals} behinds={game.abehinds} faded={!aWon && hWon} isWide={isWide} year={year} />
        {game.venue ? <div style={venueStyle}>{game.venue}</div> : null}
      </div>
    </div>
  );
}

/* ── Fixtures tab ── */

function RoundStrip({
  rounds,
  selectedRound,
  onSelectRound,
  roundRef,
}: {
  rounds: Array<{ round: number; label: string }>;
  selectedRound: number;
  onSelectRound: (r: number) => void;
  roundRef: React.RefObject<HTMLDivElement | null>;
}) {
  function scroll(dir: "left" | "right") {
    const el = roundRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  }

  return (
    <div style={roundStripWrapStyle}>
      <button type="button" onClick={() => scroll("left")} style={roundArrowBtnStyle} aria-label="Scroll left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div ref={roundRef} className="no-scrollbar" style={roundTabsStyle}>
        {rounds.map(({ round, label }) => {
          const isSelected = round === selectedRound;
          return (
            <button
              key={round}
              type="button"
              data-selected={isSelected}
              onClick={() => onSelectRound(round)}
              style={roundTabBtnStyle}
            >
              <span style={{
                ...roundTabTextStyle,
                fontWeight: isSelected ? 800 : 600,
                color: isSelected ? "var(--text-1)" : "var(--text-3)",
              }}>
                {label}
              </span>
              {isSelected && <span style={roundTabUnderlineStyle} />}
            </button>
          );
        })}
      </div>

      <button type="button" onClick={() => scroll("right")} style={roundArrowBtnStyle} aria-label="Scroll right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

function FixturesTab({
  games,
  selectedRound,
  onSelectRound,
  rounds,
  roundRef,
  year,
}: {
  games: Game[];
  selectedRound: number;
  onSelectRound: (r: number) => void;
  rounds: Array<{ round: number; label: string }>;
  roundRef: React.RefObject<HTMLDivElement | null>;
  year?: number;
}) {
  if (games.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>No fixture data</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>This season's fixture data isn't available</div>
      </div>
    );
  }

  const roundGames = games
    .filter((g) => g.round === selectedRound)
    .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime());

  const groups: Array<{ label: string; games: Game[] }> = [];
  roundGames.forEach((g) => {
    const label = formatDateLabel(g.date);
    const existing = groups.find((gr) => gr.label === label);
    if (existing) existing.games.push(g);
    else groups.push({ label, games: [g] });
  });

  return (
    <>
      <RoundStrip rounds={rounds} selectedRound={selectedRound} onSelectRound={onSelectRound} roundRef={roundRef} />

      <div style={gamesWrapStyle}>
        {groups.length === 0 ? (
          <div style={emptyStyle}>
            <div style={{ fontWeight: 800 }}>No games this round</div>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div style={dateLabelStyle}>{group.label}</div>
              <div style={{
                ...dateGamesStyle,
                display: "grid",
                gridTemplateColumns: group.games.length >= 2 ? "repeat(2, minmax(0, 1fr))" : "1fr",
              }}>
                {group.games.map((g) => <GameCard key={g.id} game={g} isWide={group.games.length === 1} year={year} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ── Ladder tab ── */

function LadderTab({ standings, year, games }: { standings: Standing[]; year?: number; games: Game[] }) {
  if (standings.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>No ladder data</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>This season's ladder data isn't available</div>
      </div>
    );
  }

  const useFixtureBased = (year ?? 2000) < 2000;

  // Build set of teams that played in any final
  const finalistNames = new Set(
    games
      .filter((g) => g.is_final === 1)
      .flatMap((g) => [g.hteam, g.ateam])
  );

  const sorted = [...standings].sort((a, b) => a.rank - b.rank);

  function sideColour(rank: number, teamName: string): string {
    if (useFixtureBased) {
      return finalistNames.has(teamName) ? "#3b82f6" : "transparent";
    }
    if (rank <= 4) return "#fbbf24";
    if (rank <= 8) return "#3b82f6";
    return "transparent";
  }

  return (
    <div style={ladderCardStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <colgroup>
          <col style={{ width: 46 }} />
          <col />
          <col style={{ width: 50 }} />
          <col style={{ width: 66 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 70 }} />
        </colgroup>
        <thead>
          <tr>
            {["#", "Team", "P", "W-L", "PTS", "%"].map((h, i) => (
              <th key={h} style={{ ...ladderThStyle, textAlign: i <= 1 ? (i === 0 ? "center" : "left") : "center" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const logo = teamLogo(team.name, year);
            const colour = sideColour(i + 1, team.name);
            const stripe = i % 2 === 1 ? "rgba(255,255,255,0.018)" : "transparent";
            return (
              <tr
                key={team.id ?? team.name}
                style={{
                  background: stripe,
                  borderBottom: "1px solid var(--border-1)",
                  borderLeft: colour !== "transparent" ? `4px solid ${colour}` : "4px solid transparent",
                }}
              >
                <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 13, fontWeight: 900, color: "var(--text-2)" }}>
                  {i + 1}
                </td>
                <td style={{ padding: "11px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {logo ? (
                      <img src={logo} alt={team.name} style={{ width: 26, height: 26, objectFit: "cover", borderRadius: "50%", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "var(--text-3)" }}>
                        {team.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {team.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "11px 8px", textAlign: "center", fontSize: 13, fontWeight: 700 }}>{team.played}</td>
                <td style={{ padding: "11px 8px", textAlign: "center", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {team.wins}-{team.losses}{team.draws > 0 ? `-${team.draws}` : ""}
                </td>
                <td style={{ padding: "11px 8px", textAlign: "center", fontSize: 14, fontWeight: 950, color: "var(--text-1)" }}>
                  {team.pts}
                </td>
                <td style={{ padding: "11px 12px 11px 8px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  {typeof team.percentage === "number" ? team.percentage.toFixed(1) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={ladderLegendStyle}>
        {!useFixtureBased && (
          <span style={legendItemStyle}><span style={{ ...legendDotStyle, background: "#fbbf24" }} /> Top 4</span>
        )}
        <span style={legendItemStyle}><span style={{ ...legendDotStyle, background: "#3b82f6" }} /> Finals</span>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function SeasonDetailPage() {
  const params = useParams();
  const year = params.year as string;
  const router = useRouter();
  const yearNum = parseInt(year, 10);

  const season = (seasonsData as Season[]).find((s) => s.year === yearNum) ?? null;

  const [tab, setTab] = useState<Tab>("fixtures");
  const [games, setGames] = useState<Game[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number>(-1);
  const roundRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/seasons/${yearNum}`)
      .then((r) => r.json())
      .then((data) => {
        const g: Game[] = (data.games ?? []).map((game: Game) => ({
          ...game,
          hteam: normalizeTeamName(game.hteam, yearNum),
          ateam: normalizeTeamName(game.ateam, yearNum),
          winner: game.winner ? normalizeTeamName(game.winner, yearNum) : game.winner,
        }));
        const s: Standing[] = (data.standings ?? []).map((st: Standing) => ({
          ...st,
          name: normalizeTeamName(st.name, yearNum),
        }));
        setGames(g);
        setStandings(s);
        setLoading(false);
        // Auto-select first regular round (round 1 or 0 if only finals)
        const rounds = Array.from(new Set(g.map((x) => x.round))).sort((a, b) => a - b);
        if (rounds.length > 0 && selectedRound === -1) {
          setSelectedRound(rounds[0]);
        }
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearNum]);

  // Scroll selected round tab into view
  useEffect(() => {
    if (!roundRef.current) return;
    const btn = roundRef.current.querySelector<HTMLElement>("[data-selected='true']");
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedRound]);

  const rounds = Array.from(
    new Map(games.map((g) => [g.round, roundLabel(g.round, g.roundname)])).entries()
  )
    .sort((a, b) => a[0] - b[0])
    .map(([round, label]) => ({ round, label }));

  if (!season) {
    return (
      <main style={pageStyle}>
        <header style={headerStyle}>
          <button type="button" onClick={() => router.back()} style={backBtnStyle}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={titleStyle}>Season not found</span>
        </header>
      </main>
    );
  }

  const premierLogo = teamLogo(season.premier, yearNum);
  const runnerUpLogo = teamLogo(season.runnerUp, yearNum);

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes season-spin { to { transform: rotate(360deg); } }
        .season-spinner { animation: season-spin 0.8s linear infinite; }
      `}</style>

      <header style={headerStyle}>
        <button type="button" onClick={() => router.back()} style={backBtnStyle}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={titleStyle}>{yearNum} Season</span>
      </header>

      {/* GF hero */}
      <div style={heroStyle}>
        <div style={heroTeamsStyle}>
          {/* Premier */}
          <div style={heroTeamStyle}>
            <div style={heroLogoWrapStyle}>
              {premierLogo ? (
                <img src={premierLogo} alt={season.premier} style={heroLogoStyle} />
              ) : (
                <div style={heroLogoFallbackStyle}>{season.premier.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            {(() => {
              const p = parseHeroScore(season.premierScore);
              return p ? (
                <>
                  <span style={heroScoreTotalStyle}>{p.total}</span>
                  {p.breakdown && <span style={heroScoreBreakdownStyle}>{p.breakdown}</span>}
                </>
              ) : null;
            })()}
            <span style={heroTeamNameStyle}>{season.premier}</span>
            {season.wasReplay && <span style={heroReplayStyle}>Replay</span>}
          </div>

          {/* Runner-up */}
          <div style={heroTeamStyle}>
            <div style={heroLogoWrapStyle}>
              {runnerUpLogo ? (
                <img src={runnerUpLogo} alt={season.runnerUp} style={heroLogoStyle} />
              ) : (
                <div style={heroLogoFallbackStyle}>{season.runnerUp.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            {(() => {
              const p = parseHeroScore(season.runnerUpScore);
              return p ? (
                <>
                  <span style={heroScoreTotalStyle}>{p.total}</span>
                  {p.breakdown && <span style={heroScoreBreakdownStyle}>{p.breakdown}</span>}
                </>
              ) : null;
            })()}
            <span style={heroTeamNameStyle}>{season.runnerUp}</span>
          </div>
        </div>
      </div>

      {/* Fixtures / Ladder pill tabs */}
      <div style={tabsWrapStyle}>
        <div style={tabsStyle}>
          {(["fixtures", "ladder"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{ ...tabBtnStyle, ...(tab === t ? activeTabStyle : {}) }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={spinnerStyle} className="season-spinner" />
        </div>
      )}
      {error && !loading && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 800 }}>Couldn't load data</div>
        </div>
      )}

      {!loading && !error && tab === "fixtures" && (
        <FixturesTab
          games={games}
          selectedRound={selectedRound}
          onSelectRound={setSelectedRound}
          rounds={rounds}
          roundRef={roundRef}
          year={yearNum}
        />
      )}

      {!loading && !error && tab === "ladder" && (
        <div style={contentStyle}>
          <LadderTab standings={standings} year={yearNum} games={games} />
        </div>
      )}
    </main>
  );
}

/* ── Styles ── */

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
  gap: 8,
  height: "calc(56px + env(safe-area-inset-top))",
  padding: "env(safe-area-inset-top) 16px 0 12px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
};

const backBtnStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: "50%",
  border: "none", background: "transparent", color: "var(--text-1)", cursor: "pointer", flexShrink: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em",
};

const heroStyle: CSSProperties = {
  padding: "28px 16px 22px",
  maxWidth: 600,
  margin: "0 auto",
};

const heroTeamsStyle: CSSProperties = {
  display: "flex", alignItems: "flex-start", justifyContent: "space-around",
  gap: 8,
};

const heroTeamStyle: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, minWidth: 0,
};

const heroLogoWrapStyle: CSSProperties = {
  width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2)",
  marginBottom: 8,
};

const heroLogoStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

const heroLogoFallbackStyle: CSSProperties = {
  width: "100%", height: "100%",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 20, fontWeight: 950, color: "var(--text-3)", background: "var(--surface-2)",
};

const heroScoreTotalStyle: CSSProperties = {
  fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums", color: "#ffffff",
};

const heroScoreBreakdownStyle: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--text-3)",
  fontVariantNumeric: "tabular-nums", marginBottom: 4,
};

const heroTeamNameStyle: CSSProperties = {
  fontSize: 13, fontWeight: 800, textAlign: "center", color: "var(--text-1)",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
};

const heroPremierBadgeStyle: CSSProperties = {
  fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" as const,
  color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)",
  borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" as const, marginTop: 2,
};

const heroRunnerUpBadgeStyle: CSSProperties = {
  ...heroPremierBadgeStyle,
  color: "var(--text-3)", background: "transparent", border: "1px solid var(--border-2)",
};

const heroReplayStyle: CSSProperties = {
  fontSize: 10, fontWeight: 900, color: "#f59e0b", background: "rgba(245,158,11,0.12)",
  border: "1px solid rgba(245,158,11,0.2)", borderRadius: 999, padding: "2px 6px",
};

const tabsWrapStyle: CSSProperties = { padding: "12px 14px 0", maxWidth: 600, margin: "0 auto" };

const tabsStyle: CSSProperties = {
  display: "flex", padding: 3, borderRadius: 999,
  background: "var(--surface-3)", border: "1px solid var(--border-2)", gap: 2,
};

const tabBtnStyle: CSSProperties = {
  flex: 1, border: "none", borderRadius: 999, padding: "8px 0",
  background: "transparent", color: "var(--text-3)", fontSize: 13, fontWeight: 900, cursor: "pointer",
};

const activeTabStyle: CSSProperties = { background: "var(--text-1)", color: "var(--bg)" };

const contentStyle: CSSProperties = { padding: "14px 14px 0", maxWidth: 600, margin: "0 auto" };

const spinnerStyle: CSSProperties = {
  width: 28, height: 28, border: "3px solid var(--border-2)",
  borderTopColor: "var(--text-1)", borderRadius: "50%",
};

const emptyStyle: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: "60px 24px", textAlign: "center", color: "var(--text-2)",
};

/* Round tabs */
const roundStripWrapStyle: CSSProperties = {
  position: "sticky",
  top: "calc(56px + env(safe-area-inset-top))",
  zIndex: 40,
  display: "flex",
  alignItems: "center",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-1)",
};

const roundArrowBtnStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, width: 36, height: 36,
  border: "none", background: "transparent",
  color: "var(--text-2)", cursor: "pointer",
};

const roundTabsStyle: CSSProperties = {
  display: "flex", flex: 1, gap: 0, overflowX: "auto", overflowY: "hidden",
  padding: "4px 0 0", scrollBehavior: "smooth", scrollbarWidth: "none",
} as CSSProperties;

const roundTabBtnStyle: CSSProperties = {
  position: "relative", flex: "0 0 auto", background: "none", border: "none",
  cursor: "pointer", padding: "4px 10px 8px",
};

const roundTabTextStyle: CSSProperties = {
  fontSize: 13, whiteSpace: "nowrap", display: "block",
};

const roundTabUnderlineStyle: CSSProperties = {
  position: "absolute", bottom: 0, left: 10, right: 10,
  height: 2, borderRadius: 999, background: "var(--text-1)",
};

/* Games area */
const gamesWrapStyle: CSSProperties = {
  padding: "0 10px",
  maxWidth: 660,
  margin: "0 auto",
};

const dateLabelStyle: CSSProperties = {
  padding: "18px 2px 10px", color: "#fff", fontSize: 11, fontWeight: 800,
  letterSpacing: "0.07em", textTransform: "uppercase",
};

const dateGamesStyle: CSSProperties = {
  gap: 10, paddingBottom: 8,
};

/* Home-page style game card */
const gameCardStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const gfCardStyle: CSSProperties = {
  border: "1px solid rgba(245,158,11,0.4)",
  background: "linear-gradient(135deg, rgba(245,158,11,0.06), var(--surface-3))",
};

const gfLabelStyle: CSSProperties = {
  padding: "5px 12px", fontSize: 10, fontWeight: 950,
  letterSpacing: "0.08em", textTransform: "uppercase" as const,
  color: "#f59e0b", background: "rgba(245,158,11,0.1)",
  borderBottom: "1px solid rgba(245,158,11,0.2)",
};

const gameCardInnerStyle: CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, padding: "10px 0 0",
};

const teamWrapStyle: CSSProperties = {
  display: "flex", minHeight: 44,
};

const teamRowInnerStyle: CSSProperties = {
  flex: 1, minWidth: 0, display: "flex", alignItems: "center",
  justifyContent: "space-between", gap: 6, padding: "0 14px 0 10px",
};

const teamLeftStyle: CSSProperties = {
  minWidth: 0, display: "flex", alignItems: "center", gap: 10,
};

const logoStyle: CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", objectFit: "cover",
  background: "var(--surface-2)", flexShrink: 0,
};

const logoFallbackStyle: CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", background: "var(--surface-2)",
  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 9, fontWeight: 900, color: "var(--text-3)",
};

const teamNameStyle: CSSProperties = {
  minWidth: 0, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis",
  whiteSpace: "nowrap", fontFamily: '"Druk Wide", "Arial Black", Impact, sans-serif',
  fontSize: 15, lineHeight: 1.1, fontWeight: 700, fontStyle: "italic", letterSpacing: 0,
};

const scoreWrapStyle: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-end",
  justifyContent: "center", gap: 2, flexShrink: 0,
};

const scoreTotalStyle: CSSProperties = {
  fontSize: 23, fontWeight: 900, lineHeight: 1, letterSpacing: 0,
  fontVariantNumeric: "tabular-nums", color: "#ffffff", textAlign: "right",
};

const scoreBreakdownStyle: CSSProperties = {
  fontSize: 10, fontWeight: 600, lineHeight: 1,
  color: "var(--text-3)", fontVariantNumeric: "tabular-nums",
};

const venueStyle: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "var(--text-3)",
  textAlign: "center", padding: "6px 12px 10px",
};

/* Ladder */
const ladderCardStyle: CSSProperties = {
  borderRadius: 16, border: "1px solid var(--border-2)",
  background: "var(--surface-1)", overflow: "hidden", overflowX: "auto",
};

const ladderThStyle: CSSProperties = {
  padding: "10px 12px", fontSize: 11, color: "var(--text-3)", fontWeight: 900,
  textTransform: "uppercase" as const, letterSpacing: "0.06em",
  borderBottom: "1px solid var(--border-2)", background: "var(--bg)",
};

const ladderLegendStyle: CSSProperties = {
  display: "flex", gap: 16, justifyContent: "center",
  padding: "12px 16px", borderTop: "1px solid var(--border-1)", background: "var(--bg)",
};

const legendItemStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  fontSize: 12, fontWeight: 800, color: "var(--text-2)",
};

const legendDotStyle: CSSProperties = {
  width: 8, height: 8, borderRadius: 999, display: "inline-block",
};
