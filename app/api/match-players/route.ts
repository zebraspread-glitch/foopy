import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const TEAM_BY_ID: Record<number, string> = {
  1:"Adelaide",2:"Brisbane",3:"Carlton",4:"Collingwood",
  5:"Essendon",6:"Fremantle",7:"Geelong",8:"Hawthorn",
  9:"Melbourne",10:"North Melbourne",11:"Port Adelaide",12:"Richmond",
  13:"St Kilda",14:"Sydney",15:"West Coast",16:"Western Bulldogs",
  17:"Gold Coast",18:"GWS",
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function teamsMatch(a: string, b: string) {
  const ak = norm(a); const bk = norm(b);
  return !!ak && !!bk && (ak === bk || ak.includes(bk) || bk.includes(ak));
}

// GET /api/match-players?home=<team>&away=<team>
// Returns player names from the most recent completed game for each team,
// used to filter the season stats list to a realistic squad for upcoming games.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const homeTeam = searchParams.get("home") ?? "";
  const awayTeam = searchParams.get("away") ?? "";

  if (!homeTeam || !awayTeam) return NextResponse.json({ home: [], away: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows } = await supabase
    .from("match_cache")
    .select("payload")
    .eq("data_type", "player_stats")
    .eq("is_final", true)
    .order("fetched_at", { ascending: false })
    .limit(80);

  const homePlayers: string[] = [];
  const awayPlayers: string[] = [];

  for (const row of rows ?? []) {
    if (homePlayers.length > 0 && awayPlayers.length > 0) break;

    const teams: any[] = (row.payload as any)?.response?.[0]?.teams ?? [];

    for (const teamData of teams) {
      const tName = teamData.team?.name ?? TEAM_BY_ID[Number(teamData.team?.id)] ?? "";

      if (homePlayers.length === 0 && teamsMatch(tName, homeTeam)) {
        for (const pe of teamData.players ?? []) {
          const name = pe.player?.name ?? "";
          if (name) homePlayers.push(name);
        }
      }

      if (awayPlayers.length === 0 && teamsMatch(tName, awayTeam)) {
        for (const pe of teamData.players ?? []) {
          const name = pe.player?.name ?? "";
          if (name) awayPlayers.push(name);
        }
      }
    }
  }

  return NextResponse.json({ home: homePlayers, away: awayPlayers }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
  });
}
