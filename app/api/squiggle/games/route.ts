export const runtime = "nodejs";

// Cache on the server for 45 seconds (revalidates in background)
// so the first visitor of each minute gets a warm cache hit
export const revalidate = 45;

export async function GET(request: Request) {
  const year = new Date().getFullYear();
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  const res = await fetch(
    `https://api.squiggle.com.au/?q=games;year=${year}`,
    {
      headers: {
        "User-Agent": "Foopy AFL App (foopy.app)",
      },
      // Next.js data cache — revalidate every 45 seconds
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 45 } }),
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
      // Tell the browser/CDN: serve stale for up to 60s while revalidating
      "Cache-Control": "public, max-age=45, stale-while-revalidate=60",
    },
  });
}
