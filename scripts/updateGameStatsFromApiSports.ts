import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.API_SPORTS_AFL_KEY || process.env.API_SPORTS_KEY;

if (!API_KEY) {
  throw new Error("Missing API_SPORTS_AFL_KEY or API_SPORTS_KEY");
}

const API_BASE = "https://v1.afl.api-sports.io";

const PLAYER_OUTPUT_PATH = path.join(process.cwd(), "app", "data", "game-stats.json");
const TEAM_OUTPUT_PATH = path.join(process.cwd(), "app", "data", "team-stats.json");
const PLAYERS_PATH = path.join(process.cwd(), "app", "data", "players.json");

const API_TEAM_ID_BY_NAME: Record<string, number> = {
  Adelaide: 1,
  "Adelaide Crows": 1,
  Brisbane: 2,
  "Brisbane Lions": 2,
  Carlton: 3,
  Collingwood: 4,
  Essendon: 5,
  Fremantle: 6,
  Geelong: 7,
  "Geelong Cats": 7,
  Hawthorn: 8,
  "Hawthorn Hawks": 8,
  Melbourne: 9,
  "Melbourne Demons": 9,
  "North Melbourne": 10,
  "North Melbourne Kangaroos": 10,
  "Port Adelaide": 11,
  "Port Adelaide Power": 11,
  Richmond: 12,
  "Richmond Tigers": 12,
  "St Kilda": 13,
  "St Kilda Saints": 13,
  Sydney: 14,
  "Sydney Swans": 14,
  "West Coast": 15,
  "West Coast Eagles": 15,
  "Western Bulldogs": 16,
  "Gold Coast": 17,
  "Gold Coast Suns": 17,
  GWS: 18,
  "GWS Giants": 18,
  "Greater Western Sydney": 18,
  "Greater Western Sydney Giants": 18,
};

const TODAY = new Date().toISOString().slice(0, 10);

const START_DATE = TODAY;
const END_DATE = TODAY;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getDatesBetween(start: string, end: string) {
  const dates: string[] = [];
  let current = new Date(start);
  const last = new Date(end);

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function loadJson(filePath: string) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function saveJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getApiPlayerId(player: any) {
  return (
    player?.player?.id ??
    player?.player?.player_id ??
    player?.player?.playerId ??
    player?.id ??
    player?.player_id ??
    player?.playerId ??
    null
  );
}

function buildPlayerTeamIdMap() {
  const players = loadJson(PLAYERS_PATH);
  const map = new Map<number, number>();

  for (const player of Array.isArray(players) ? players : []) {
    const teamId = API_TEAM_ID_BY_NAME[player.team] ?? API_TEAM_ID_BY_NAME[player.club];
    const ids = [
      player.apiSportsId,
      ...(Array.isArray(player.statsIds) ? player.statsIds : []),
      ...(Array.isArray(player.eventIds) ? player.eventIds : []),
    ];

    for (const id of ids) {
      const numericId = Number(id);
      if (teamId && Number.isFinite(numericId)) map.set(numericId, teamId);
    }
  }

  return map;
}

function repairPlayerStatTeamIds(teams: any[], playerTeamIdByApiId: Map<number, number>) {
  if (!Array.isArray(teams)) return [];

  return teams.map((teamBlock) => {
    const counts = new Map<number, number>();

    for (const player of Array.isArray(teamBlock?.players) ? teamBlock.players : []) {
      const playerTeamId = playerTeamIdByApiId.get(Number(getApiPlayerId(player)));
      if (playerTeamId) counts.set(playerTeamId, (counts.get(playerTeamId) ?? 0) + 1);
    }

    const correctedTeamId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!correctedTeamId) return teamBlock;

    const currentTeamId = Number(teamBlock?.team?.id ?? teamBlock?.team_id ?? teamBlock?.id);
    if (currentTeamId === correctedTeamId) return teamBlock;

    return {
      ...teamBlock,
      team: {
        ...(typeof teamBlock?.team === "object" && teamBlock.team ? teamBlock.team : {}),
        id: correctedTeamId,
      },
    };
  });
}

async function apiFetch(endpoint: string) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "x-apisports-key": API_KEY!,
    },
  });

  if (!res.ok) {
    throw new Error(`${endpoint} failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.response ?? [];
}

async function main() {
  const playerStats = loadJson(PLAYER_OUTPUT_PATH);
  const teamStats = loadJson(TEAM_OUTPUT_PATH);
  const playerTeamIdByApiId = buildPlayerTeamIdMap();

  const dates = getDatesBetween(START_DATE, END_DATE);

  console.log(`Checking ${dates.length} dates...`);

  for (const date of dates) {
    console.log(`📅 ${date}`);

    let playerGames: any[] = [];
    let teamGames: any[] = [];

    try {
      playerGames = await apiFetch(`/games/statistics/players?date=${date}`);
      await sleep(250);
      teamGames = await apiFetch(`/games/statistics/teams?date=${date}`);
    } catch (err) {
      console.error(`❌ Failed on ${date}:`, err);
      await sleep(1000);
      continue;
    }

    for (const game of playerGames) {
      const gameId = String(game.game?.id ?? "");
      if (!gameId) continue;

      playerStats[gameId] = {
        gameId: Number(gameId),
        date,
        teams: repairPlayerStatTeamIds(game.teams ?? [], playerTeamIdByApiId),
        savedAt: new Date().toISOString(),
      };

      console.log(`✅ Player stats saved: ${gameId}`);
    }

    for (const game of teamGames) {
      const gameId = String(game.game?.id ?? "");
      if (!gameId) continue;

      teamStats[gameId] = {
        gameId: Number(gameId),
        date,
        teams: game.teams ?? [],
        savedAt: new Date().toISOString(),
      };

      console.log(`✅ Team stats saved: ${gameId}`);
    }

    saveJson(PLAYER_OUTPUT_PATH, playerStats);
    saveJson(TEAM_OUTPUT_PATH, teamStats);

    await sleep(600);
  }

  console.log("🎉 Done — saved:");
  console.log(`Player stats → ${PLAYER_OUTPUT_PATH}`);
  console.log(`Team stats → ${TEAM_OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
