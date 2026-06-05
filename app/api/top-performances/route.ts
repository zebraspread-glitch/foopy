import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";

export const dynamic = "force-dynamic";

const SEASON = new Date().getFullYear().toString();

// Inline foopyRating — avoids importing from match utils (server-only)
function foopyRating(p: {
  goals?: any; goalAssists?: any; behinds?: any; kicks?: any; handballs?: any;
  marks?: any; tackles?: any; hitouts?: any; disposals?: any; clearances?: any;
  freesFor?: any; freesAgainst?: any;
}): number {
  const n = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
  const goals        = n(p.goals);
  const goalAssists  = n(p.goalAssists);
  const behinds      = n(p.behinds);
  const kicks        = n(p.kicks);
  const handballs    = n(p.handballs);
  const marks        = n(p.marks);
  const tackles      = n(p.tackles);
  const hitouts      = n(p.hitouts);
  const disposals    = n(p.disposals) || kicks + handballs;
  const clearances   = n(p.clearances);
  const freesFor     = n(p.freesFor);
  const freesAgainst = n(p.freesAgainst);

  let score =
    goals * 5.5 + goalAssists * 1.5 + behinds * 1.2 +
    kicks * 0.75 + handballs * 0.55 + marks * 1.0 +
    tackles * 1.8 + hitouts * 0.35 + clearances * 0.5 +
    freesFor * 0.3 - freesAgainst * 0.4;

  if (goals >= 3)  score += 3;  if (goals >= 5)  score += 5;
  if (goals >= 7)  score += 10; if (goals >= 10) score += 18;
  if (goalAssists >= 3) score += 1;
  if (disposals >= 25) score += 3; if (disposals >= 30) score += 4;
  if (tackles >= 8) score += 4; if (clearances >= 7) score += 1;
  if (marks >= 10) score += 3;  if (hitouts >= 25) score += 3;
  if (freesAgainst >= 4) score -= 1;

  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(1));
}

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
    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false)
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

  // ── 2. Determine which game IDs to include based on filter ────────────────
  let allowedGameIds: Set<string> | null = null; // null = all

  if (filter === "round" && roundNum > 0) {
    // Fetch Squiggle games for this round to get their IDs
    try {
      const sq = await fetch(
        `https://api.squiggle.com.au/?q=games;year=${SEASON};round=${roundNum}`,
        { headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store" }
      );
      if (sq.ok) {
        const sqData = await sq.json();
        const squiggleIds = new Set<string>((sqData.games ?? []).map((g: any) => String(g.id)));
        allowedGameIds = new Set<string>();
        for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
          if (squiggleIds.has(sqId)) allowedGameIds.add(String(apiId));
        }
      }
    } catch {}
  } else if (filter === "month") {
    // Use Squiggle to find completed games in the last 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const sq = await fetch(
        `https://api.squiggle.com.au/?q=games;year=${SEASON}`,
        { headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store" }
      );
      if (sq.ok) {
        const sqData = await sq.json();
        const squiggleIds = new Set<string>(
          (sqData.games ?? [])
            .filter((g: any) => {
              const gameDate = String(g.date ?? "").slice(0, 10);
              return gameDate >= cutoff && Number(g.complete) >= 100;
            })
            .map((g: any) => String(g.id))
        );
        allowedGameIds = new Set<string>();
        for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
          if (squiggleIds.has(sqId)) allowedGameIds.add(String(apiId));
        }
      }
    } catch {}
  } else if (filter === "season") {
    allowedGameIds = new Set<string>(
      Object.entries(gameStats)
        .filter(([, g]) => String(g.date ?? "").startsWith(SEASON))
        .map(([id]) => id)
    );
  }
  // "season_worst" → allowedGameIds stays null (all current-season games handled in loop)

  // ── 3. Build player lookup by apiSportsId ──────────────────────────────────
  const playerById = new Map<number, { name: string; team: string }>();
  for (const p of playersArr) {
    if (p.apiSportsId) {
      playerById.set(Number(p.apiSportsId), {
        name: String(p.name ?? p.player ?? ""),
        team: String(p.team ?? p.club ?? ""),
      });
    }
  }

  // ── 4. Compute Foopy rating per player per game ────────────────────────────
  // Also build squiggle game info for round/opponent lookup
  const squiggleGameInfoMap = new Map<string, { round: number; homeTeam: string; awayTeam: string }>();

  const entries: Omit<PerformanceEntry, "rank">[] = [];

  for (const [gameId, gameEntry] of Object.entries(gameStats)) {
    if (allowedGameIds !== null && !allowedGameIds.has(gameId)) continue;
    // season and season_worst only include current-season games
    if (filter === "season" || filter === "season_worst") {
      if (!String(gameEntry.date ?? "").startsWith(SEASON)) continue;
    }

    const teams: any[] = gameEntry.teams ?? [];
    const teamNames = teams.map((t: any) => String(t.team?.name ?? "")).filter(Boolean);

    for (const teamEntry of teams) {
      const teamName = String(teamEntry.team?.name ?? "");
      const opponent = teamNames.find(n => n !== teamName) ?? null;

      for (const pe of teamEntry.players ?? []) {
        const apiPlayerId = Number(pe.player?.id ?? 0);
        if (!apiPlayerId) continue;

        const info = playerById.get(apiPlayerId);
        const name = info?.name || String(pe.player?.name ?? "");
        const team = info?.team || teamName;
        if (!name) continue;

        const s = pe.statistics ?? pe;
        const rating = foopyRating({
          goals:        s.goals?.total ?? s.goals,
          goalAssists:  s.goals?.assists ?? s.goalAssists ?? s.goal_assists,
          behinds:      s.behinds,
          kicks:        s.kicks,
          handballs:    s.handballs,
          marks:        s.marks,
          tackles:      s.tackles,
          hitouts:      s.hitouts,
          disposals:    s.disposals,
          clearances:   s.clearances?.total ?? s.clearances,
          freesFor:     s.free_kicks?.for   ?? s.freesFor    ?? s.frees_for,
          freesAgainst: s.free_kicks?.against ?? s.freesAgainst ?? s.frees_against,
        });

        if (filter === "lowest") {
          if (rating <= 0) continue; // skip players who didn't play
        } else {
          if (rating <= 0) continue;
        }

        entries.push({
          name,
          team,
          rating,
          date: String(gameEntry.date ?? ""),
          round: null, // filled below if we have squiggle data
          opponent,
          image: playerImagePath(name, team),
          gameApiSportsId: gameId,
        });
      }
    }
  }

  // ── 5. Enrich with round numbers via Squiggle (best-effort) ───────────────
  // Build a reverse map of squiggle game ID → round from all known games
  // We do this by checking API_SPORTS_MATCH_IDS
  const apiToSquiggle = new Map<string, string>();
  for (const [sqId, apiId] of Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)) {
    apiToSquiggle.set(String(apiId), sqId);
  }

  // Fetch all squiggle games for the season to get round info (cached-friendly)
  let squiggleRoundByGameId = new Map<string, number>(); // squiggleId → round
  try {
    const sq = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${SEASON}`,
      { headers: { "User-Agent": "Foopy AFL App" }, next: { revalidate: 3600 } as any }
    );
    if (sq.ok) {
      const sqData = await sq.json();
      for (const g of sqData.games ?? []) {
        squiggleRoundByGameId.set(String(g.id), Number(g.round));
      }
    }
  } catch {}

  for (const entry of entries) {
    const sqId = apiToSquiggle.get(entry.gameApiSportsId);
    if (sqId) entry.round = squiggleRoundByGameId.get(sqId) ?? null;
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

  const top100 = deduped.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));

  return NextResponse.json({ entries: top100 }, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
  });
}
