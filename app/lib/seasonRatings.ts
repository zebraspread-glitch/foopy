import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/lib/foopyRating";
import { playerImgUrl } from "@/app/lib/playerImage";

// Server-only helper. Loads the season's completed games and computes a Foopy
// rating for every player in each game — the same pipeline the Top Performances
// route uses, factored out so other features (e.g. the Brownlow predictor) can
// rank players per game consistently.

const SEASON = new Date().getFullYear().toString();

export type RatedPlayer = {
  apiPlayerId: number;
  name: string;
  team: string;
  image: string;
  rating: number;
  goals: number;
  disposals: number;
  kicks: number;
  marks: number;
  tackles: number;
};

export type GameRatings = {
  gameApiSportsId: string;
  squiggleGameId: string | null;
  date: string;
  round: number | null;
  hteam: string;
  ateam: string;
  players: RatedPlayer[];
};

type SqGame = { id: string; round: number; hteam: string; ateam: string; date: string; complete: number };

// Returns one entry per completed current-season game, each with every player's
// Foopy rating (players who didn't take the field are excluded).
export async function loadSeasonGameRatings(): Promise<GameRatings[]> {
  const dataDir = path.join(process.cwd(), "app", "data");
  const gameStats: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
  );
  const playersArr: any[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "players.json"), "utf8")
  );

  // Supplement static stats with anything cached for the live/current season.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false),
    ]);
    const rows = [
      ...(finalRows ?? []),
      ...(recentRows ?? []).filter((r) => !(finalRows ?? []).some((f) => String(f.game_id) === String(r.game_id))),
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
  } catch { /* fall back to static stats only */ }

  // apiSportsId ↔ squiggleId
  const apiToSquiggle = new Map<string, string>();
  for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
    apiToSquiggle.set(String(apiId), sqId);
  }

  // Squiggle games give round/teams/completeness.
  const squiggleGameInfo = new Map<string, SqGame>();
  try {
    const sq = await fetch(`https://api.squiggle.com.au/?q=games;year=${SEASON}`, {
      headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store",
    });
    if (sq.ok) {
      const sqData = await sq.json();
      for (const g of sqData.games ?? []) {
        squiggleGameInfo.set(String(g.id), {
          id: String(g.id),
          round: Number(g.round),
          hteam: String(g.hteam ?? ""),
          ateam: String(g.ateam ?? ""),
          date: String(g.date ?? "").slice(0, 10),
          complete: Number(g.complete ?? 0),
        });
      }
    }
  } catch { /* no enrichment */ }

  const getSquiggleInfo = (apiSportsId: string): SqGame | null => {
    const sqId = apiToSquiggle.get(apiSportsId);
    return sqId ? squiggleGameInfo.get(sqId) ?? null : null;
  };

  const playerById = new Map<number, { name: string; team: string }>();
  for (const p of playersArr) {
    if (p.apiSportsId) {
      playerById.set(Number(p.apiSportsId), {
        name: String(p.name ?? p.player ?? ""),
        team: String(p.team ?? p.club ?? ""),
      });
    }
  }

  const games: GameRatings[] = [];

  for (const [gameId, gameEntry] of Object.entries(gameStats)) {
    const sqInfo = getSquiggleInfo(gameId);
    // Only count finished, current-season games — votes are final results.
    if (!sqInfo || sqInfo.complete < 100) continue;
    if (!String(gameEntry.date ?? sqInfo.date ?? "").startsWith(SEASON)) continue;

    const players: RatedPlayer[] = [];
    for (const teamEntry of (gameEntry.teams ?? []) as any[]) {
      const teamNameFromData = String(teamEntry.team?.name ?? "");
      for (const pe of teamEntry.players ?? []) {
        const apiPlayerId = Number(pe.player?.id ?? 0);
        if (!apiPlayerId) continue;
        const info = playerById.get(apiPlayerId);
        const name = info?.name || String(pe.player?.name ?? "");
        const team = info?.team || teamNameFromData;
        if (!name) continue;

        const s = pe.statistics ?? pe;
        const n = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
        const goals = n(s.goals?.total ?? s.goals);
        const kicks = n(s.kicks);
        const handballs = n(s.handballs);
        const disposals = n(s.disposals) || kicks + handballs;
        const marks = n(s.marks);
        const tackles = n(s.tackles);
        const hitouts = n(s.hitouts);
        const behinds = n(s.behinds);

        const didNotPlay =
          goals === 0 && behinds === 0 && kicks === 0 && handballs === 0 &&
          disposals === 0 && marks === 0 && tackles === 0 && hitouts === 0;
        if (didNotPlay) continue;

        const rating = foopyRating({
          goals,
          goalAssists: s.goals?.assists ?? s.goalAssists ?? s.goal_assists,
          behinds: s.behinds,
          kicks, handballs, marks, tackles,
          hitouts: s.hitouts,
          disposals,
          clearances: s.clearances?.total ?? s.clearances,
          freesFor: s.free_kicks?.for ?? s.freesFor ?? s.frees_for,
          freesAgainst: s.free_kicks?.against ?? s.freesAgainst ?? s.frees_against,
        });

        players.push({
          apiPlayerId, name, team, image: playerImgUrl(name, team),
          rating, goals, disposals, kicks, marks, tackles,
        });
      }
    }

    if (!players.length) continue;
    games.push({
      gameApiSportsId: gameId,
      squiggleGameId: apiToSquiggle.get(gameId) ?? null,
      date: String(gameEntry.date ?? sqInfo.date ?? ""),
      round: sqInfo.round,
      hteam: sqInfo.hteam,
      ateam: sqInfo.ateam,
      players,
    });
  }

  return games;
}
