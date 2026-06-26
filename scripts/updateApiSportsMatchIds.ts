import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getApiTeamId } from "../app/lib/apiSportsTeams";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.API_SPORTS_AFL_KEY || process.env.API_SPORTS_KEY;
const API_BASE = "https://v1.afl.api-sports.io";
const OUTPUT_PATH = path.join(process.cwd(), "app", "data", "apiSportsMatchIds.ts");

if (!API_KEY) {
  throw new Error("Missing API_SPORTS_AFL_KEY or API_SPORTS_KEY");
}

type SquiggleGame = {
  id: number | string;
  date?: string;
  localtime?: string;
  hteam?: string;
  ateam?: string;
};

type ApiSportsGame = {
  game?: { id?: number | string };
  date?: string;
  teams?: {
    home?: { id?: number | string; name?: string };
    away?: { id?: number | string; name?: string };
  };
};

type IndexedApiGame = {
  game: ApiSportsGame;
  apiSportsId: string;
  date: string;
  homeId: number;
  awayId: number;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

const YEAR = Number(argValue("--year") ?? new Date().getFullYear());
const DRY_RUN = process.argv.includes("--dry-run");

function dateKey(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDistance(a: string, b: string): number {
  const aTime = new Date(`${a}T12:00:00Z`).getTime();
  const bTime = new Date(`${b}T12:00:00Z`).getTime();
  return Math.abs(Math.round((aTime - bTime) / 86_400_000));
}

function pairKey(date: string, homeId: number, awayId: number): string {
  return `${date}:${homeId}:${awayId}`;
}

function unorderedPairKey(date: string, homeId: number, awayId: number): string {
  return `${date}:${[homeId, awayId].sort((a, b) => a - b).join(":")}`;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchSquiggleGames(year: number): Promise<SquiggleGame[]> {
  const json = await fetchJson(`https://api.squiggle.com.au/?q=games;year=${year}`, {
    headers: { "User-Agent": "Foopy AFL App" },
  });
  return json.games ?? json ?? [];
}

async function fetchApiSportsGames(year: number): Promise<ApiSportsGame[]> {
  const json = await fetchJson(`${API_BASE}/games?league=1&season=${year}`, {
    headers: { "x-apisports-key": API_KEY! },
  });
  return json.response ?? [];
}

function buildApiIndexes(apiGames: ApiSportsGame[]) {
  const exact = new Map<string, ApiSportsGame[]>();
  const unordered = new Map<string, ApiSportsGame[]>();
  const all: IndexedApiGame[] = [];

  for (const game of apiGames) {
    const gameId = Number(game.game?.id);
    const date = dateKey(game.date);
    const homeId = Number(game.teams?.home?.id);
    const awayId = Number(game.teams?.away?.id);
    if (!gameId || !date || !homeId || !awayId) continue;
    all.push({ game, apiSportsId: String(gameId), date, homeId, awayId });

    const exactKey = pairKey(date, homeId, awayId);
    exact.set(exactKey, [...(exact.get(exactKey) ?? []), game]);

    const looseKey = unorderedPairKey(date, homeId, awayId);
    unordered.set(looseKey, [...(unordered.get(looseKey) ?? []), game]);
  }

  return { exact, unordered, all };
}

function findWindowMatch(
  all: IndexedApiGame[],
  date: string,
  homeId: number,
  awayId: number,
  maxDays: number,
  orientation: "exact" | "unordered"
): IndexedApiGame | null {
  const candidates = all
    .filter((game) => {
      if (dayDistance(date, game.date) > maxDays) return false;
      if (orientation === "exact") return game.homeId === homeId && game.awayId === awayId;
      return (
        (game.homeId === homeId && game.awayId === awayId) ||
        (game.homeId === awayId && game.awayId === homeId)
      );
    })
    .sort((a, b) => dayDistance(date, a.date) - dayDistance(date, b.date));

  if (!candidates.length) return null;

  const closestDistance = dayDistance(date, candidates[0].date);
  const closest = candidates.filter((game) => dayDistance(date, game.date) === closestDistance);
  return closest.length === 1 ? closest[0] : null;
}

function findMatch(
  indexes: ReturnType<typeof buildApiIndexes>,
  date: string,
  homeId: number,
  awayId: number
): { game: ApiSportsGame | null; method: string } {
  const exact = indexes.exact.get(pairKey(date, homeId, awayId));
  if (exact?.length === 1) return { game: exact[0], method: "exact" };

  const loose = indexes.unordered.get(unorderedPairKey(date, homeId, awayId));
  if (loose?.length === 1) return { game: loose[0], method: "reversed" };

  for (const nearbyDate of [addDays(date, -1), addDays(date, 1)]) {
    const nearbyExact = indexes.exact.get(pairKey(nearbyDate, homeId, awayId));
    if (nearbyExact?.length === 1) return { game: nearbyExact[0], method: `exact:${nearbyDate}` };

    const nearbyLoose = indexes.unordered.get(unorderedPairKey(nearbyDate, homeId, awayId));
    if (nearbyLoose?.length === 1) return { game: nearbyLoose[0], method: `reversed:${nearbyDate}` };
  }

  const windowExact = findWindowMatch(indexes.all, date, homeId, awayId, 7, "exact");
  if (windowExact) return { game: windowExact.game, method: `window:${windowExact.date}` };

  const windowLoose = findWindowMatch(indexes.all, date, homeId, awayId, 7, "unordered");
  if (windowLoose) return { game: windowLoose.game, method: `window-reversed:${windowLoose.date}` };

  return { game: null, method: "unmatched" };
}

function renderMapping(mapping: Map<string, string>): string {
  const rows = [...mapping.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([squiggleId, apiSportsId]) => `  "${squiggleId}": "${apiSportsId}",`);

  return `export const API_SPORTS_MATCH_IDS: Record<string, string> = {\n${rows.join("\n")}\n};\n`;
}

async function main() {
  console.log(`Fetching Squiggle and API-Sports fixtures for ${YEAR}...`);
  const [squiggleGames, apiGames] = await Promise.all([
    fetchSquiggleGames(YEAR),
    fetchApiSportsGames(YEAR),
  ]);

  const indexes = buildApiIndexes(apiGames);
  const mapping = new Map<string, string>();
  const unmatched: string[] = [];
  const nonExact: string[] = [];
  const skippedPlaceholders: string[] = [];

  for (const game of squiggleGames) {
    const squiggleId = String(game.id ?? "");
    const date = dateKey(game.date ?? game.localtime);
    if (!game.hteam || !game.ateam) {
      skippedPlaceholders.push(`${squiggleId || "(missing id)"} ${date || "(missing date)"}`);
      continue;
    }

    const homeId = getApiTeamId(game.hteam);
    const awayId = getApiTeamId(game.ateam);

    if (!squiggleId || !date || !homeId || !awayId) {
      unmatched.push(`${squiggleId || "(missing id)"} missing data: ${date} ${game.hteam} v ${game.ateam}`);
      continue;
    }

    const { game: apiGame, method } = findMatch(indexes, date, homeId, awayId);
    const apiSportsId = String(apiGame?.game?.id ?? "");

    if (!apiSportsId) {
      unmatched.push(`${squiggleId} ${date} ${game.hteam} v ${game.ateam}`);
      continue;
    }

    if (method !== "exact") {
      nonExact.push(`${squiggleId} -> ${apiSportsId} (${method}) ${date} ${game.hteam} v ${game.ateam}`);
    }

    mapping.set(squiggleId, apiSportsId);
  }

  const apiIds = new Map<string, string[]>();
  for (const [squiggleId, apiSportsId] of mapping) {
    apiIds.set(apiSportsId, [...(apiIds.get(apiSportsId) ?? []), squiggleId]);
  }
  const duplicates = [...apiIds.entries()].filter(([, squiggleIds]) => squiggleIds.length > 1);

  console.log(`Squiggle games: ${squiggleGames.length}`);
  console.log(`API-Sports games: ${apiGames.length}`);
  console.log(`Matched: ${mapping.size}`);
  console.log(`Skipped placeholders: ${skippedPlaceholders.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Duplicate API IDs: ${duplicates.length}`);
  if (nonExact.length) console.log(`Non-exact matches:\n${nonExact.join("\n")}`);
  if (unmatched.length) console.log(`Unmatched games:\n${unmatched.join("\n")}`);
  if (skippedPlaceholders.length) {
    console.log(`Skipped unknown-team placeholders:\n${skippedPlaceholders.join("\n")}`);
  }
  if (duplicates.length) {
    console.log(`Duplicate mappings:\n${duplicates.map(([apiId, ids]) => `${apiId}: ${ids.join(", ")}`).join("\n")}`);
  }

  if (unmatched.length || duplicates.length) {
    throw new Error("Refusing to write incomplete or duplicate API-Sports match mapping");
  }

  const output = renderMapping(mapping);
  if (DRY_RUN) {
    console.log(`Dry run: would write ${OUTPUT_PATH}`);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, output);
  console.log(`Wrote ${mapping.size} mappings to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
