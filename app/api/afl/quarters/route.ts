import { NextResponse } from "next/server";

const API_KEY = process.env.API_SPORTS_KEY!;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing game id" }, { status: 400 });
  }

  const res = await fetch(
    `https://v1.afl.api-sports.io/games/quarters?id=${id}`,
    {
      headers: {
        "x-apisports-key": API_KEY,
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  return NextResponse.json(data);
}