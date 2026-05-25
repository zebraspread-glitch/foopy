#!/usr/bin/env node
/**
 * Fetches every completed AFL/VFL season from Squiggle and saves them
 * as local JSON files so the app never calls Squiggle for past seasons.
 *
 * Usage:
 *   node scripts/fetch-seasons.mjs           # fetch all missing years
 *   node scripts/fetch-seasons.mjs --force   # re-fetch everything
 *
 * Output: app/data/season-cache/<year>.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "../app/data/season-cache");
const CURRENT_YEAR = new Date().getFullYear();
const START_YEAR = 1897;
const END_YEAR = CURRENT_YEAR - 1; // only cache completed seasons
const FORCE = process.argv.includes("--force");
const DELAY_MS = 1200; // be polite to Squiggle

const HEADERS = { "User-Agent": "Foopy AFL App (foopy.app)" };

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeason(year) {
  const outputPath = path.join(OUTPUT_DIR, `${year}.json`);

  if (!FORCE && fs.existsSync(outputPath)) {
    const size = fs.statSync(outputPath).size;
    if (size > 10) {
      process.stdout.write(`  ✓ ${year} already cached\n`);
      return true;
    }
  }

  try {
    const [gamesRes, standingsRes] = await Promise.all([
      fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, { headers: HEADERS }),
      fetch(`https://api.squiggle.com.au/?q=standings;year=${year}`, { headers: HEADERS }),
    ]);

    if (!gamesRes.ok || !standingsRes.ok) {
      process.stdout.write(`  ✗ ${year} HTTP error (games:${gamesRes.status} standings:${standingsRes.status})\n`);
      return false;
    }

    const gamesData = await gamesRes.json();
    const standingsData = await standingsRes.json();

    const data = {
      games: gamesData.games ?? [],
      standings: standingsData.standings ?? [],
    };

    fs.writeFileSync(outputPath, JSON.stringify(data));
    process.stdout.write(
      `  ✓ ${year} — ${data.games.length} games, ${data.standings.length} teams\n`
    );
    return true;
  } catch (err) {
    process.stdout.write(`  ✗ ${year} failed: ${err.message}\n`);
    return false;
  }
}

async function main() {
  const total = END_YEAR - START_YEAR + 1;
  console.log(`\nFetching AFL/VFL seasons ${START_YEAR}–${END_YEAR} (${total} seasons)…`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  let done = 0;
  let failed = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const ok = await fetchSeason(year);
    if (!ok) failed.push(year);
    done++;

    if (year < END_YEAR) await sleep(DELAY_MS);
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Done. ${done - failed.length}/${total} seasons cached.`);
  if (failed.length > 0) {
    console.log(`Failed years: ${failed.join(", ")}`);
    console.log(`Re-run with --force to retry.`);
  }
}

main();
