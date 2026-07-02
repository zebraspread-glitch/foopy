import { NextResponse } from "next/server";

// Lightweight "is our database provider reachable?" probe for the outage
// banner. One cheap GoTrue health check per server instance per 30s — user
// traffic polls THIS route (CDN-cached), never Supabase directly, so the
// banner can't stampede a struggling backend.
export const dynamic = "force-dynamic";

const CHECK_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 4_000;

let cachedUp = true;
let lastCheckedAt = 0;
let inflight: Promise<boolean> | null = null;

async function probeSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true; // misconfig — don't scare users over it

  // Probe the REST data plane (what picks/profiles actually depend on), not
  // auth — the two can fail independently. Any HTTP answer proves the
  // database path is alive (even 401/404); only 5xx/timeout means down.
  // Inline AbortSignal rather than withSupabaseTimeout(): the helper races
  // but leaves the losing fetch running; a scheduled probe should cancel it.
  try {
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function GET() {
  const now = Date.now();

  if (now - lastCheckedAt > CHECK_INTERVAL_MS) {
    // Coalesce concurrent cold checks into a single probe.
    inflight ??= probeSupabase().then((up) => {
      cachedUp = up;
      lastCheckedAt = Date.now();
      inflight = null;
      return up;
    });
    await inflight;
  }

  // FOOPY_MAINTENANCE=1 forces the banner on regardless of the probe
  // (needs a redeploy on Vercel to take effect).
  const maintenance = process.env.FOOPY_MAINTENANCE === "1";

  return NextResponse.json(
    { up: cachedUp && !maintenance },
    {
      headers: {
        // Let Vercel's CDN absorb the polling from all clients.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
