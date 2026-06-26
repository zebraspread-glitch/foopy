import fs from "fs";
import path from "path";
import { getSeasonGames, getStandings } from "@/app/lib/squiggleCache";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();

  if (isNaN(yearNum) || yearNum < 1897 || yearNum > currentYear) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
  }

  // ── Serve from local cache for all completed seasons ──────────────────────
  if (yearNum < currentYear) {
    const cachePath = path.join(
      process.cwd(),
      "app/data/season-cache",
      `${yearNum}.json`
    );
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return Response.json(data, {
        headers: {
          // Immutable — past season data never changes
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  // ── Current season (or missing cache): served from the shared Squiggle
  //    cache — never hits Squiggle on a user request. ─────────────────────────
  const [games, standings] = await Promise.all([
    getSeasonGames(yearNum).catch(() => []),
    getStandings(yearNum).catch(() => []),
  ]);

  return Response.json(
    { games, standings },
    {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
    }
  );
}
