import path from "path";
import fs from "fs";
import Link from "next/link";
import { BackButton, TeamLogoImage } from "./TeamClient";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";

const API_SPORTS_TO_SQUIGGLE: Record<number, string> = Object.fromEntries(
  Object.entries(API_SPORTS_MATCH_IDS).map(([squiggleId, apiId]) => [Number(apiId), squiggleId])
);

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

type TeamBlock = {
  team?: { id?: number };
  statistics?: {
    disposals?: { disposals?: number; kicks?: number; handballs?: number; free_kicks?: number };
    stoppages?: { hitouts?: number; clearances?: number };
    marks?: number;
    scoring?: { goals?: number; assists?: number; behinds?: number };
    defence?: { tackles?: number };
  };
};

type TeamStatGame = {
  gameId: number;
  date: string;
  teams: TeamBlock[];
};

type PlayerStatGame = {
  gameId: number;
  date: string;
  teams?: {
    team?: { id: number };
    players?: {
      player?: { id: number };
      goals?: { total?: number; assists?: number };
      behinds?: number;
      disposals?: number;
      kicks?: number;
      handballs?: number;
      marks?: number;
      tackles?: number;
      hitouts?: number;
      clearances?: number;
      free_kicks?: { for?: number; against?: number };
    }[];
  }[];
};

type SquiggleGame = {
  id: number;
  round: number | string;
  hteam?: string;
  ateam?: string;
  hscore?: number | null;
  ascore?: number | null;
};

const TEAM_SLUG_MAP: Record<string, { name: string; id: number }> = {
  adelaide: { name: "Adelaide", id: 1 },
  brisbanelions: { name: "Brisbane Lions", id: 2 },
  carlton: { name: "Carlton", id: 3 },
  collingwood: { name: "Collingwood", id: 4 },
  essendon: { name: "Essendon", id: 5 },
  fremantle: { name: "Fremantle", id: 6 },
  geelong: { name: "Geelong", id: 7 },
  hawthorn: { name: "Hawthorn", id: 8 },
  melbourne: { name: "Melbourne", id: 9 },
  northmelbourne: { name: "North Melbourne", id: 10 },
  portadelaide: { name: "Port Adelaide", id: 11 },
  richmond: { name: "Richmond", id: 12 },
  stkilda: { name: "St Kilda", id: 13 },
  sydney: { name: "Sydney", id: 14 },
  westcoast: { name: "West Coast", id: 15 },
  westernbulldogs: { name: "Western Bulldogs", id: 16 },
  goldcoast: { name: "Gold Coast", id: 17 },
  gws: { name: "GWS", id: 18 },
};

const TEAM_ID_MAP: Record<number, string> = {
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

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c",
  "Brisbane Lions": "#a50034",
  Carlton: "#031a35",
  Collingwood: "#111111",
  Essendon: "#cc0000",
  Fremantle: "#4b1979",
  Geelong: "#003b73",
  "Gold Coast": "#c0392b",
  GWS: "#e05a1a",
  "Greater Western Sydney": "#e05a1a",
  "Greater Western Sydney Giants": "#e05a1a",
  "GWS Giants": "#e05a1a",
  Hawthorn: "#6b3a1f",
  Melbourne: "#c8102e",
  "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999",
  Richmond: "#1a1a1a",
  "St Kilda": "#c8102e",
  Sydney: "#c0392b",
  "West Coast": "#003087",
  "Western Bulldogs": "#1a4abf",
};

const LOGO_MAP: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png",
  "Greater Western Sydney": "/team-logos/giants.png",
  "Greater Western Sydney Giants": "/team-logos/giants.png",
  "GWS Giants": "/team-logos/giants.png",
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

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows",
  "Brisbane Lions": "lions",
  Carlton: "blues",
  Collingwood: "magpies",
  Essendon: "bombers",
  Fremantle: "dockers",
  Geelong: "cats",
  "Gold Coast": "suns",
  GWS: "giants",
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

const PLAYER_IMAGE_ID_OVERRIDES: Record<string, string> = {
  lachlanschultz: "lachieschultz",
  lachlansullivan: "lachiesullivan",
  samuelwicks: "samwicks",
};

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mixColor(a: string, b: string, amount: number) {
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = parseInt(ah.substring(0, 2), 16);
  const ag = parseInt(ah.substring(2, 4), 16);
  const ab = parseInt(ah.substring(4, 6), 16);
  const br = parseInt(bh.substring(0, 2), 16);
  const bg = parseInt(bh.substring(2, 4), 16);
  const bb = parseInt(bh.substring(4, 6), 16);
  return `rgb(${Math.round(ar + amount * (br - ar))}, ${Math.round(ag + amount * (bg - ag))}, ${Math.round(ab + amount * (bb - ab))})`;
}

function foopyColor(value: number) {
  const v = Math.max(1, Math.min(10, value));
  const anchors: [number, string][] = [
    [1, "#ef4444"],
    [3, "#f97316"],
    [4, "#facc15"],
    [5, "#84cc16"],
    [6, "#22c55e"],
    [7, "#16a34a"],
    [8.5, "#3b82f6"],
    [10, "#ffd700"],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [lo, lowColor] = anchors[i];
    const [hi, highColor] = anchors[i + 1];
    if (v <= hi) return mixColor(lowColor, highColor, (v - lo) / (hi - lo));
  }
  return "#ffd700";
}

function foopyRating(p: {
  goals: number;
  goalAssists: number;
  behinds: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  disposals: number;
  clearances: number;
  freesFor: number;
  freesAgainst: number;
}) {
  let score =
    p.goals * 5.5 +
    p.goalAssists * 1.5 +
    p.behinds * 1.2 +
    p.kicks * 0.75 +
    p.handballs * 0.55 +
    p.marks * 1 +
    p.tackles * 1.8 +
    p.hitouts * 0.35 +
    p.clearances * 0.5 +
    p.freesFor * 0.3 -
    p.freesAgainst * 0.4;

  if (p.goals >= 3) score += 3;
  if (p.goals >= 5) score += 5;
  if (p.goals >= 7) score += 10;
  if (p.goals >= 10) score += 18;
  if (p.disposals >= 25) score += 3;
  if (p.disposals >= 30) score += 4;
  if (p.tackles >= 8) score += 4;
  if (p.marks >= 10) score += 3;
  if (p.hitouts >= 25) score += 3;
  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(2));
}

function aflScore(goals: number, behinds: number) {
  return goals * 6 + behinds;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function playerImagePath(player: PlayerInfo) {
  const folder = TEAM_FOLDER[player.team];
  if (!folder) return "";
  const rawId = player.id.replace(/_/g, "");
  const imageId = PLAYER_IMAGE_ID_OVERRIDES[rawId] ?? rawId;
  return `/players/${folder}/${imageId}.png`;
}

function normalizeTeamName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    brisbane: "brisbanelions",
    geelongcats: "geelong",
    greaterwesternsydney: "gws",
    gwsgiants: "gws",
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
        <div style={topBarStyle}>
          <BackButton />
        </div>
        <div style={emptyStateStyle}>
          <p style={{ color: "#64748b", fontWeight: 900, fontSize: 16 }}>Team not found</p>
        </div>
      </main>
    );
  }

  const dataDir = path.join(process.cwd(), "app", "data");
  const { name: teamName, id: teamId } = team;
  const color = TEAM_COLORS[teamName] ?? "#1e293b";
  const logo = LOGO_MAP[teamName] ?? "/team-logos/crows.png";

  const players: PlayerInfo[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const seasonData: SeasonStats[] = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const teamStatsRaw: Record<string, TeamStatGame> = JSON.parse(fs.readFileSync(path.join(dataDir, "team-stats.json"), "utf8"));
  const gameStats: Record<string, PlayerStatGame> = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  const foopyMap = new Map<number, number[]>();
  for (const game of Object.values(gameStats)) {
    for (const block of game.teams ?? []) {
      for (const playerStats of block.players ?? []) {
        const playerId = playerStats.player?.id;
        if (!playerId) continue;
        const rating = foopyRating({
          goals: num(playerStats.goals?.total),
          goalAssists: num(playerStats.goals?.assists),
          behinds: num(playerStats.behinds),
          kicks: num(playerStats.kicks),
          handballs: num(playerStats.handballs),
          marks: num(playerStats.marks),
          tackles: num(playerStats.tackles),
          hitouts: num(playerStats.hitouts),
          disposals: num(playerStats.disposals),
          clearances: num(playerStats.clearances),
          freesFor: num(playerStats.free_kicks?.for),
          freesAgainst: num(playerStats.free_kicks?.against),
        });
        if (rating > 0) {
          if (!foopyMap.has(playerId)) foopyMap.set(playerId, []);
          foopyMap.get(playerId)!.push(rating);
        }
      }
    }
  }

  function playerAverageFoopy(player: PlayerInfo) {
      const statIds = new Set<number>();
      if (player.apiSportsId) statIds.add(player.apiSportsId);
      for (const statId of player.statsIds ?? []) statIds.add(statId);

      const ratings: number[] = [];
      for (const statId of statIds) {
        for (const rating of foopyMap.get(statId) ?? []) ratings.push(rating);
      }

    return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
  }

  const roster = players
    .filter((player) => player.team === teamName)
    .map((player) => {
      const season = seasonData.find((stats) => stats.id === player.id);
      const avgFoopy = playerAverageFoopy(player);
      return { player, season, avgFoopy };
    })
    .sort((a, b) => (b.avgFoopy ?? -1) - (a.avgFoopy ?? -1));

  const ratedPlayers = roster.filter((row) => row.avgFoopy !== null);
  const teamAvgFoopy = ratedPlayers.length
    ? ratedPlayers.reduce((sum, row) => sum + row.avgFoopy!, 0) / ratedPlayers.length
    : null;
  const ratedRoster = roster.filter((row) => row.avgFoopy !== null);
  const teamAverageRankings = Object.values(TEAM_SLUG_MAP)
    .map((teamInfo) => {
      const rated = players
        .filter((player) => player.team === teamInfo.name)
        .map((player) => playerAverageFoopy(player))
        .filter((rating): rating is number => rating !== null);
      const average = rated.length ? rated.reduce((sum, rating) => sum + rating, 0) / rated.length : null;
      return { name: teamInfo.name, average };
    })
    .filter((row): row is { name: string; average: number } => row.average !== null)
    .sort((a, b) => b.average - a.average);
  const teamAverageRank = teamAverageRankings.findIndex((row) => row.name === teamName) + 1;

  const teamGames = Object.values(teamStatsRaw)
    .filter((game) => game.teams?.some((block) => block.team?.id === teamId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const squiggleMap = new Map<number, SquiggleGame>();

  try {
    const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${new Date().getFullYear()}`, {
      headers: { "User-Agent": "Foopy AFL App (foopy.app)" },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const json = await res.json();
      for (const game of json.games ?? []) squiggleMap.set(Number(game.id), game);
    }
  } catch {}

  function fallbackScore(game: TeamStatGame) {
    const us = game.teams.find((block) => block.team?.id === teamId);
    const them = game.teams.find((block) => block.team?.id !== teamId);
    return {
      ourScore: aflScore(num(us?.statistics?.scoring?.goals), num(us?.statistics?.scoring?.behinds)),
      theirScore: aflScore(num(them?.statistics?.scoring?.goals), num(them?.statistics?.scoring?.behinds)),
      opponent: TEAM_ID_MAP[them?.team?.id ?? 0] ?? "",
    };
  }

  function getGameScore(game: TeamStatGame) {
    const fallback = fallbackScore(game);
    const squiggleId = API_SPORTS_TO_SQUIGGLE[game.gameId];
    const squiggle = squiggleId ? squiggleMap.get(Number(squiggleId)) : null;

    if (!squiggle || squiggle.hscore == null || squiggle.ascore == null) return fallback;

    const homeScore = num(squiggle.hscore);
    const awayScore = num(squiggle.ascore);

    if (teamMatches(squiggle.hteam, teamName)) {
      return {
        ourScore: homeScore,
        theirScore: awayScore,
        opponent: squiggle.ateam ?? fallback.opponent,
      };
    }

    if (teamMatches(squiggle.ateam, teamName)) {
      return {
        ourScore: awayScore,
        theirScore: homeScore,
        opponent: squiggle.hteam ?? fallback.opponent,
      };
    }

    return fallback;
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let totalMargin = 0;

  for (const game of teamGames) {
    const { ourScore, theirScore } = getGameScore(game);
    totalMargin += ourScore - theirScore;

    if (ourScore > theirScore) wins += 1;
    else if (ourScore === theirScore) draws += 1;
    else losses += 1;
  }

  const played = wins + draws + losses;
  const winPct = played > 0 ? Math.round((wins / played) * 100) : null;
  const avgMargin = played > 0 ? totalMargin / played : null;

  const recentGames = teamGames.slice(0, 8).map((game) => {
    const { ourScore, theirScore, opponent } = getGameScore(game);
    return {
      game,
      opponent,
      ourScore,
      theirScore,
      margin: ourScore - theirScore,
      squiggleId: API_SPORTS_TO_SQUIGGLE[game.gameId],
    };
  });

  const maxMargin = Math.max(...recentGames.map((game) => Math.abs(game.margin)), 1);

  return (
    <main style={pageStyle} className="page-enter">
      <div style={topBarStyle}>
        <BackButton />
      </div>

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
                  <span style={{ ...recordPillStyle, color: foopyColor(teamAvgFoopy), background: "rgba(255,255,255,.06)" }}>
                    {teamAvgFoopy.toFixed(1)} Foopy
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {played > 0 && (
          <section style={cardStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionLabel}>Season record</span>
              <span style={countPillStyle}>{played} games</span>
            </div>
            <div style={recordGridStyle}>
              <MetricCard label="Wins" value={String(wins)} accent={color} />
              <MetricCard label="Win %" value={winPct !== null ? `${winPct}%` : "-"} />
              <MetricCard label="Losses" value={String(losses)} compact />
              <MetricCard label="Draws" value={String(draws)} compact />
              <MetricCard
                label="Avg Margin"
                value={avgMargin !== null ? `${avgMargin > 0 ? "+" : ""}${avgMargin.toFixed(1)}` : "-"}
                compact
              />
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
                const positive = game.margin > 0;
                const draw = game.margin === 0;
                const barColor = positive ? "#22c55e" : draw ? "#facc15" : "#ef4444";
                const height = draw ? 5 : Math.max(10, (Math.abs(game.margin) / maxMargin) * 54);
                const opponentLogo = LOGO_MAP[game.opponent] ?? "";
                const round = game.squiggleId ? squiggleMap.get(Number(game.squiggleId))?.round : null;

                return (
                  <div key={game.game.gameId} style={chartItemStyle}>
                    <div style={chartValueStyle}>{game.margin > 0 ? "+" : ""}{game.margin}</div>
                    <div style={chartBarAreaStyle}>
                      <div style={chartMidlineStyle} />
                      <div
                        style={{
                          ...chartBarStyle,
                          height,
                          background: barColor,
                          bottom: positive || draw ? "50%" : "auto",
                          top: game.margin < 0 ? "50%" : "auto",
                          borderRadius: positive ? "5px 5px 1px 1px" : game.margin < 0 ? "1px 1px 5px 5px" : 5,
                        }}
                      />
                    </div>
                    <div style={smallLogoStyle}>{opponentLogo && <img src={opponentLogo} alt={game.opponent} style={logoImgStyle} />}</div>
                    <div style={roundStyle}>{round ? `R${round}` : formatDate(game.game.date)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {recentGames.length > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabel}>Season results</div>
            <div style={listStyle}>
              {recentGames.map((game) => {
                const round = game.squiggleId ? squiggleMap.get(Number(game.squiggleId))?.round : null;
                const resultColor = game.margin > 0 ? "#22c55e" : game.margin === 0 ? "#facc15" : "#ef4444";
                const resultLabel = game.margin > 0 ? "W" : game.margin === 0 ? "D" : "L";
                const opponentLogo = LOGO_MAP[game.opponent] ?? "";

                return (
                  <Link key={game.game.gameId} href={game.squiggleId ? `/match/${game.squiggleId}` : "#"} style={resultRowStyle}>
                    <div style={resultLogoWrapStyle}>{opponentLogo && <img src={opponentLogo} alt={game.opponent} style={logoImgStyle} />}</div>
                    <div style={resultBodyStyle}>
                      <div style={resultTitleStyle}>vs {game.opponent}</div>
                      <div style={resultSubStyle}>
                        {round ? `Round ${round}` : formatDate(game.game.date)} - {game.ourScore}-{game.theirScore}
                        <span style={{ color: resultColor, marginLeft: 6 }}>
                          ({game.margin > 0 ? "+" : ""}{game.margin})
                        </span>
                      </div>
                    </div>
                    <div style={{ ...resultBadgeStyle, color: resultColor }}>{resultLabel}</div>
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
              <strong style={{ ...averageRatingBadgeStyle, background: foopyColor(teamAvgFoopy) }}>{teamAvgFoopy.toFixed(1)}</strong>
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

function MetricCard({ label, value, accent, compact }: { label: string; value: string; accent?: string; compact?: boolean }) {
  return (
    <div
      style={{
        ...metricCardStyle,
        gridColumn: compact ? "span 2" : "span 3",
        minHeight: compact ? 56 : 78,
        background: accent ? `${accent}18` : "rgba(255,255,255,.035)",
        borderColor: accent ? `${accent}3d` : "rgba(255,255,255,.07)",
      }}
    >
      <div style={{ ...metricLabelStyle, color: accent ? `${accent}dd` : "#64748b" }}>{label}</div>
      <div style={{ ...metricValueStyle, color: accent ?? "#f8fafc", fontSize: compact ? 20 : 31 }}>{value}</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#000",
  color: "#fff",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const topBarStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 14px) 18px 10px",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "0 12px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const heroStyle: React.CSSProperties = {
  minHeight: 158,
  borderRadius: 20,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.1)",
  background: "#080808",
  position: "relative",
};

const heroContentStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 16,
  minHeight: 158,
  padding: "22px 20px",
};

const heroTitleStyle: React.CSSProperties = {
  margin: "0 0 9px",
  color: "#fff",
  fontSize: 25,
  fontWeight: 950,
  letterSpacing: "-0.04em",
  lineHeight: 1.05,
  overflowWrap: "anywhere",
};

const heroMetaStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
  alignItems: "center",
};

const recordPillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#cbd5e1",
  background: "rgba(0,0,0,.28)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 999,
  padding: "4px 8px",
};

const cardStyle: React.CSSProperties = {
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
  padding: "17px 14px 18px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const countPillStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 850,
  color: "#64748b",
  background: "rgba(255,255,255,.055)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 999,
  padding: "4px 10px",
};

const recordGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: 8,
};

const metricCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 14,
  padding: "12px 12px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const metricValueStyle: React.CSSProperties = {
  fontWeight: 950,
  letterSpacing: "-0.04em",
  lineHeight: 1,
};

const chartStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
  gap: 7,
};

const chartItemStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
};

const chartValueStyle: React.CSSProperties = {
  minHeight: 13,
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
};

const chartBarAreaStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 118,
};

const chartMidlineStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "50%",
  height: 1,
  background: "rgba(255,255,255,.16)",
};

const chartBarStyle: React.CSSProperties = {
  position: "absolute",
  left: "18%",
  right: "18%",
};

const smallLogoStyle: React.CSSProperties = {
  width: 25,
  height: 25,
  borderRadius: "50%",
  overflow: "hidden",
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.1)",
};

const logoImgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const roundStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 9,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const resultRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 13px",
  borderRadius: 14,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.07)",
  textDecoration: "none",
  color: "inherit",
};

const resultLogoWrapStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  overflow: "hidden",
  flexShrink: 0,
  background: "rgba(255,255,255,.08)",
};

const resultBodyStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const resultTitleStyle: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 850,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const resultSubStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 750,
  marginTop: 3,
};

const resultBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 32,
  textAlign: "center",
  fontSize: 19,
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const squadAverageStyle: React.CSSProperties = {
  width: "fit-content",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 2px",
  marginBottom: 12,
  color: "#64748b",
  fontWeight: 850,
  textDecoration: "none",
};

const teamAverageLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
};

const averageRatingBadgeStyle: React.CSSProperties = {
  minWidth: 50,
  borderRadius: 9,
  padding: "5px 11px 6px",
  color: "#fff",
  fontSize: 16,
  fontWeight: 950,
  lineHeight: 1,
  textAlign: "center",
};

const teamRankStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
};

const squadGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  columnGap: 14,
  rowGap: 18,
};

const playerTileStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
};

const tileRankStyle: React.CSSProperties = {
  height: 15,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  lineHeight: 1,
  marginBottom: 3,
};

const playerImageWrapStyle: React.CSSProperties = {
  width: 62,
  height: 62,
  borderRadius: "50%",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.12)",
  flexShrink: 0,
  position: "relative",
  zIndex: 1,
};

const playerImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center top",
  display: "block",
};

const tileRatingStyle: React.CSSProperties = {
  minWidth: 50,
  marginTop: -12,
  borderRadius: 9,
  padding: "4px 9px 5px",
  color: "#fff",
  fontSize: 16,
  fontWeight: 950,
  lineHeight: 1,
  textAlign: "center",
  boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  position: "relative",
  zIndex: 2,
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "50vh",
};
