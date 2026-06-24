// In-memory sliding-window rate limiter.
//
// No external dependency (Redis/Upstash) — limits are tracked per server
// instance in a plain Map. On a multi-instance/serverless deploy each
// instance keeps its own counters, so the effective global limit scales with
// the instance count. That's an acceptable trade-off here: the goal is to
// stop a single client from hammering an endpoint hard enough to break the
// app or burn through Supabase / upstream API quotas, not to enforce an exact
// cluster-wide quota.

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

// Opportunistic cleanup so the Map can't grow without bound. Runs at most
// once per CLEANUP_INTERVAL across all checks.
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function sweep(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  /** Seconds until reset — handy for a Retry-After header. */
  retryAfter: number;
};

/**
 * Record a hit for `key` and report whether it's within `limit` requests per
 * `windowMs`. A fixed-window counter that resets on `resetAt`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    hit = { count: 0, resetAt: now + windowMs };
    buckets.set(key, hit);
  }

  hit.count += 1;

  const remaining = Math.max(0, limit - hit.count);
  const retryAfter = Math.max(0, Math.ceil((hit.resetAt - now) / 1000));

  return {
    ok: hit.count <= limit,
    remaining,
    resetAt: hit.resetAt,
    retryAfter,
  };
}

/**
 * Best-effort client identifier for rate-limit keying. Prefers the real
 * client IP from the proxy chain (Vercel / most hosts set x-forwarded-for),
 * falling back to other common headers and finally a shared "unknown" bucket.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Standard rate-limit headers for a result. */
export function rateLimitHeaders(
  result: RateLimitResult,
  limit: number,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(result.retryAfter) }),
  };
}
