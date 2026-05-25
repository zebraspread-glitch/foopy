import fs from "fs";
import path from "path";

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

  // ── Current season (or missing cache): fetch live from Squiggle ───────────
  const headers = { "User-Agent": "Foopy AFL App (foopy.app)" };
  const opts = { next: { revalidate: 3600 } } as const;

  const [gamesRes, standingsRes] = await Promise.all([
    fetch(`https://api.squiggle.com.au/?q=games;year=${yearNum}`, { headers, ...opts }),
    fetch(`https://api.squiggle.com.au/?q=standings;year=${yearNum}`, { headers, ...opts }),
  ]);

  const gamesData = gamesRes.ok ? await gamesRes.json() : { games: [] };
  const standingsData = standingsRes.ok ? await standingsRes.json() : { standings: [] };

  return Response.json(
    {
      games: gamesData.games ?? [],
      standings: standingsData.standings ?? [],
    },
    {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
    }
  );
}
