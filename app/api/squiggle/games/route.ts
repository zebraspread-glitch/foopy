import { getSeasonGames } from "@/app/lib/squiggleCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served entirely from the shared Squiggle cache — user requests never reach
// api.squiggle.com.au. See app/lib/squiggleCache.ts.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year") ?? new Date().getFullYear());
  const fresh = params.get("fresh") === "1";
  try {
    const games = await getSeasonGames(year);
    return Response.json(games, {
      headers: fresh
        ? { "Cache-Control": "no-store" }
        : { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" },
    });
  } catch {
    return Response.json([], { status: 200 });
  }
}
