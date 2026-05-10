import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Missing date" }, { status: 400 });
  }

  const res = await fetch(
    `https://v1.afl.api-sports.io/games/statistics/teams?date=${date}`,
    {
      headers: {
        "x-rapidapi-key": process.env.API_SPORTS_KEY!,
        "x-rapidapi-host": "v1.afl.api-sports.io",
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  return NextResponse.json(data);
}