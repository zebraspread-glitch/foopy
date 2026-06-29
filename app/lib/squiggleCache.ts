import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side cache for Squiggle data, so that USER traffic never reaches
// api.squiggle.com.au. Reads are served from Supabase `match_cache`; an upstream
// fetch happens at most once per TTL window across the whole deployment (shared
// `fetched_at` cooldown + per-instance in-flight dedup), so the number of
// requests Squiggle sees is a function of the TTL — not the number of users.
//
// This mirrors app/lib/matchCache.ts (the API-Sports cache) — same table, same
// stale-on-error behaviour — keyed by a sentinel game_id "0" + a squiggle
// data_type so the two never collide.
// ─────────────────────────────────────────────────────────────────────────────

const UA = "Foopy AFL App (foopy.app)";
const ROW_ID = "0"; // sentinel game_id; squiggle rows are distinguished by data_type
const CACHE_READ_TIMEOUT_MS = 3_000;
const CACHE_WRITE_TIMEOUT_MS = 3_000;
const CACHE_FAILURE_COOLDOWN_MS = 30_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

let cacheUnavailableUntil = 0;
const lastCacheLog = new Map<string, number>();

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface CacheRow {
  payload: unknown;
  fetched_at: string | null;
}

const inFlight = new Map<string, Promise<unknown>>();

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

function cacheAvailable(): boolean {
  return Date.now() >= cacheUnavailableUntil;
}

function noteCacheFailure(op: string, dataType: string, err: unknown) {
  cacheUnavailableUntil = Date.now() + CACHE_FAILURE_COOLDOWN_MS;
  const key = `${op}:${dataType}`;
  const last = lastCacheLog.get(key) ?? 0;
  if (Date.now() - last < CACHE_FAILURE_COOLDOWN_MS) return;
  lastCacheLog.set(key, Date.now());
  const message = err instanceof Error
    ? err.message
    : typeof err === "object" && err !== null
      ? JSON.stringify(err)
      : String(err);
  console.error(`[squiggleCache] ${op} failed for ${dataType}: ${message}`);
}

async function readRow(dataType: string): Promise<CacheRow | null> {
  if (!cacheAvailable()) return null;
  try {
    const signal = timeoutSignal(CACHE_READ_TIMEOUT_MS);
    const query = adminSupabase()
      .from("match_cache")
      .select("payload, fetched_at")
      .eq("game_id", ROW_ID)
      .eq("data_type", dataType);
    const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    noteCacheFailure("read", dataType, err);
    return null;
  }
}

async function writeRow(dataType: string, payload: unknown): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const signal = timeoutSignal(CACHE_WRITE_TIMEOUT_MS);
    const query = adminSupabase()
      .from("match_cache")
      .upsert(
        { game_id: ROW_ID, data_type: dataType, payload, fetched_at: new Date().toISOString(), is_final: false },
        { onConflict: "game_id,data_type" }
      );
    const { error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw error;
  } catch (err) {
    noteCacheFailure("write", dataType, err);
  }
}

function isFresh(row: CacheRow, ttlSeconds: number): boolean {
  if (!row.fetched_at) return false;
  return Date.now() - new Date(row.fetched_at).getTime() < ttlSeconds * 1000;
}

/**
 * Read-through cache. Serves the cached payload if it's within `ttlSeconds`;
 * otherwise refreshes from Squiggle exactly once across concurrent requests in
 * this instance, and at most once per TTL window across instances. Falls back to
 * stale cache if the fetch fails. NEVER lets a user wait on more than one fetch.
 */
async function withCache<T>(
  dataType: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await readRow(dataType);
  if (cached && isFresh(cached, ttlSeconds)) return cached.payload as T;

  const existing = inFlight.get(dataType);
  if (existing) return (await existing) as T;

  const promise = (async () => {
    // Stamp the fetch time immediately so other instances treat the row as
    // fresh and don't pile on (cross-instance cooldown, à la claimSync).
    if (cached) await writeRow(dataType, cached.payload);
    const data = await fetcher();
    await writeRow(dataType, data);
    return data;
  })()
    .catch((err) => {
      if (cached?.payload !== undefined) {
        console.error(`[squiggleCache] ${dataType} fetch failed, serving stale:`, err);
        return cached.payload;
      }
      throw err;
    })
    .finally(() => inFlight.delete(dataType));

  inFlight.set(dataType, promise);
  return (await promise) as T;
}

/** Pure cache read — never reaches Squiggle. Returns null if nothing cached. */
async function readOnly<T>(dataType: string): Promise<T | null> {
  const row = await readRow(dataType);
  return row?.payload !== undefined ? (row.payload as T) : null;
}

// ── Upstream fetchers ────────────────────────────────────────────────────────

async function fetchGames(year: number, noStore = false): Promise<any[]> {
  const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
    headers: { "User-Agent": UA },
    signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
    ...(noStore ? { cache: "no-store" as const } : { next: { revalidate: 10 } }),
  });
  if (!res.ok) throw new Error(`Squiggle games ${year} failed: ${res.status}`);
  const data = await res.json();
  return data.games ?? [];
}

async function fetchStandings(year: number, noStore = false): Promise<any[]> {
  const res = await fetch(`https://api.squiggle.com.au/?q=standings;year=${year}`, {
    headers: { "User-Agent": UA },
    signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
    ...(noStore ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
  });
  if (!res.ok) throw new Error(`Squiggle standings ${year} failed: ${res.status}`);
  const data = await res.json();
  return data.standings ?? [];
}

// ── Public API ───────────────────────────────────────────────────────────────

const currentYear = () => new Date().getFullYear();

/**
 * Games for a season. The current season uses a short (live-fresh) TTL but is
 * still capped to one Squiggle hit per window regardless of user count; past
 * seasons are immutable, so they're cached for a day.
 */
export async function getSeasonGames(year: number = currentYear()): Promise<any[]> {
  const ttl = year >= currentYear() ? 10 : 86_400;
  return withCache(`squiggle_games_${year}`, ttl, () => fetchGames(year));
}

/** Ladder/standings for a season. */
export async function getStandings(year: number = currentYear()): Promise<any[]> {
  const ttl = year >= currentYear() ? 300 : 86_400;
  return withCache(`squiggle_standings_${year}`, ttl, () => fetchStandings(year));
}

/** A single game, resolved from the cached season list — no extra upstream call. */
export async function getGame(gameId: number | string, year: number = currentYear()): Promise<any | null> {
  const games = await getSeasonGames(year);
  return games.find((g) => String(g.id) === String(gameId)) ?? null;
}

/** Cache-only season read for paths that must never touch upstream. */
export async function getSeasonGamesCached(year: number = currentYear()): Promise<any[]> {
  return (await readOnly<any[]>(`squiggle_games_${year}`)) ?? [];
}

/** Forced refresh used by the warming cron (ignores the TTL). */
export async function refreshSeason(year: number = currentYear()): Promise<{ games: number; standings: number }> {
  const [games, standings] = await Promise.all([fetchGames(year, true), fetchStandings(year, true)]);
  await Promise.all([
    writeRow(`squiggle_games_${year}`, games),
    writeRow(`squiggle_standings_${year}`, standings),
  ]);
  return { games: games.length, standings: standings.length };
}
