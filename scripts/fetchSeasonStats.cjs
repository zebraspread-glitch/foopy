/**
 * fetchSeasonStats.cjs
 *
 * Fetches 2026 AFL season stats for every player in app/data/players.json
 * and writes the result to app/data/player-season-stats.json.
 *
 * Usage:
 *   node scripts/fetchSeasonStats.cjs            # skip players fetched today
 *   node scripts/fetchSeasonStats.cjs --force     # re-fetch all players
 *   node scripts/fetchSeasonStats.cjs --id 1931   # fetch one specific player
 *
 * Add to package.json:
 *   "fetch:stats": "node scripts/fetchSeasonStats.cjs"
 */

require("dotenv").config({ path: ".env.local" });

const fs   = require("fs");
const path = require("path");

const PLAYERS_SRC    = path.join(process.cwd(), "app/data/players.json");
const STATS_OUTPUT   = path.join(process.cwd(), "app/data/player-season-stats.json");
const JERSEY_PATH    = path.join(process.cwd(), "app/data/jersey-numbers.json");
const CARD_PLAYERS_PATH = path.join(process.cwd(), "app/data/cardPlayers.ts");

const API_KEY = process.env.API_SPORTS_AFL_KEY || process.env.API_SPORTS_KEY;
const SEASON  = "2026";
const DELAY_MS = 400; // stay well under rate-limit

const FORCE      = process.argv.includes("--force");
const SINGLE_ID  = (() => {
  const i = process.argv.indexOf("--id");
  return i !== -1 ? Number(process.argv[i + 1]) : null;
})();

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v) {
  const n = Number(String(v ?? 0).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toAvg(v) {
  const n = Number(String(v ?? 0).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function safeRead(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function writeJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isToday(isoString) {
  if (!isoString) return false;
  return isoString.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ── API call ─────────────────────────────────────────────────────────────────

async function fetchPlayerStats(apiSportsId) {
  const url = `https://v1.afl.api-sports.io/players/statistics?id=${apiSportsId}&season=${SEASON}`;
  const res = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error("❌  Missing API_SPORTS_AFL_KEY or API_SPORTS_KEY in .env.local");
    process.exit(1);
  }

  const sourcePlayers = safeRead(PLAYERS_SRC, []);
  if (sourcePlayers.length === 0) {
    console.error("❌  No players found in app/data/players.json");
    process.exit(1);
  }

  // Load jersey numbers lookup
  const jerseyMap = safeRead(JERSEY_PATH, {});

  // Build position lookup from cardPlayers.ts (parse with regex — no TS runtime needed)
  const positionMap = {};
  try {
    const cpContent = fs.readFileSync(CARD_PLAYERS_PATH, "utf8");
    const rows = cpContent.matchAll(/id:\s*"([^"]+)"[^}]+position:\s*"([^"]+)"/g);
    for (const [, id, pos] of rows) positionMap[id] = pos;
  } catch { /* ignore */ }

  // Load existing stats keyed by apiSportsId for quick lookup
  const existing = safeRead(STATS_OUTPUT, []);
  const statsMap = {};
  for (const p of existing) {
    if (p.apiSportsId) statsMap[p.apiSportsId] = p;
  }

  let players = sourcePlayers.filter(p => p.apiSportsId);
  if (SINGLE_ID) players = players.filter(p => p.apiSportsId === SINGLE_ID);

  console.log(`\n🏈  Fetching ${SEASON} AFL season stats`);
  console.log(`📋  ${players.length} players to process${FORCE ? " (--force mode)" : ""}\n`);

  let updated = 0;
  let skipped = 0;
  let failed  = 0;

  for (const player of players) {
    const { name, apiSportsId, team, id } = player;

    // Skip if already fetched today and not forcing
    if (!FORCE && !SINGLE_ID && isToday(statsMap[apiSportsId]?.fetchedAt)) {
      process.stdout.write(`  ⏭  ${name} — already up to date\n`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`  ⬇  ${name} (${apiSportsId}) … `);
      const json = await fetchPlayerStats(apiSportsId);
      const r    = json.response?.[0];
      const s    = r?.statistics;

      if (!s) {
        process.stdout.write("no stats\n");
        // Keep existing entry if present, just note the attempt
        if (!statsMap[apiSportsId]) {
          statsMap[apiSportsId] = { id, name, team, apiSportsId, games: 0, fetchedAt: new Date().toISOString() };
        }
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      const cardId  = id.replace(/_/g, "");
      const jerseyNumber = jerseyMap[String(apiSportsId)] ?? statsMap[apiSportsId]?.jerseyNumber ?? null;
      const position     = positionMap[cardId] ?? statsMap[apiSportsId]?.position ?? null;

      statsMap[apiSportsId] = {
        id,
        name,
        team,
        apiSportsId,

        // Player photo URL (if the API returns one)
        photoUrl: r?.player?.photo ?? statsMap[apiSportsId]?.photoUrl ?? null,

        // Jersey number + position
        jerseyNumber,
        position,

        // Season totals
        games:           toNum(s.games?.played),
        goals:           toNum(s.goals?.total?.total),
        goalAssists:     toNum(s.goals?.assists?.total),
        behinds:         toNum(s.behinds?.total),
        totalDisposals:  toNum(s.disposals?.total),
        totalKicks:      toNum(s.kicks?.total),
        totalHandballs:  toNum(s.handballs?.total),
        totalMarks:      toNum(s.marks?.total),
        totalTackles:    toNum(s.tackles?.total),
        totalHitouts:    toNum(s.hitouts?.total),
        totalClearances: toNum(s.clearances?.total),
        freesFor:        toNum(s.free_kicks?.for?.total),
        freesAgainst:    toNum(s.free_kicks?.against?.total),

        // Per-game averages
        disposals:   toAvg(s.disposals?.average),
        kicks:       toAvg(s.kicks?.average),
        handballs:   toAvg(s.handballs?.average),
        marks:       toAvg(s.marks?.average),
        tackles:     toAvg(s.tackles?.average),
        hitouts:     toAvg(s.hitouts?.average),
        clearances:  toAvg(s.clearances?.average),
        goalAvg:     toAvg(s.goals?.total?.average),
        freesForAvg: toAvg(s.free_kicks?.for?.average),

        fetchedAt: new Date().toISOString(),
      };

      process.stdout.write(`${statsMap[apiSportsId].games} games, ${statsMap[apiSportsId].disposals} disp/g\n`);
      updated++;

      // Write after every player so partial results are safe
      writeJson(STATS_OUTPUT, Object.values(statsMap));

    } catch (err) {
      process.stdout.write(`ERROR: ${err.message}\n`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  // Final write
  writeJson(STATS_OUTPUT, Object.values(statsMap));

  console.log(`\n✅  Done — ${updated} updated, ${skipped} skipped, ${failed} failed`);
  console.log(`📁  Output: app/data/player-season-stats.json (${Object.keys(statsMap).length} players)\n`);
}

main().catch(err => {
  console.error("\n💥  Script failed:", err.message);
  process.exit(1);
});
