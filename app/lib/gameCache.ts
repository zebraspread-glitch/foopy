/**
 * Client-side cache for Squiggle games data — two layers:
 *
 * 1. Module-level memory cache (SPA navigation) — survives tab switches
 * 2. localStorage cache (hard refreshes) — survives full page reloads
 *
 * Usage pattern for instant renders:
 *   const cached = getGamesCached();        // sync, may be stale
 *   if (cached) setGames(cached);          // show immediately
 *   getGames().then(setGames);             // refresh silently
 */

const LS_KEY = "foopy_games_v2";
const LS_TTL_MS = 5 * 60_000;    // 5 minutes — localStorage freshness window
const MEM_TTL_MS = 60_000;       // 1 minute  — memory cache freshness
const MEM_LIVE_TTL_MS = 20_000;  // 20 seconds when a game is live

type CacheEntry = { data: unknown[]; fetchedAt: number };

let mem: CacheEntry | null = null;

/* ── Helpers ── */

function isLive(games: unknown[]): boolean {
  return games.some((g: any) => {
    const c = g.complete ?? 0;
    return c > 0 && c < 100;
  });
}

function memIsStale(): boolean {
  if (!mem) return true;
  const ttl = isLive(mem.data) ? MEM_LIVE_TTL_MS : MEM_TTL_MS;
  return Date.now() - mem.fetchedAt > ttl;
}

function loadLS(): CacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.data)) return null;
    if (Date.now() - parsed.fetchedAt > LS_TTL_MS) return null;
    return parsed as CacheEntry;
  } catch {
    return null;
  }
}

function saveLS(entry: CacheEntry) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entry)); } catch {}
}

/* ── Public API ── */

/**
 * Synchronously returns any cached games (mem or localStorage),
 * regardless of staleness. Returns null if nothing is cached.
 *
 * Call this first for an instant first render, then call getGames()
 * to fetch fresh data in the background.
 */
export function getGamesCached(): unknown[] | null {
  if (mem) return mem.data;
  const ls = loadLS();
  if (ls) { mem = ls; return ls.data; }
  return null;
}

/**
 * Returns games from memory cache if fresh, otherwise fetches from
 * network and updates both caches. Throws on network failure.
 */
export async function getGames(): Promise<unknown[]> {
  if (!memIsStale()) return mem!.data;
  return fetchFresh();
}

async function fetchFresh(): Promise<unknown[]> {
  const res = await fetch("/api/squiggle/games");
  if (!res.ok) {
    // Serve stale data rather than crash
    if (mem) return mem.data;
    throw new Error(`Games fetch failed: ${res.status}`);
  }
  const body = await res.json();
  const games: unknown[] = Array.isArray(body) ? body : (body.games ?? []);
  const entry: CacheEntry = { data: games, fetchedAt: Date.now() };
  mem = entry;
  saveLS(entry);
  return games;
}

/** Force the next call to re-fetch (e.g. after pull-to-refresh) */
export function invalidateGames() {
  mem = null;
}
