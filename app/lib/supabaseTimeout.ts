const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Races a Supabase query against a timeout so a stuck connection (e.g. a
 * Supabase outage) can't hang the request. Resolves to `fallback` if the
 * query doesn't settle within `timeoutMs` or if it throws.
 */
export async function withSupabaseTimeout<T>(
  query: PromiseLike<T>,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  try {
    return await Promise.race([
      Promise.resolve(query),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
  } catch {
    return fallback;
  }
}
