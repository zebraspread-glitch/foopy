import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, clientKey, rateLimitHeaders } from "@/app/lib/rateLimit";

// Global rate limiting for API routes. This is the safety net that keeps a
// single client (or a runaway loop in the app) from hammering the API hard
// enough to break the app or exhaust Supabase / upstream AFL-data quotas.
//
// Limits are intentionally generous — normal usage, even heavy live-game
// browsing, stays well under them. They only bite on genuine abuse.

type Tier = { limit: number; windowMs: number };

// Per-minute budgets, applied to the most specific matching prefix.
const DEFAULT_TIER: Tier = { limit: 120, windowMs: 60_000 };

const TIERS: { prefix: string; tier: Tier }[] = [
  // Currency / economy mutations — cheating and abuse vectors. Keep tight.
  { prefix: "/api/aura/award", tier: { limit: 30, windowMs: 60_000 } },
  { prefix: "/api/cards", tier: { limit: 30, windowMs: 60_000 } },
  { prefix: "/api/cosmetics", tier: { limit: 30, windowMs: 60_000 } },
  { prefix: "/api/trades", tier: { limit: 30, windowMs: 60_000 } },
  { prefix: "/api/duels", tier: { limit: 60, windowMs: 60_000 } },
  { prefix: "/api/passes", tier: { limit: 60, windowMs: 60_000 } },
  // Admin endpoints — low legitimate volume.
  { prefix: "/api/admin", tier: { limit: 30, windowMs: 60_000 } },
  // Routes that fan out to external AFL data sources — protect their quotas.
  { prefix: "/api/footywire", tier: { limit: 60, windowMs: 60_000 } },
  { prefix: "/api/squiggle", tier: { limit: 90, windowMs: 60_000 } },
  { prefix: "/api/weather", tier: { limit: 60, windowMs: 60_000 } },
];

function tierFor(pathname: string): Tier {
  for (const { prefix, tier } of TIERS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return tier;
  }
  return DEFAULT_TIER;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cron routes are server-to-server scheduled jobs (guarded by their own
  // secret); rate-limiting them could drop legitimate runs.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const tier = tierFor(pathname);
  // Key on client IP + path-tier so one noisy endpoint doesn't starve others.
  const result = rateLimit(`${clientKey(req)}:${pathname}`, tier.limit, tier.windowMs);
  const headers = rateLimitHeaders(result, tier.limit);

  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers },
    );
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

// Only run on API routes — static assets and pages are untouched.
export const config = {
  matcher: ["/api/:path*"],
};
