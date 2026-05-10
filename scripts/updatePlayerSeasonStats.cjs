require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

const PLAYERS_PATH = path.join(process.cwd(), "app/data/playerstats.json");
const API_KEY = process.env.API_SPORTS_AFL_KEY;
const SEASON = "2026";

function toNumber(value) {
  const n = Number(String(value ?? 0).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

async function fetchSeasonStats(apiSportsId) {
  const res = await fetch(
    `https://v1.afl.api-sports.io/players/statistics?id=${apiSportsId}&season=${SEASON}`,
    {
      headers: {
        "x-apisports-key": API_KEY,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`API-Sports failed: ${res.status}`);
  }

  return res.json();
}

async function main() {
  if (!API_KEY) {
    throw new Error("Missing API_SPORTS_AFL_KEY in .env.local");
  }

  const players = safeReadJson(PLAYERS_PATH, []);

  fs.copyFileSync(PLAYERS_PATH, `${PLAYERS_PATH}.backup`);

  for (const player of players) {
    if (!player.apiSportsId) {
      console.log(`Skipped ${player.name}: no apiSportsId`);
      continue;
    }

    try {
      console.log(`Updating ${player.name} (${player.apiSportsId})`);

      const json = await fetchSeasonStats(player.apiSportsId);
      const stats = json.response?.[0]?.statistics;

      if (!stats) {
        console.log(`No stats found for ${player.name}`);
        continue;
      }

      player.games = toNumber(stats.games?.played);
      player.goals = toNumber(stats.goals?.total?.total);
      player.goalAssists = toNumber(stats.goals?.assists?.total);
      player.behinds = toNumber(stats.behinds?.total);

      player.disposals = toNumber(stats.disposals?.average);
      player.kicks = toNumber(stats.kicks?.average);
      player.handballs = toNumber(stats.handballs?.average);
      player.marks = toNumber(stats.marks?.average);
      player.tackles = toNumber(stats.tackles?.average);
      player.hitouts = toNumber(stats.hitouts?.average);
      player.clearances = toNumber(stats.clearances?.average);

      player.totalDisposals = toNumber(stats.disposals?.total);
      player.totalKicks = toNumber(stats.kicks?.total);
      player.totalHandballs = toNumber(stats.handballs?.total);
      player.totalMarks = toNumber(stats.marks?.total);
      player.totalTackles = toNumber(stats.tackles?.total);
      player.totalHitouts = toNumber(stats.hitouts?.total);
      player.totalClearances = toNumber(stats.clearances?.total);

      player.freesFor = toNumber(stats.free_kicks?.for?.total);
      player.freesAgainst = toNumber(stats.free_kicks?.against?.total);
      player.freesForAvg = toNumber(stats.free_kicks?.for?.average);
      player.freesAgainstAvg = toNumber(stats.free_kicks?.against?.average);
      player.goalAssistsAvg = toNumber(stats.goals?.assists?.average);

      player.updatedSeasonStatsAt = new Date().toISOString();

      writeJson(PLAYERS_PATH, players);

      console.log(`Saved ${player.name}`);
    } catch (err) {
      console.log(`Failed ${player.name}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("DONE");
}

main().catch((err) => {
  console.error("Script failed");
  console.error(err);
  process.exit(1);
});