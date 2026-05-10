import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.API_SPORTS_AFL_KEY || process.env.API_SPORTS_KEY;

if (!API_KEY) {
  throw new Error("Missing API_SPORTS_AFL_KEY in .env.local");
}

const SEASON = 2026;
const API_BASE = "https://v1.afl.api-sports.io";

const TEAM_IDS: Record<number, string> = {
  1: "Adelaide",
  2: "Brisbane",
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

const TEAM_OVERRIDE: Record<string, string> = {
  "Oscar Allen": "West Coast",
  "Harley Reid": "West Coast",
  "Seth Campbell": "Richmond",
  "Jonty Faull": "Richmond",
  "Matthew Owies": "West Coast",
};

type ApiPlayer = {
  id: number;
  name: string;
};

type FoopyPlayer = {
  id: string;
  name: string;
  team: string;
  aliases: string[];
  apiSportsId: number;
  eventIds: number[];
  statsIds: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFoopyId(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchPlayers(teamId: number): Promise<ApiPlayer[]> {
  const url = new URL(`${API_BASE}/players`);
  url.searchParams.set("season", String(SEASON));
  url.searchParams.set("team", String(teamId));

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": API_KEY!,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed team ${teamId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return (data.response ?? [])
    .map((p: any) => ({
      id: Number(p.id ?? p.player?.id),
      name: String(p.name ?? p.player?.name ?? ""),
    }))
    .filter((p: ApiPlayer) => p.id && p.name);
}

async function main() {
  const outputPath = path.join(process.cwd(), "app", "data", "players.json");

  const allPlayers: FoopyPlayer[] = [];
  const seen = new Map<number, FoopyPlayer>();

  for (const [teamIdString, teamName] of Object.entries(TEAM_IDS)) {
    const teamId = Number(teamIdString);

    console.log(`Fetching ${teamName} using API team ID ${teamId}...`);

    const players = await fetchPlayers(teamId);

    console.log(`Found ${players.length} players for ${teamName}`);

    for (const player of players) {
      const correctedTeam = TEAM_OVERRIDE[player.name] || teamName;

      const existing = seen.get(player.id);

      if (existing) {
        console.warn(
          `Duplicate player ID ${player.id}: ${player.name} already saved as ${existing.team}, skipping ${correctedTeam}`
        );
        continue;
      }

      const foopyPlayer: FoopyPlayer = {
        id: makeFoopyId(player.name),
        name: player.name,
        team: correctedTeam,
        aliases: [],
        apiSportsId: player.id,
        eventIds: [player.id],
        statsIds: [],
      };

      seen.set(player.id, foopyPlayer);
      allPlayers.push(foopyPlayer);
    }

    await sleep(500);
  }

  allPlayers.sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return a.name.localeCompare(b.name);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allPlayers, null, 2));

  console.log(`Done. Saved ${allPlayers.length} players to app/data/players.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});