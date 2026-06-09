import path from "path";
import fs from "fs";
import Link from "next/link";
import { BackButton, PlayerHeroImage } from "./PlayerClient";
import { PlayerPassSection } from "./PlayerPassSection";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { supabaseServer } from "@/app/lib/supabase-server";
import { foopyRating, foopyColor } from "@/app/lib/foopyRating";
import { computeAvgFoopyMap } from "@/app/lib/computeAvgFoopy.server";

// Reverse map: API Sports game ID → Squiggle game ID
const API_SPORTS_TO_SQUIGGLE: Record<number, string> = Object.fromEntries(
  Object.entries(API_SPORTS_MATCH_IDS).map(([squiggleId, apiSportsId]) => [Number(apiSportsId), squiggleId])
);

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerInfo  = { id: string; name: string; team: string; apiSportsId?: number | null; eventIds?: number[] | number; statsIds?: number[] };
type SeasonStats = {
  id: string; position?: string; jerseyNumber?: number; games?: number;
  goals?: number; goalAssists?: number; behinds?: number;
  disposals?: number; kicks?: number; handballs?: number;
  marks?: number; tackles?: number; hitouts?: number; clearances?: number;
  goalAvg?: number; freesFor?: number; freesAgainst?: number;
  totalKicks?: number; totalHandballs?: number; totalMarks?: number;
  totalTackles?: number; totalHitouts?: number; totalClearances?: number;
};
type GamePerf = {
  gameId: number; squiggleId: string | null; date: string; foopy: number;
  goals: number; goalAssists: number; behinds: number;
  disposals: number; kicks: number; handballs: number;
  marks: number; tackles: number; hitouts: number; clearances: number;
  freesFor: number; freesAgainst: number;
  jerseyNumber: number | null;
  opponentTeam: string; round: number | string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}


const TEAM_ID_MAP: Record<number, string> = {
  1: "Adelaide", 2: "Brisbane Lions", 3: "Carlton", 4: "Collingwood",
  5: "Essendon", 6: "Fremantle", 7: "Geelong", 8: "Hawthorn",
  9: "Melbourne", 10: "North Melbourne", 11: "Port Adelaide", 12: "Richmond",
  13: "St Kilda", 14: "Sydney", 15: "West Coast", 16: "Western Bulldogs",
  17: "Gold Coast", 18: "GWS",
};

function getLogoSrc(team: string): string {
  const map: Record<string, string> = {
    Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
    Brisbane: "/team-logos/lions.png", Carlton: "/team-logos/blues.png",
    Collingwood: "/team-logos/magpies.png", Essendon: "/team-logos/bombers.png",
    Fremantle: "/team-logos/dockers.png", Geelong: "/team-logos/cats.png",
    "Geelong Cats": "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
    GWS: "/team-logos/giants.png", "GWS Giants": "/team-logos/giants.png",
    "Greater Western Sydney": "/team-logos/giants.png",
    Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
    "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
    Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
    Sydney: "/team-logos/swans.png", "West Coast": "/team-logos/eagles.png",
    "Western Bulldogs": "/team-logos/bulldogs.png",
  };
  return map[team] ?? "/team-logos/crows.png";
}

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns", gwsgiants: "giants",
  gws: "giants", hawthorn: "hawks", melbourne: "demons",
  northmelbourne: "kangaroos", portadelaide: "power", richmond: "tigers",
  stkilda: "saints", sydney: "swans", westcoast: "eagles", westernbulldogs: "bulldogs",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Brisbane: "#a50034",
  Carlton: "#031a35", Collingwood: "#1e1e28", Essendon: "#cc0000",
  Fremantle: "#4b1979", "Geelong Cats": "#003b73", Geelong: "#003b73",
  "Gold Coast": "#c0392b", "GWS Giants": "#e05a1a", GWS: "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

function slugTeam(t: string) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function teamColor(t: string) { return TEAM_COLORS[t] ?? "#1e293b"; }
function idList(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const id = Number(value);
  return Number.isFinite(id) ? [id] : [];
}
function canonicalTeam(t: string) {
  const key = slugTeam(t);
  const aliases: Record<string, string> = {
    adelaidecrows: "adelaide",
    brisbanelions: "brisbane",
    carltonblues: "carlton",
    collingwoodmagpies: "collingwood",
    essendonbombers: "essendon",
    fremantledockers: "fremantle",
    geelongcats: "geelong",
    goldcoastsuns: "goldcoast",
    gwsgiants: "gws",
    greaterwesternsydney: "gws",
    greaterwesternsydneygiants: "gws",
    hawthornhawks: "hawthorn",
    melbournedemons: "melbourne",
    northmelbournekangaroos: "northmelbourne",
    portadelaidepower: "portadelaide",
    richmondtigers: "richmond",
    stkildasaints: "stkilda",
    sydneyswans: "sydney",
    westcoasteagles: "westcoast",
  };

  return aliases[key] ?? key;
}

function teamMatches(a: string, b: string) {
  return canonicalTeam(a) === canonicalTeam(b);
}
function playerImgSrc(name: string, team: string) {
  const slug   = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const folder = CLUB_FOLDER[slugTeam(team)] ?? slugTeam(team);
  return `/players/${folder}/${slug}.png`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Page (Server Component) ───────────────────────────────────────────────────

export default async function PlayerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dataDir = path.join(process.cwd(), "app", "data");

  const players:    PlayerInfo[]    = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const seasonData: SeasonStats[]   = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const gameStats:  Record<string, {
    gameId: number; date: string;
    teams: {
  team?: { id: number; name?: string };
  players: {
    player: { id: number };
    goals: { total: number; assists: number };
    behinds: number;
    disposals: number;
    kicks: number;
    handballs: number;
    marks: number;
    tackles: number;
    hitouts: number;
    clearances: number;
    free_kicks: { for: number; against: number };
  }[];
}[];
  }> = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  const player = players.find(p => p.id === slug) ?? null;

  if (!player) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}><BackButton /></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 12 }}>
          <div style={{ fontSize: 48 }}>🏈</div>
          <p style={{ color: "var(--text-3)", fontWeight: 800, fontSize: 16 }}>Player not found</p>
        </div>
      </main>
    );
  }

  const season = seasonData.find(p => p.id === slug) ?? null;

  // Fetch Squiggle for round numbers + completed game detection
  const squiggleMap = new Map<number, { round: number | string; hteam: string; ateam: string; complete: number; is_final: number; date: string }>();
  try {
    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${new Date().getFullYear()}`,
      { headers: { "User-Agent": "Foopy AFL App (foopy.app)" }, cache: "no-store" }
    );
    if (res.ok) {
      const json = await res.json();
      for (const g of json.games ?? []) {
        squiggleMap.set(Number(g.id), {
          round: g.round, hteam: g.hteam, ateam: g.ateam,
          complete: Number(g.complete ?? 0), is_final: Number(g.is_final ?? 0),
          date: g.date ?? "",
        });
      }
    }
  } catch {}

  const recentGames: GamePerf[] = [];
  // Collect all possible player IDs: apiSportsId + eventIds + statsIds (API Sports uses different IDs inconsistently)
  const allPlayerIds = new Set<number>();
  if (player.apiSportsId) allPlayerIds.add(player.apiSportsId);
  for (const eid of idList(player.eventIds)) allPlayerIds.add(eid);
  for (const sid of player.statsIds ?? []) allPlayerIds.add(sid);

  if (allPlayerIds.size > 0) {
    const matchesPlayer = (pid: number, teamId?: number) => {
      if (!allPlayerIds.has(pid)) return false;
      const statTeam = teamId ? TEAM_ID_MAP[teamId] : "";
      return !statTeam || teamMatches(statTeam, player.team);
    };
    const sorted = Object.values(gameStats)
      .filter(g => g.teams?.some(t => t.players?.some(p => matchesPlayer(p.player?.id, t.team?.id))))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const g of sorted) {
      for (const t of g.teams ?? []) {
        const ps = t.players?.find(p => matchesPlayer(p.player?.id, t.team?.id));
        if (!ps) continue;

        // Opponent = the other team in this game
        const opponentTeamEntry = g.teams.find(ot => ot !== t);
        const opponentTeamId = opponentTeamEntry?.team?.id as number | undefined;
        const opponentTeam = opponentTeamId ? (TEAM_ID_MAP[opponentTeamId] ?? "") : "";

        // game-stats uses API Sports IDs; squiggleMap uses Squiggle IDs — convert first
        const squiggleGameId = API_SPORTS_TO_SQUIGGLE[g.gameId];
        const sq = squiggleGameId ? squiggleMap.get(Number(squiggleGameId)) : undefined;

        recentGames.push({
          gameId:       g.gameId,
          squiggleId:   squiggleGameId ?? null,
          date:         g.date,
          goals:        num(ps.goals?.total),
          goalAssists:  num(ps.goals?.assists),
          behinds:      num(ps.behinds),
          disposals:    num(ps.disposals),
          kicks:        num(ps.kicks),
          handballs:    num(ps.handballs),
          marks:        num(ps.marks),
          tackles:      num(ps.tackles),
          hitouts:      num(ps.hitouts),
          clearances:   num(ps.clearances),
          freesFor:     num(ps.free_kicks?.for),
          freesAgainst: num(ps.free_kicks?.against),
          jerseyNumber: (ps as any).player?.number ?? null,
          opponentTeam,
          round:        sq?.round ?? null,
          foopy: foopyRating({
            goals: num(ps.goals?.total), goalAssists: num(ps.goals?.assists),
            behinds: num(ps.behinds), kicks: num(ps.kicks), handballs: num(ps.handballs),
            marks: num(ps.marks), tackles: num(ps.tackles), hitouts: num(ps.hitouts),
            disposals: num(ps.disposals), clearances: num(ps.clearances),
            freesFor: num(ps.free_kicks?.for), freesAgainst: num(ps.free_kicks?.against),
          }),
        });
        break;
      }
    }
  }

  // ── Supplement with match_cache for games not yet in game-stats.json ────────
  // The static JSON is only updated on redeploy. For newer games we check
  // match_cache first; if it's empty we fetch live from API Sports and cache it.
  try {
    const apiSportsIdsInJson = new Set(Object.values(gameStats).map((g: any) => Number(g.gameId)));
    const SQUIGGLE_TO_API: Record<string, number> = Object.fromEntries(
      Object.entries(API_SPORTS_MATCH_IDS).map(([sq, api]) => [sq, Number(api)])
    );


    // Find completed Squiggle games involving this player's team that aren't in the JSON
    const missingGames: { apiId: number; squiggleId: string; date: string; round: number | string | null }[] = [];
    for (const [sqId, sq] of squiggleMap.entries()) {
      const isCompleted = sq.is_final === 1 || sq.complete >= 100;
      if (!isCompleted) continue;
      const teamInGame = teamMatches(sq.hteam, player.team) || teamMatches(sq.ateam, player.team);
      if (!teamInGame) continue;
      const apiId = SQUIGGLE_TO_API[String(sqId)];
      const inJson = apiSportsIdsInJson.has(apiId);
      if (!apiId) continue;
      if (inJson) continue;
      if (recentGames.some(g => g.gameId === apiId)) continue;
      missingGames.push({ apiId, squiggleId: String(sqId), date: sq.date, round: sq.round });
    }

    if (missingGames.length > 0) {
      // 1. Pull whatever is already cached
      const { data: cacheRows } = await supabaseServer
        .from("match_cache")
        .select("game_id, payload")
        .in("game_id", missingGames.map(m => String(m.apiId)))
        .eq("data_type", "player_stats");

      const cachedIds = new Set((cacheRows ?? []).map((r: any) => String(r.game_id)));

      // 2. For any game not yet cached, fetch live from API Sports and store it
      const notCached = missingGames.filter(m => !cachedIds.has(String(m.apiId)));
      const freshRows: { game_id: string; payload: any }[] = [];

      await Promise.all(
        notCached.map(async (m) => {
          try {
            const res = await fetch(
              `https://v1.afl.api-sports.io/games/statistics/players?id=${m.apiId}`,
              {
                headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
                cache: "no-store",
              }
            );
            if (!res.ok) return;
            const json = await res.json();
            const payload = json;
            freshRows.push({ game_id: String(m.apiId), payload });
            await supabaseServer.from("match_cache").upsert(
              { game_id: String(m.apiId), data_type: "player_stats", payload, fetched_at: new Date().toISOString(), is_final: true },
              { onConflict: "game_id,data_type" }
            );
          } catch (e) {
            console.error(`[player-page] fetch error for id=${m.apiId}:`, e);
          }
        })
      );

      // 3. Merge cached + freshly-fetched rows
      const allRows = [...(cacheRows ?? []), ...freshRows];

      for (const row of allRows) {
        const meta = missingGames.find(m => String(m.apiId) === String(row.game_id));
        if (!meta) continue;
        const payload = row.payload as any;
        const responseItems: any[] = payload?.response ?? [];
        // API Sports ID endpoint returns ONE item per game with nested .teams array:
        //   [ { game: {...}, teams: [ {team, players}, {team, players} ] } ]
        // (not one item per team like the date endpoint)
        const teams: any[] =
          responseItems.length > 0 && Array.isArray(responseItems[0]?.teams)
            ? responseItems[0].teams
            : responseItems; // fallback: already flat per-team structure
        for (const t of teams) {
          const ps = (t.players ?? []).find((p: any) => allPlayerIds.has(Number(p.player?.id)));
          if (!ps) continue;
          const opponentEntry = teams.find((ot: any) => ot !== t);
          const opponentTeamId = Number(opponentEntry?.team?.id);
          const opponentTeam = (opponentTeamId && TEAM_ID_MAP[opponentTeamId]) ? TEAM_ID_MAP[opponentTeamId] : (opponentEntry?.team?.name ?? "");
          recentGames.push({
            gameId:       meta.apiId,
            squiggleId:   meta.squiggleId,
            date:         meta.date,
            goals:        num(ps.goals?.total ?? ps.goals),
            goalAssists:  num(ps.goals?.assists ?? ps.goalAssists),
            behinds:      num(ps.behinds),
            disposals:    num(ps.disposals),
            kicks:        num(ps.kicks),
            handballs:    num(ps.handballs),
            marks:        num(ps.marks),
            tackles:      num(ps.tackles),
            hitouts:      num(ps.hitouts),
            clearances:   num(ps.clearances),
            freesFor:     num(ps.free_kicks?.for ?? ps.freesFor),
            freesAgainst: num(ps.free_kicks?.against ?? ps.freesAgainst),
            jerseyNumber: ps.player?.number ?? null,
            opponentTeam,
            round:        meta.round,
            foopy: foopyRating({
              goals: num(ps.goals?.total ?? ps.goals), goalAssists: num(ps.goals?.assists ?? ps.goalAssists),
              behinds: num(ps.behinds), kicks: num(ps.kicks), handballs: num(ps.handballs),
              marks: num(ps.marks), tackles: num(ps.tackles), hitouts: num(ps.hitouts),
              disposals: num(ps.disposals), clearances: num(ps.clearances),
              freesFor: num(ps.free_kicks?.for ?? ps.freesFor), freesAgainst: num(ps.free_kicks?.against ?? ps.freesAgainst),
            }),
          });
          break;
        }
      }

      // Re-sort so most recent is first
      recentGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  } catch {}

  const color    = teamColor(player.team);
  const imgSrc   = playerImgSrc(player.name, player.team);

  // ── Compute season averages from actual game data (always up-to-date) ────────
  // recentGames includes both game-stats.json AND match_cache, so no manual
  // script or redeploy is needed for season stats to stay current.
  // A game counts if the player has any stat line for it (they actually
  // played). Ratings can now be as low as -1, so we can't filter on foopy > 0
  // — that would drop genuine but minimal games from the profile.
  const playedGames = recentGames.filter(
    g => g.disposals + g.marks + g.tackles + g.hitouts + g.goals + g.behinds + g.clearances > 0
  );
  const n = playedGames.length;
  const avg = (key: keyof GamePerf) =>
    n > 0 ? Math.round((playedGames.reduce((s, g) => s + num(g[key]), 0) / n) * 10) / 10 : 0;

  const computedSeason = n > 0 ? {
    games:        n,
    goalAvg:      avg("goals"),
    goals:        playedGames.reduce((s, g) => s + g.goals, 0),
    goalAssists:  playedGames.reduce((s, g) => s + g.goalAssists, 0),
    behinds:      playedGames.reduce((s, g) => s + g.behinds, 0),
    disposals:    avg("disposals"),
    kicks:        avg("kicks"),
    handballs:    avg("handballs"),
    marks:        avg("marks"),
    tackles:      avg("tackles"),
    hitouts:      avg("hitouts"),
    clearances:   avg("clearances"),
    freesFor:     playedGames.reduce((s, g) => s + g.freesFor, 0),
    freesAgainst: playedGames.reduce((s, g) => s + g.freesAgainst, 0),
    // Keep metadata (position, jerseyNumber) from static JSON as fallback
    position:     season?.position ?? null,
    jerseyNumber: playedGames.find(g => g.jerseyNumber != null)?.jerseyNumber ?? season?.jerseyNumber ?? null,
  } : season;  // fall back to static JSON if no game data at all

  const games    = computedSeason?.games ?? 0;
  const avgFoopy = playedGames.length
    ? (playedGames.reduce((s, g) => s + g.foopy, 0) / playedGames.length)
    : null;

  // Global foopy rank — uses the same game-stats.json + match_cache method as
  // the player profile's own avgFoopy, so rank and displayed value are consistent.
  // Pass the already-loaded gameStats to avoid re-reading the file.
  const avgFoopyMap = await computeAvgFoopyMap(gameStats as any);
  const myApiId = Number(player.apiSportsId ?? 0);
  const myMappedAvg = myApiId ? avgFoopyMap.get(myApiId) : undefined;
  // Rank = number of players with a strictly higher avgFoopy + 1 (competition ranking, handles ties).
  const foopyRank = myMappedAvg !== undefined
    ? [...avgFoopyMap.values()].filter(v => v > myMappedAvg).length + 1
    : null;
  const foopyTotal = avgFoopyMap.size;

  // Rank each stat vs all players in seasonData (only players with >= 1 game)
  function leagueRank(key: keyof SeasonStats): number | null {
    if (!computedSeason) return null;
    const myVal = computedSeason[key] as number | null | undefined;
    if (!myVal || myVal <= 0) return null;
    const qualified = seasonData.filter(p => p.id !== slug && (p.games ?? 0) >= 1);
    const rank = qualified.filter(p => ((p[key] as number) ?? 0) > myVal).length + 1;
    return rank;
  }
  function ordSuffix(n: number) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    const s = ["th","st","nd","rd"];
    return `${n}${s[n % 10] ?? "th"}`;
  }

  const statGrid = [
    { label: "Goals",      value: computedSeason?.goalAvg?.toFixed(1)    ?? "—", rank: leagueRank("goalAvg") },
    { label: "Disposals",  value: computedSeason?.disposals?.toFixed(1)  ?? "—", rank: leagueRank("disposals") },
    { label: "Kicks",      value: computedSeason?.kicks?.toFixed(1)       ?? "—", rank: leagueRank("kicks") },
    { label: "Marks",      value: computedSeason?.marks?.toFixed(1)       ?? "—", rank: leagueRank("marks") },
    { label: "Tackles",    value: computedSeason?.tackles?.toFixed(1)     ?? "—", rank: leagueRank("tackles") },
    ...(( computedSeason?.hitouts ?? 0) > 1 ? [{ label: "Hitouts", value: computedSeason!.hitouts!.toFixed(1), rank: leagueRank("hitouts") }] : []),
    { label: "Clearances", value: computedSeason?.clearances?.toFixed(1)  ?? "—", rank: leagueRank("clearances") },
    { label: "Games",      value: games > 0 ? String(games) : "—",                rank: null },
  ];

  return (
    <main style={pageStyle} className="page-enter">
      <div style={topBarStyle}><BackButton /></div>

      <div style={wrapStyle}>

        {/* ── Hero ── */}
        <section style={{ borderRadius: 20, overflow: "hidden", border: "1px solid var(--border-2)", background: "var(--bg)" }}>
          <div style={{ height: 90, background: `linear-gradient(135deg,${color}cc,${color}44)`, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 40%,var(--bg))" }} />
          </div>
          <div style={{ padding: "0 20px 24px", marginTop: -56, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
              <PlayerHeroImage src={imgSrc} name={player.name} color={color} />
              <div style={{ paddingBottom: 4 }}>
                <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "var(--text-1)", lineHeight: 1.1 }}>{player.name}</h1>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)" }}>{player.team}</span>
                  {computedSeason?.position && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 999, padding: "2px 8px" }}>{computedSeason.position}</span>
                  )}
                  {computedSeason?.jerseyNumber && (
                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)" }}>#{computedSeason.jerseyNumber}</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── Foopy rating ── */}
        {avgFoopy !== null && (
          <section style={{ ...cardStyle, display: "flex", gap: 0, padding: 0, overflow: "hidden" }}>
            {/* Left — avg rating (tappable → foopy leaderboard) */}
            <Link href="/foopy-ratings" style={{ flexShrink: 0, width: 90, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 0", borderRight: "1px solid var(--border-2)", textDecoration: "none", cursor: "pointer" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Avg Foopy</div>
              <div style={{ fontSize: 40, fontWeight: 950, letterSpacing: "-0.05em", lineHeight: 1, color: foopyColor(avgFoopy) }}>{avgFoopy.toFixed(1)}</div>
              {foopyRank !== null && (
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", marginTop: 6, letterSpacing: "0.02em" }}>
                  #{foopyRank} of {foopyTotal}
                </div>
              )}
            </Link>
            {/* Right — bar chart */}
            <div style={{ flex: 1, padding: "16px 14px 12px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Last 10 games</div>
              <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
                {[...playedGames].slice(0, 10).reverse().map((g, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{g.foopy.toFixed(1)}</span>
                    <div style={{ width: "70%", borderRadius: 4, background: foopyColor(g.foopy), height: Math.max(14, (g.foopy / 10) * 52) }} />
                    <div style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0 }}>
                      {g.opponentTeam && <img src={getLogoSrc(g.opponentTeam)} alt={g.opponentTeam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Player Pass ── */}
        <PlayerPassSection
          playerId={player.id}
          playerName={player.name}
          teamName={player.team}
          accentColor={color}
          imgSrc={imgSrc}
        />

        {/* ── Season averages ── */}
        {season && games > 0 && (
          <section style={cardStyle}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border-1)" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)", letterSpacing: "0.01em" }}>2026 Season</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{games} games</span>
            </div>

            {/* All stats in one horizontal scrollable row */}
            <div style={{ display: "flex", overflowX: "auto", gap: 0, paddingBottom: 2 }}>
              {statGrid.map(({ label, value, rank }, i) => (
                <div key={label} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  flex: "0 0 auto", minWidth: 52,
                  paddingLeft: i === 0 ? 0 : 12,
                  borderLeft: i > 0 ? "1px solid var(--border-1)" : undefined,
                  marginLeft: i > 0 ? 12 : 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 4, whiteSpace: "nowrap" as const }}>
                    {label === "Disposals" ? "DISP" : label === "Clearances" ? "CLR" : label === "Hitouts" ? "HO" : label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--text-1)", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: rank && rank <= 10 ? "#fbbf24" : "var(--text-4)", marginTop: 3, minHeight: 14 }}>
                    {rank ? ordSuffix(rank) : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent performances ── */}
        {playedGames.length > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabel}>Season performances</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {playedGames.map((g, i) => (
                <Link key={i} href={g.squiggleId ? `/match/${g.squiggleId}` : "#"} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined, textDecoration: "none", color: "inherit" }}>
                  <div style={{ minWidth: 52, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 4 }}>
                    {g.round !== null
                      ? <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)", whiteSpace: "nowrap" }}>Rd {g.round}</div>
                      : <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)" }}>{formatDate(g.date)}</div>
                    }
                    {g.opponentTeam && (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0 }}>
                        <img src={getLogoSrc(g.opponentTeam)} alt={g.opponentTeam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ width: 1, height: 40, background: "var(--surface-3)", flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    {g.goals > 0 && <StatChip label="G"  value={g.goals} />}
                    <StatChip label="D"  value={g.disposals} />
                    <StatChip label="K"  value={g.kicks} />
                    <StatChip label="M"  value={g.marks} />
                    <StatChip label="T"  value={g.tackles} />
                    {g.hitouts > 0 && <StatChip label="HO" value={g.hitouts} />}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 42, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", color: foopyColor(g.foopy) }}>{g.foopy.toFixed(1)}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-4)", letterSpacing: "0.06em" }}>FOOPY</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!season && playedGames.length === 0 && (
          <section style={cardStyle}>
            <p style={{ textAlign: "center", color: "var(--text-4)", fontWeight: 700, fontSize: 14, padding: "24px 0", margin: 0 }}>
              No stats available for this player yet.
            </p>
          </section>
        )}

      </div>
    </main>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 24 }}>
      <span style={{ fontSize: 17, fontWeight: 900, color: "var(--text-1)" }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};
const topBarStyle: React.CSSProperties = {
  maxWidth: 680, margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 12px) 20px 10px",
};
const wrapStyle: React.CSSProperties = {
  maxWidth: 680, margin: "0 auto", padding: "0 12px",
  display: "flex", flexDirection: "column", gap: 12,
};
const cardStyle: React.CSSProperties = {
  background: "var(--bg)", border: "1px solid var(--border-2)",
  borderRadius: 18, padding: "18px 16px 20px",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: "var(--text-3)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
};
