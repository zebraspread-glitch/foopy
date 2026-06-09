import path from "path";
import fs from "fs";
import Link from "next/link";
import { BackButton, TeamLogoImage } from "./TeamClient";
import { TeamPassSection } from "./TeamPassSection";
import { foopyColor } from "@/app/lib/foopyRating";
import { computeAvgFoopyMap } from "@/app/lib/computeAvgFoopy.server";

type PlayerInfo = {
  id: string;
  name: string;
  team: string;
  apiSportsId?: number | null;
  statsIds?: number[];
};

type SeasonStats = {
  id: string;
  position?: string;
  jerseyNumber?: number;
  games?: number;
};

type SquiggleGame = {
  id: number;
  round: number | string;
  hteam?: string;
  ateam?: string;
  hscore?: number | null;
  ascore?: number | null;
  complete?: number;
  is_final?: number;
  date?: string;
};

const TEAM_SLUG_MAP: Record<string, { name: string; id: number }> = {
  adelaide:       { name: "Adelaide",          id: 1  },
  brisbanelions:  { name: "Brisbane Lions",    id: 2  },
  carlton:        { name: "Carlton",           id: 3  },
  collingwood:    { name: "Collingwood",       id: 4  },
  essendon:       { name: "Essendon",          id: 5  },
  fremantle:      { name: "Fremantle",         id: 6  },
  geelong:        { name: "Geelong",           id: 7  },
  hawthorn:       { name: "Hawthorn",          id: 8  },
  melbourne:      { name: "Melbourne",         id: 9  },
  northmelbourne: { name: "North Melbourne",   id: 10 },
  portadelaide:   { name: "Port Adelaide",     id: 11 },
  richmond:       { name: "Richmond",          id: 12 },
  stkilda:        { name: "St Kilda",          id: 13 },
  sydney:         { name: "Sydney",            id: 14 },
  westcoast:      { name: "West Coast",        id: 15 },
  westernbulldogs:{ name: "Western Bulldogs",  id: 16 },
  goldcoast:      { name: "Gold Coast",        id: 17 },
  gws:            { name: "GWS",               id: 18 },
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  Geelong: "#003b73", "Gold Coast": "#c0392b", GWS: "#e05a1a",
  "Greater Western Sydney": "#e05a1a", "Greater Western Sydney Giants": "#e05a1a",
  "GWS Giants": "#e05a1a", Hawthorn: "#6b3a1f", Melbourne: "#c8102e",
  "North Melbourne": "#0055a4", "Port Adelaide": "#008999", Richmond: "#272731",
  "St Kilda": "#c8102e", Sydney: "#c0392b", "West Coast": "#003087",
  "Western Bulldogs": "#1a4abf",
};

const LOGO_MAP: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png", "Greater Western Sydney": "/team-logos/giants.png",
  "Greater Western Sydney Giants": "/team-logos/giants.png", "GWS Giants": "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png", "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Brisbane Lions": "lions", Brisbane: "lions",
  Carlton: "blues", Collingwood: "magpies", Essendon: "bombers",
  Fremantle: "dockers", Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns", GWS: "giants",
  "GWS Giants": "giants", "Greater Western Sydney": "giants",
  Hawthorn: "hawks", Melbourne: "demons", "North Melbourne": "kangaroos",
  "Port Adelaide": "power", Richmond: "tigers", "St Kilda": "saints",
  Sydney: "swans", "West Coast": "eagles", "Western Bulldogs": "bulldogs",
};

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function aflScore(goals: number, behinds: number) { return goals * 6 + behinds; }

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function playerImagePath(player: PlayerInfo) {
  const folder = TEAM_FOLDER[player.team];
  if (!folder) return "";
  const nameId = player.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `/players/${folder}/${nameId}.png`;
}

function normalizeTeamName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    brisbane: "brisbanelions", geelongcats: "geelong",
    greaterwesternsydney: "gws", gwsgiants: "gws",
  };
  return aliases[normalized] ?? normalized;
}

function teamMatches(a?: string, b?: string) {
  if (!a || !b) return false;
  return normalizeTeamName(a) === normalizeTeamName(b);
}

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = TEAM_SLUG_MAP[slug] ?? null;

  if (!team) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}><BackButton /></div>
        <div style={emptyStateStyle}>
          <p style={{ color: "var(--text-3)", fontWeight: 900, fontSize: 16 }}>Team not found</p>
        </div>
      </main>
    );
  }

  const dataDir = path.join(process.cwd(), "app", "data");
  const { name: teamName } = team;
  const color = TEAM_COLORS[teamName] ?? "#1e293b";
  const logo = LOGO_MAP[teamName] ?? "/team-logos/crows.png";

  const players: PlayerInfo[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const seasonData: SeasonStats[] = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));

  // Fetch Squiggle (game results, fresh every 5 min) and avgFoopy map in parallel.
  // Squiggle is the single source of truth for game results — always up to date.
  const [avgFoopyMap, squiggleGames] = await Promise.all([
    computeAvgFoopyMap(),
    (async (): Promise<SquiggleGame[]> => {
      try {
        const res = await fetch(
          `https://api.squiggle.com.au/?q=games;year=${new Date().getFullYear()}`,
          { headers: { "User-Agent": "Foopy AFL App (foopy.app)" }, next: { revalidate: 300 } }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return json.games ?? [];
      } catch { return []; }
    })(),
  ]);

  // Look up a player's avg foopy from the map (handles apiSportsId + statsIds)
  function getPlayerAvgFoopy(player: PlayerInfo): number | null {
    const ids = new Set<number>();
    if (player.apiSportsId) ids.add(Number(player.apiSportsId));
    for (const sid of player.statsIds ?? []) ids.add(Number(sid));
    for (const id of ids) {
      const avg = avgFoopyMap.get(id);
      if (avg !== undefined) return avg;
    }
    return null;
  }

  // Build roster sorted by avg foopy
  const roster = players
    .filter((p) => teamMatches(p.team, teamName))
    .map((player) => ({
      player,
      season: seasonData.find((s) => s.id === player.id),
      avgFoopy: getPlayerAvgFoopy(player),
    }))
    .sort((a, b) => {
      if (a.avgFoopy === null && b.avgFoopy === null) return a.player.name.localeCompare(b.player.name);
      if (a.avgFoopy === null) return 1;
      if (b.avgFoopy === null) return -1;
      return b.avgFoopy - a.avgFoopy;
    });

  const ratedRoster = roster.filter((r) => r.avgFoopy !== null);
  const teamAvgFoopy = ratedRoster.length
    ? ratedRoster.reduce((s, r) => s + r.avgFoopy!, 0) / ratedRoster.length
    : null;

  // Rank this team among all 18 by their average player foopy
  const teamAverageRankings = Object.values(TEAM_SLUG_MAP)
    .map((t) => {
      const rated = players
        .filter((p) => teamMatches(p.team, t.name))
        .map(getPlayerAvgFoopy)
        .filter((r): r is number => r !== null);
      const average = rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : null;
      return { name: t.name, average };
    })
    .filter((r): r is { name: string; average: number } => r.average !== null)
    .sort((a, b) => b.average - a.average);
  const teamAverageRank = teamAverageRankings.findIndex((r) => r.name === teamName) + 1;

  // All completed Squiggle games for this team, most recent first
  const teamGames = squiggleGames
    .filter((g) => {
      const complete = Number(g.complete ?? 0);
      const isFinal = Number(g.is_final ?? 0);
      if (complete < 100 && isFinal !== 1) return false;
      return teamMatches(g.hteam, teamName) || teamMatches(g.ateam, teamName);
    })
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

  // Season record
  let wins = 0, draws = 0, losses = 0, totalMargin = 0;
  for (const g of teamGames) {
    const homeIsUs = teamMatches(g.hteam, teamName);
    const ours   = num(homeIsUs ? g.hscore : g.ascore);
    const theirs = num(homeIsUs ? g.ascore : g.hscore);
    totalMargin += ours - theirs;
    if (ours > theirs) wins++;
    else if (ours === theirs) draws++;
    else losses++;
  }
  const played = wins + draws + losses;
  const winPct = played > 0 ? Math.round((wins / played) * 100) : null;
  const avgMargin = played > 0 ? totalMargin / played : null;

  // Recent form (last 8 games)
  const recentGames = teamGames.slice(0, 8).map((g) => {
    const homeIsUs = teamMatches(g.hteam, teamName);
    const ourScore   = num(homeIsUs ? g.hscore : g.ascore);
    const theirScore = num(homeIsUs ? g.ascore : g.hscore);
    const opponent   = (homeIsUs ? g.ateam : g.hteam) ?? "";
    return {
      id:       String(g.id),
      date:     g.date ?? "",
      round:    g.round,
      opponent,
      ourScore,
      theirScore,
      margin: ourScore - theirScore,
    };
  });

  const maxMargin = Math.max(...recentGames.map((g) => Math.abs(g.margin)), 1);

  return (
    <main style={pageStyle} className="page-enter">
      <div style={topBarStyle}><BackButton /></div>

      <div style={wrapStyle}>
        <section style={heroStyle}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${color}88 0%, rgba(255,255,255,.03) 52%, rgba(0,0,0,.36) 100%)` }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.08), rgba(0,0,0,.62))" }} />
          <div style={heroContentStyle}>
            <TeamLogoImage src={logo} name={teamName} color={color} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={heroTitleStyle}>{teamName}</h1>
              <div style={heroMetaStyle}>
                {played > 0 && <span style={recordPillStyle}>{wins}W-{losses}L{draws > 0 ? `-${draws}D` : ""}</span>}
                {winPct !== null && (
                  <span style={{ ...recordPillStyle, color, background: `${color}22`, borderColor: `${color}55` }}>
                    {winPct}% win
                  </span>
                )}
                {teamAvgFoopy !== null && (
                  <span style={{ ...recordPillStyle, color: foopyColor(teamAvgFoopy), background: "var(--surface-3)" }}>
                    {teamAvgFoopy.toFixed(1)} Foopy
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Team Pass ── */}
        <TeamPassSection teamName={teamName} accentColor={color} />

        {played > 0 && (
          <section style={cardStyle}>
            {/* Header — matches player profile "2026 Season" style */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border-1)" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)", letterSpacing: "0.01em" }}>2026 Season</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{played} games</span>
            </div>
            {/* Horizontal scrollable stat row — matches player profile layout */}
            <div style={{ display: "flex", overflowX: "auto", gap: 0, paddingBottom: 2 }}>
              {([
                { label: "W",      value: String(wins) },
                { label: "L",      value: String(losses) },
                ...(draws > 0 ? [{ label: "D", value: String(draws) }] : []),
                { label: "WIN%",   value: winPct !== null ? `${winPct}%` : "—" },
                { label: "MARGIN", value: avgMargin !== null ? `${avgMargin >= 0 ? "+" : ""}${avgMargin.toFixed(1)}` : "—" },
              ] as { label: string; value: string }[]).map(({ label, value }, i) => (
                <div key={label} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  flex: "0 0 auto", minWidth: 58,
                  paddingLeft: i === 0 ? 0 : 12,
                  borderLeft: i > 0 ? "1px solid var(--border-1)" : undefined,
                  marginLeft: i > 0 ? 12 : 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 4, whiteSpace: "nowrap" as const }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--text-1)", lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {recentGames.length > 0 && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionLabel}>Recent form</span>
              <span style={countPillStyle}>margin</span>
            </div>
            <div style={chartStyle}>
              {[...recentGames].reverse().map((game) => {
                const positive  = game.margin > 0;
                const draw      = game.margin === 0;
                const barColor  = positive ? "#22c55e" : draw ? "#facc15" : "#ef4444";
                const height    = draw ? 5 : Math.max(10, (Math.abs(game.margin) / maxMargin) * 54);
                const oppLogo   = LOGO_MAP[game.opponent] ?? "";
                return (
                  <div key={game.id} style={chartItemStyle}>
                    <div style={chartValueStyle}>{game.margin > 0 ? "+" : ""}{game.margin}</div>
                    <div style={chartBarAreaStyle}>
                      <div style={chartMidlineStyle} />
                      <div style={{
                        ...chartBarStyle, height, background: barColor,
                        bottom: positive || draw ? "50%" : "auto",
                        top: game.margin < 0 ? "50%" : "auto",
                        borderRadius: positive ? "5px 5px 1px 1px" : game.margin < 0 ? "1px 1px 5px 5px" : 5,
                      }} />
                    </div>
                    <div style={smallLogoStyle}>
                      {oppLogo && <img src={oppLogo} alt={game.opponent} style={logoImgStyle} />}
                    </div>
                    <div style={roundStyle}>{game.round ? `R${game.round}` : formatDate(game.date)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {recentGames.length > 0 && (
          <section style={cardStyle}>
            <div style={{ ...sectionLabel, marginBottom: 14 }}>Season results</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentGames.map((game, i) => {
                const resultColor = game.margin > 0 ? "#22c55e" : game.margin === 0 ? "#facc15" : "#ef4444";
                const resultLabel = game.margin > 0 ? "W" : game.margin === 0 ? "D" : "L";
                const oppLogo = LOGO_MAP[game.opponent] ?? "";
                return (
                  <Link key={game.id} href={`/match/${game.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined, textDecoration: "none", color: "inherit" }}>
                    {/* Round + opponent logo */}
                    <div style={{ minWidth: 52, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                        {game.round ? `Rd ${game.round}` : formatDate(game.date)}
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0 }}>
                        {oppLogo && <img src={oppLogo} alt={game.opponent} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                    </div>
                    {/* Vertical divider */}
                    <div style={{ width: 1, height: 40, background: "var(--surface-3)", flexShrink: 0 }} />
                    {/* Opponent + score */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 850, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        vs {game.opponent}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginTop: 3 }}>
                        {game.ourScore}–{game.theirScore}
                        <span style={{ color: resultColor, marginLeft: 5 }}>
                          ({game.margin > 0 ? "+" : ""}{game.margin})
                        </span>
                      </div>
                    </div>
                    {/* W/L/D badge */}
                    <div style={{ flexShrink: 0, minWidth: 32, textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", color: resultColor }}>{resultLabel}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabel}>Squad</span>
          </div>

          {teamAvgFoopy !== null && (
            <Link href="/team-average" style={squadAverageStyle}>
              <span style={teamAverageLabelStyle}>Team Average</span>
              <strong style={{ ...averageRatingBadgeStyle, background: foopyColor(teamAvgFoopy) }}>
                {teamAvgFoopy.toFixed(1)}
              </strong>
              {teamAverageRank > 0 && <span style={teamRankStyle}>#{teamAverageRank} of 18</span>}
            </Link>
          )}

          <div style={squadGridStyle}>
            {ratedRoster.map(({ player, avgFoopy }, index) => (
              <Link
                key={player.id}
                href={`/player/${player.id}`}
                title={player.name}
                aria-label={`${player.name}, ${avgFoopy!.toFixed(1)} Foopy`}
                style={playerTileStyle}
              >
                <div style={tileRankStyle}>{index + 1}</div>
                <div style={{ ...playerImageWrapStyle, borderColor: `${color}55`, background: `${color}22` }}>
                  <img src={playerImagePath(player)} alt={player.name} style={playerImageStyle} />
                </div>
                <div style={{ ...tileRatingStyle, background: foopyColor(avgFoopy!) }}>
                  {avgFoopy!.toFixed(1)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}


const pageStyle: React.CSSProperties = { minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(95px + env(safe-area-inset-bottom))" };
const topBarStyle: React.CSSProperties = { maxWidth: 680, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 14px) 18px 10px" };
const wrapStyle: React.CSSProperties = { maxWidth: 680, margin: "0 auto", padding: "0 12px", display: "flex", flexDirection: "column", gap: 12 };
const heroStyle: React.CSSProperties = { minHeight: 158, borderRadius: 20, overflow: "hidden", border: "1px solid var(--border-2)", background: "var(--bg)", position: "relative" };
const heroContentStyle: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center", gap: 16, minHeight: 158, padding: "22px 20px" };
const heroTitleStyle: React.CSSProperties = { margin: "0 0 9px", color: "var(--text-1)", fontSize: 25, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.05, overflowWrap: "anywhere" };
const heroMetaStyle: React.CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" };
const recordPillStyle: React.CSSProperties = { fontSize: 11, fontWeight: 900, color: "#cbd5e1", background: "rgba(0,0,0,.28)", border: "1px solid var(--border-3)", borderRadius: 999, padding: "4px 8px" };
const cardStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px 20px" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" };
const countPillStyle: React.CSSProperties = { flexShrink: 0, fontSize: 11, fontWeight: 850, color: "var(--text-3)", background: "var(--border-1)", border: "1px solid var(--border-2)", borderRadius: 999, padding: "4px 10px" };
const chartStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 7 };
const chartItemStyle: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 };
const chartValueStyle: React.CSSProperties = { minHeight: 13, color: "var(--text-2)", fontSize: 10, fontWeight: 900, lineHeight: 1 };
const chartBarAreaStyle: React.CSSProperties = { position: "relative", width: "100%", height: 118 };
const chartMidlineStyle: React.CSSProperties = { position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border-3)" };
const chartBarStyle: React.CSSProperties = { position: "absolute", left: "18%", right: "18%" };
const smallLogoStyle: React.CSSProperties = { width: 25, height: 25, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", border: "1px solid var(--border-2)" };
const logoImgStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const roundStyle: React.CSSProperties = { color: "var(--text-4)", fontSize: 9, fontWeight: 900, whiteSpace: "nowrap" };
const squadAverageStyle: React.CSSProperties = { width: "fit-content", display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 12, color: "var(--text-3)", fontWeight: 850, textDecoration: "none" };
const teamAverageLabelStyle: React.CSSProperties = { fontSize: 15, fontWeight: 950 };
const averageRatingBadgeStyle: React.CSSProperties = { minWidth: 50, borderRadius: 9, padding: "5px 11px 6px", color: "var(--text-1)", fontSize: 16, fontWeight: 950, lineHeight: 1, textAlign: "center" };
const teamRankStyle: React.CSSProperties = { color: "var(--text-3)", fontSize: 12, fontWeight: 900 };
const squadGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: 14, rowGap: 18 };
const playerTileStyle: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", color: "inherit" };
const tileRankStyle: React.CSSProperties = { height: 15, color: "var(--text-3)", fontSize: 11, fontWeight: 950, lineHeight: 1, marginBottom: 3 };
const playerImageWrapStyle: React.CSSProperties = { width: 62, height: 62, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border-3)", flexShrink: 0, position: "relative", zIndex: 1 };
const playerImageStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" };
const tileRatingStyle: React.CSSProperties = { minWidth: 50, marginTop: -12, borderRadius: 9, padding: "4px 9px 5px", color: "var(--text-1)", fontSize: 16, fontWeight: 950, lineHeight: 1, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.35)", position: "relative", zIndex: 2 };
const emptyStateStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" };
