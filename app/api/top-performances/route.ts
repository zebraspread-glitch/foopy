import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/lib/foopyRating";

export const dynamic = "force-dynamic";

const SEASON = new Date().getFullYear().toString();

// Reverse map: apiSportsId (string) → squiggleId (string)
const apiSportsToSquiggle = new Map<string, string>();
for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
  apiSportsToSquiggle.set(String(apiId), sqId);
}

const CLUB_FOLDER: Record<string, string> = {
  Adelaide:"crows","Adelaide Crows":"crows",Brisbane:"lions","Brisbane Lions":"lions",
  Carlton:"blues",Collingwood:"magpies",Essendon:"bombers",Fremantle:"dockers",
  Geelong:"cats","Geelong Cats":"cats","Gold Coast":"suns","Gold Coast Suns":"suns",
  GWS:"giants","GWS Giants":"giants","Greater Western Sydney":"giants",
  Hawthorn:"hawks","Hawthorn Hawks":"hawks",Melbourne:"demons","Melbourne Demons":"demons",
  "North Melbourne":"kangaroos","North Melbourne Kangaroos":"kangaroos",
  "Port Adelaide":"power","Port Adelaide Power":"power",Richmond:"tigers",
  "St Kilda":"saints",Sydney:"swans","Sydney Swans":"swans",
  "West Coast":"eagles","West Coast Eagles":"eagles","Western Bulldogs":"bulldogs",
};

function playerImagePath(name: string, team: string): string {
  const folder = CLUB_FOLDER[team] ?? team.toLowerCase().replace(/[^a-z]/g, "");
  if (!folder) return "";
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `/players/${folder}/${slug}.png`;
}

export type PerformanceEntry = {
  rank: number;
  name: string;
  team: string;
  rating: number;
  date: string;
  round: number | null;
  opponent: string | null;
  image: string;
  gameApiSportsId: string;
  squiggleGameId: string | null;
  goals: number;
  disposals: number;
  kicks: number;
  marks: number;
  tackles: number;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filter   = searchParams.get("filter") ?? "round";   // round|month|season|all|lowest
  const roundNum = Number(searchParams.get("round") ?? 0);

  // ── 1. Load merged game-stats ──────────────────────────────────────────────
  const dataDir = path.join(process.cwd(), "app", "data");
  const gameStats: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
  );
  const playersArr: any[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "players.json"), "utf8")
  );

  // Supplement with match_cache
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const isSeasonView = filter === "season" || filter === "season_worst";
    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      isSeasonView
        ? supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false)
        : supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false)
            .gte("fetched_at", new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
    ]);
    const rows = [
      ...(finalRows ?? []),
      ...(recentRows ?? []).filter(r => !(finalRows ?? []).some(f => String(f.game_id) === String(r.game_id))),
    ];
    const staticIds = new Set(Object.keys(gameStats));
    for (const row of rows) {
      const gameId = String(row.game_id);
      if (staticIds.has(gameId)) continue;
      const payload = row.payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const teams = responseItems.length > 0 && Array.isArray(responseItems[0]?.teams)
        ? responseItems[0].teams : responseItems;
      if (!teams.length) continue;
      const date = responseItems[0]?.game?.date?.slice(0, 10) ?? "";
      gameStats[gameId] = { gameId: Number(gameId), date, teams };
    }
  } catch {}

  // ── 2. Build apiSportsId ↔ squiggleId maps ───────────────────────────────
  const apiToSquiggle = new Map<string, string>();
  const squiggleToApi = new Map<string, string>();
  for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
    apiToSquiggle.set(String(apiId), sqId);
    squiggleToApi.set(sqId, String(apiId));
  }

  // ── 3. Fetch ALL season Squiggle games once — used for filtering AND enrichment
  type SqGame = { id: string; round: number; hteam: string; ateam: string; date: string; complete: number };
  const squiggleGames: SqGame[] = [];
  // squiggleId → SqGame
  const squiggleGameInfo = new Map<string, SqGame>();
  try {
    const sq = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${SEASON}`,
      // Shared 2-min cache so user traffic can't hammer Squiggle.
      { headers: { "User-Agent": "Foopy AFL App" }, next: { revalidate: 120 } }
    );
    if (sq.ok) {
      const sqData = await sq.json();
      for (const g of sqData.games ?? []) {
        const entry: SqGame = {
          id:       String(g.id),
          round:    Number(g.round),
          hteam:    String(g.hteam ?? ""),
          ateam:    String(g.ateam ?? ""),
          date:     String(g.date ?? "").slice(0, 10),
          complete: Number(g.complete ?? 0),
        };
        squiggleGames.push(entry);
        squiggleGameInfo.set(entry.id, entry);
      }
    }
  } catch {}

  function getSquiggleInfo(apiSportsId: string): SqGame | null {
    const sqId = apiToSquiggle.get(apiSportsId);
    return sqId ? squiggleGameInfo.get(sqId) ?? null : null;
  }

  // ── 4. Determine which game IDs to include based on filter ────────────────
  let allowedGameIds: Set<string> | null = null; // null = all games

  if (filter === "round") {
    // If no round supplied, auto-detect the latest completed round
    let targetRound = roundNum;
    if (targetRound <= 0 && squiggleGames.length > 0) {
      const completed = squiggleGames.filter(g => g.complete >= 100);
      targetRound = completed.length ? Math.max(...completed.map(g => g.round)) : 1;
    }
    allowedGameIds = new Set<string>();
    for (const g of squiggleGames) {
      if (g.round === targetRound && g.complete >= 100) {
        const apiId = squiggleToApi.get(g.id);
        if (apiId) allowedGameIds.add(apiId);
      }
    }
  } else if (filter === "month") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    allowedGameIds = new Set<string>();
    for (const g of squiggleGames) {
      if (g.date >= cutoff && g.complete >= 100) {
        const apiId = squiggleToApi.get(g.id);
        if (apiId) allowedGameIds.add(apiId);
      }
    }
  } else if (filter === "season") {
    allowedGameIds = new Set<string>(
      Object.entries(gameStats)
        .filter(([, g]) => String(g.date ?? "").startsWith(SEASON))
        .map(([id]) => id)
    );
  }
  // "season_worst" → allowedGameIds stays null (season filter applied in loop)

  // ── 5. Build player lookup by apiSportsId ─────────────────────────────────
  const playerById = new Map<number, { name: string; team: string }>();
  for (const p of playersArr) {
    if (p.apiSportsId) {
      playerById.set(Number(p.apiSportsId), {
        name: String(p.name ?? p.player ?? ""),
        team: String(p.team ?? p.club ?? ""),
      });
    }
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

  // ── 5. Compute Foopy rating per player per game ────────────────────────────
  const entries: Omit<PerformanceEntry, "rank">[] = [];

  for (const [gameId, gameEntry] of Object.entries(gameStats)) {
    if (allowedGameIds !== null && !allowedGameIds.has(gameId)) continue;
    // season and season_worst only include current-season games
    if (filter === "season" || filter === "season_worst") {
      if (!String(gameEntry.date ?? "").startsWith(SEASON)) continue;
    }

    const sqInfo = getSquiggleInfo(gameId);

    const teams: any[] = gameEntry.teams ?? [];

    for (const teamEntry of teams) {
      // Determine this team's name — try game data first (resolved per-player below)
      const teamNameFromData = String(teamEntry.team?.name ?? "");

      for (const pe of teamEntry.players ?? []) {
        const apiPlayerId = Number(pe.player?.id ?? 0);
        if (!apiPlayerId) continue;

        const info = playerById.get(apiPlayerId);
        const name = info?.name || String(pe.player?.name ?? "");
        // Use players.json team (reliable) > game data team
        const team = info?.team || teamNameFromData;
        if (!name) continue;

        // Work out opponent using the player's known team against Squiggle home/away
        let opponent: string | null = null;
        if (sqInfo) {
          const normTeam = norm(team); // use resolved team, not raw teamNameFromData
          const normH = norm(sqInfo.hteam);
          const normA = norm(sqInfo.ateam);
          if (normTeam && normH && normA) {
            opponent = normTeam === normH || normH.includes(normTeam) || normTeam.includes(normH)
              ? sqInfo.ateam
              : sqInfo.hteam;
          } else {
            opponent = sqInfo.ateam || sqInfo.hteam || null;
          }
        }

        const s = pe.statistics ?? pe;
        const n = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
        const goals     = n(s.goals?.total ?? s.goals);
        const kicks     = n(s.kicks);
        const handballs = n(s.handballs);
        const disposals = n(s.disposals) || kicks + handballs;
        const marks     = n(s.marks);
        const tackles   = n(s.tackles);
        const hitouts   = n(s.hitouts);
        const behinds   = n(s.behinds);

        // An all-zero stat line means the player didn't take the field (the API
        // still lists them on the squad). They didn't play, so they have no
        // performance to rate — exclude them entirely rather than handing out a
        // floor rating that would dominate "Season Worst".
        const didNotPlay =
          goals === 0 && behinds === 0 && kicks === 0 && handballs === 0 &&
          disposals === 0 && marks === 0 && tackles === 0 && hitouts === 0;
        if (didNotPlay) continue;

        const rating = foopyRating({
          goals,
          goalAssists:  s.goals?.assists ?? s.goalAssists ?? s.goal_assists,
          behinds:      s.behinds,
          kicks,
          handballs,
          marks,
          tackles,
          hitouts:      s.hitouts,
          disposals,
          clearances:   s.clearances?.total ?? s.clearances,
          freesFor:     s.free_kicks?.for   ?? s.freesFor    ?? s.frees_for,
          freesAgainst: s.free_kicks?.against ?? s.freesAgainst ?? s.frees_against,
        });

        if (rating <= 0 && filter !== "season_worst") continue;

        entries.push({
          name,
          team,
          rating,
          date: String(gameEntry.date ?? ""),
          round: sqInfo?.round ?? null,
          opponent,
          image: playerImagePath(name, team),
          gameApiSportsId: gameId,
          squiggleGameId: apiToSquiggle.get(gameId) ?? null,
          goals,
          disposals,
          kicks,
          marks,
          tackles,
        });
      }
    }
  }

  // ── 6. Sort & trim ─────────────────────────────────────────────────────────
  if (filter === "season_worst") {
    entries.sort((a, b) => a.rating - b.rating);
  } else {
    entries.sort((a, b) => b.rating - a.rating);
  }

  // Deduplicate: keep only the best (or worst) performance per player per game
  // (same player can appear twice if they appear in both team arrays — shouldn't happen but guard anyway)
  const seen = new Set<string>();
  const deduped: typeof entries = [];
  for (const e of entries) {
    const key = `${e.name}::${e.gameApiSportsId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  const limit = (filter === "season" || filter === "season_worst") ? 1000 : 100;
  const top100 = deduped.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));

  return NextResponse.json({ entries: top100 }, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
  });
}
