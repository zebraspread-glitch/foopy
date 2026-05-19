export const runtime = "nodejs";

// Keep scores very fresh while still sharing one short server cache
// across visitors instead of every browser hitting Squiggle directly.
export const revalidate = 10;

export async function GET(request: Request) {
  const year = new Date().getFullYear();
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  const res = await fetch(
    `https://api.squiggle.com.au/?q=games;year=${year}`,
    {
      headers: {
        "User-Agent": "Foopy AFL App (foopy.app)",
      },
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 10 } }),
    }
  );

  if (!res.ok) {
    return Response.json(
      { error: "Squiggle games fetch failed", status: res.status },
      { status: 502 }
    );
  }

  const data = await res.json();
  const games = data.games ?? [];

  return Response.json(games, {
    headers: fresh ? {
      "Cache-Control": "no-store",
    } : {
      "Cache-Control": "public, max-age=10, stale-while-revalidate=20",
    },
  });
}
