export const runtime = "nodejs";

export async function GET() {
  try {
    const year = new Date().getFullYear();

    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${year}`,
      {
        headers: {
          "User-Agent": "Foopy AFL App",
        },
        cache: "no-store",
      }
    );

    const data = await res.json();

    return Response.json({
      games: Array.isArray(data) ? data : data.games ?? [],
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch live data" },
      { status: 500 }
    );
  }
}