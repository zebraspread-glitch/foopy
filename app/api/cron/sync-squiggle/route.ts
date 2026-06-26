import { NextResponse } from "next/server";
import { refreshSeason } from "@/app/lib/squiggleCache";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-squiggle
 *
 * Warms the Squiggle cache for the current season so the cache stays fresh even
 * when no one is browsing, and so server-side jobs (finalize-polls, passes, …)
 * always have current games to read. User traffic is served from this cache and
 * never hits Squiggle directly. See app/lib/squiggleCache.ts.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshSeason();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
