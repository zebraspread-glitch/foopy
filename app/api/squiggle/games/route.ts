export const runtime = "nodejs";

// Keep scores very fresh while still sharing one short server cache
// across visitors instead of every browser hitting Squiggle directly.
export const revalidate = 10;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Optional ?year= override; defaults to the current season.
  const year = params.get("year") ?? String(new Date().getFullYear());
  const fresh = params.get("fresh") === "1";

  const res = await fetch(
    `https://api.squiggle.com.au/?q=games;year=${year}`,
    {
      headers: {
        "User-Agent": "Foopy AFL App (foopy.app)",
      },
      // Next.js data cache - revalidate every 10 seconds
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 10 } }),
    }
  );

  if (!res.ok) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await res.json();
  const games = data.games ?? [];

  return Response.json(games, {
    headers: fresh ? {
      "Cache-Control": "no-store",
    } : {
      // Tell the browser/CDN: serve briefly stale data while revalidating
      "Cache-Control": "public, max-age=10, stale-while-revalidate=20",
    },
  });
}
