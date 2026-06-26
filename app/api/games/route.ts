import { getSeasonGames } from "@/app/lib/squiggleCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served entirely from the shared Squiggle cache — user requests never reach
// api.squiggle.com.au. Upstream is refreshed at most once per TTL window across
// the whole deployment, so request volume is independent of how many users poll.
// See app/lib/squiggleCache.ts.
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    const games = await getSeasonGames();
    return Response.json(games, {
      headers: fresh
        ? { "Cache-Control": "no-store" }
        : { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" },
    });
  } catch {
    return Response.json([], { status: 200 });
  }
}
