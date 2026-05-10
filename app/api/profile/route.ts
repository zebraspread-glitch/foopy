import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ username: "demo", favouriteTeam: "Carlton", bio: "Foopy fan" }); }
