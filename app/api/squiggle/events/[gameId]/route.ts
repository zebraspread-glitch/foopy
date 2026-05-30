import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.pathname.split("/").pop();

  const upstream = await fetch(
    `https://sse.squiggle.com.au/events/${gameId}`,
    {
      headers: {
        Accept: "text/event-stream",
        "User-Agent": "Foopy AFL App (foopy.app)",
      },
      // @ts-ignore — Node fetch supports this
      duplex: "half",
    }
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("Failed to connect to Squiggle SSE", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
