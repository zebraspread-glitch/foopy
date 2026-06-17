import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Game-day weather barely changes; share one server cache across all viewers
// instead of every browser hitting Open-Meteo directly.
export const revalidate = 1800;

const UA = { "User-Agent": "Foopy AFL App (foopy.app)" };
const empty = () => NextResponse.json({ weather: null });

// GET /api/weather?date=YYYY-MM-DD&lat=..&lon=..   (known venue)
//     /api/weather?date=YYYY-MM-DD&venue=Name       (geocode by name)
// Returns { weather: { temp, code } | null }. The browser calls this proxy so
// it never touches Open-Meteo directly.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") ?? "").slice(0, 10);
  const venue = searchParams.get("venue") ?? "";
  let lat = searchParams.get("lat");
  let lon = searchParams.get("lon");
  if (!date) return empty();

  try {
    // Unknown venue → geocode the name to coordinates first.
    if ((lat == null || lon == null) && venue) {
      const g = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(venue)}&count=1&country=AU`,
        { headers: UA, next: { revalidate: 86400 } }
      );
      if (g.ok) {
        const hit = (await g.json())?.results?.[0];
        if (hit?.latitude != null && hit?.longitude != null) {
          lat = String(hit.latitude);
          lon = String(hit.longitude);
        }
      }
    }
    if (lat == null || lon == null) return empty();

    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,weathercode&timezone=auto&start_date=${date}&end_date=${date}`,
      { headers: UA, next: { revalidate: 1800 } }
    );
    if (!r.ok) return empty();

    const d = await r.json();
    const temp = d?.daily?.temperature_2m_max?.[0];
    const code = d?.daily?.weathercode?.[0];
    if (temp == null || code == null) return empty();

    return NextResponse.json(
      { weather: { temp: Math.round(temp), code } },
      { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } }
    );
  } catch {
    return empty();
  }
}
