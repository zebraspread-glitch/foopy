import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TEAM_BY_ID: Record<number, string> = {
  1:"Adelaide",2:"Brisbane",3:"Carlton",4:"Collingwood",
  5:"Essendon",6:"Fremantle",7:"Geelong",8:"Hawthorn",
  9:"Melbourne",10:"North Melbourne",11:"Port Adelaide",12:"Richmond",
  13:"St Kilda",14:"Sydney",15:"West Coast",16:"Western Bulldogs",
  17:"Gold Coast",18:"GWS",
};

function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }
function teamsMatch(a: string, b: string) {
  const ak = norm(a); const bk = norm(b);
  return !!ak && !!bk && (ak === bk || ak.includes(bk) || bk.includes(ak));
}

// GET /api/match-players?date=YYYY-MM-DD&home=<team>&away=<team>
// Calls API-Sports games/statistics/players for the date and returns
// player IDs for the matching game so the client can filter season stats.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date     = searchParams.get("date")  ?? "";
  const homeTeam = searchParams.get("home")  ?? "";
  const awayTeam = searchParams.get("away")  ?? "";

  if (!date || !homeTeam || !awayTeam) return NextResponse.json({ home: [], away: [] });

  const apiKey = process.env.API_SPORTS_AFL_KEY;
  if (!apiKey) return NextResponse.json({ home: [], away: [] });

  try {
    const res = await fetch(
      `https://v1.afl.api-sports.io/games/statistics/players?date=${date}`,
      { headers: { "x-apisports-key": apiKey }, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ home: [], away: [] });

    const json = await res.json();
    const games: any[] = json.response ?? [];

    // Find the game matching our home/away teams
    const game = games.find(g => {
      const teams: any[] = g.teams ?? [];
      const names = teams.map(t => TEAM_BY_ID[Number(t.team?.id)] ?? "");
      return names.some(n => teamsMatch(n, homeTeam)) && names.some(n => teamsMatch(n, awayTeam));
    });

    if (!game) return NextResponse.json({ home: [], away: [] });

    const homePlayers: number[] = [];
    const awayPlayers: number[] = [];

    for (const teamData of game.teams ?? []) {
      const tName = TEAM_BY_ID[Number(teamData.team?.id)] ?? "";
      const ids = (teamData.players ?? []).map((p: any) => Number(p.player?.id)).filter(Boolean);
      if (teamsMatch(tName, homeTeam)) homePlayers.push(...ids);
      else awayPlayers.push(...ids);
    }

    return NextResponse.json({ home: homePlayers, away: awayPlayers }, {
      headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ home: [], away: [] });
  }
}
