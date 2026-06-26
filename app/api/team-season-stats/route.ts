import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SEASON = new Date().getFullYear().toString();

const TEAM_NAMES: Record<number, string> = {
  1:"Adelaide",2:"Brisbane Lions",3:"Carlton",4:"Collingwood",
  5:"Essendon",6:"Fremantle",7:"Geelong",8:"Hawthorn",
  9:"Melbourne",10:"North Melbourne",11:"Port Adelaide",12:"Richmond",
  13:"St Kilda",14:"Sydney",15:"West Coast",16:"Western Bulldogs",
  17:"Gold Coast",18:"GWS",
};

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

type TeamStatGame = {
  gameId: number;
  date?: string;
  teams?: {
    team?: { id?: number };
    statistics?: {
      disposals?: { disposals?: number; kicks?: number; handballs?: number; free_kicks?: number };
      stoppages?: { hitouts?: number; clearances?: number };
      marks?: number;
      scoring?: { goals?: number; assists?: number; behinds?: number };
      defence?: { tackles?: number };
    };
  }[];
};

export async function GET() {
  const dataDir = path.join(process.cwd(), "app", "data");

  // 1. Static baseline
  const staticGames: Record<string, TeamStatGame> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "team-stats.json"), "utf8")
  );

  // 2. Supplement from match_cache player_stats — aggregate per game per team
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: finalRows } = await supabase
      .from("match_cache")
      .select("game_id, payload")
      .eq("data_type", "player_stats")
      .eq("is_final", true);

    const staticIds = new Set(Object.keys(staticGames));

    for (const row of finalRows ?? []) {
      const gameId = String(row.game_id);
      if (!/^\d+$/.test(gameId) || staticIds.has(gameId)) continue; // already in static baseline

      const payload = row.payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const rawTeams: any[] = responseItems[0]?.teams ?? [];
      const date: string = responseItems[0]?.game?.date?.slice(0, 10) ?? "";

      if (!rawTeams.length || !date.startsWith(SEASON)) continue;

      // Aggregate player stats → team totals
      const teamBlocks = rawTeams.map((td: any) => {
        const teamId = Number(td.team?.id ?? 0);
        let disposals = 0, kicks = 0, handballs = 0, marks = 0, tackles = 0;
        let clearances = 0, hitouts = 0, goals = 0, behinds = 0, assists = 0, freeKicks = 0;

        for (const pe of td.players ?? []) {
          const s = pe.statistics ?? pe;
          kicks      += n(s.kicks);
          handballs  += n(s.handballs);
          disposals  += n(s.disposals) || n(s.kicks) + n(s.handballs);
          marks      += n(s.marks);
          tackles    += n(s.tackles);
          clearances += n(s.clearances?.total ?? s.clearances);
          hitouts    += n(s.hitouts);
          goals      += n(s.goals?.total ?? s.goals);
          behinds    += n(s.behinds);
          assists    += n(s.goals?.assists ?? s.goalAssists ?? 0);
          freeKicks  += n(s.free_kicks?.for ?? s.freesFor ?? 0);
        }

        return {
          team: { id: teamId },
          statistics: {
            disposals: { disposals, kicks, handballs, free_kicks: freeKicks },
            stoppages: { hitouts, clearances },
            marks,
            scoring: { goals, assists, behinds },
            defence: { tackles },
          },
        };
      });

      staticGames[gameId] = { gameId: Number(gameId), date, teams: teamBlocks };
    }
  } catch {}

  return NextResponse.json(staticGames, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" },
  });
}
