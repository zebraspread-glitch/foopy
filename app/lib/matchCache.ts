import { createClient } from "@supabase/supabase-js";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type DataType = "events" | "player_stats" | "quarters" | "sync";

// In-process deduplication: one fetch at a time per (gameId, dataType) within a single instance
const inFlight = new Map<string, Promise<unknown>>();

interface CacheRow {
  payload: unknown;
  fetched_at: string | null;
  is_final: boolean;
}

async function readRow(gameId: string, dataType: DataType): Promise<CacheRow | null> {
  const { data } = await adminSupabase()
    .from("match_cache")
    .select("payload, fetched_at, is_final")
    .eq("game_id", gameId)
    .eq("data_type", dataType)
    .single();
  return data ?? null;
}

async function writeRow(
  gameId: string,
  dataType: DataType,
  payload: unknown,
  isFinal: boolean
): Promise<void> {
  await adminSupabase()
    .from("match_cache")
    .upsert(
      { game_id: gameId, data_type: dataType, payload, fetched_at: new Date().toISOString(), is_final: isFinal },
      { onConflict: "game_id,data_type" }
    );
}

function isFresh(row: CacheRow, ttlSeconds: number): boolean {
  if (!row.fetched_at) return false;
  return Date.now() - new Date(row.fetched_at).getTime() < ttlSeconds * 1000;
}

/**
 * Returns cached data if fresh (or final), otherwise calls `fetcher` exactly once
 * across all concurrent requests within this process. Stale data is returned as
 * a fallback if the fetch fails.
 */
export async function withCache<T>(
  gameId: string,
  dataType: DataType,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  isFinalHint = false
): Promise<{ data: T; fromCache: boolean }> {
  const cached = await readRow(gameId, dataType);

  if (cached) {
    if (cached.is_final || isFresh(cached, ttlSeconds)) {
      return { data: cached.payload as T, fromCache: true };
    }
  }

  const key = `${gameId}:${dataType}`;
  const existing = inFlight.get(key);
  if (existing) {
    const data = await existing;
    return { data: data as T, fromCache: false };
  }

  const promise = fetcher()
    .then(async (data) => {
      await writeRow(gameId, dataType, data, isFinalHint);
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);

  try {
    const data = await promise;
    return { data: data as T, fromCache: false };
  } catch (err) {
    // Fetch failed — return stale cache rather than an error if we have anything
    if (cached?.payload !== undefined) {
      console.error(`[matchCache] fetch failed for ${gameId}/${dataType}, serving stale data:`, err);
      return { data: cached.payload as T, fromCache: true };
    }
    throw err;
  }
}

/**
 * Check whether a sync is still within its cooldown window (cross-instance).
 * Returns true if the cooldown has expired and the caller should proceed.
 * Stamps the new fetch time immediately to block other instances.
 */
export async function claimSync(gameId: string, ttlSeconds: number): Promise<boolean> {
  const row = await readRow(gameId, "sync");
  if (row?.is_final) return false;
  if (row && isFresh(row, ttlSeconds)) return false;

  // Stamp now to block concurrent instances — not perfectly atomic but sufficient
  // (worst case: two instances fetch simultaneously once, not per-user)
  await writeRow(gameId, "sync", {}, false);
  return true;
}

export async function markSyncFinal(gameId: string): Promise<void> {
  await writeRow(gameId, "sync", {}, true);
}
