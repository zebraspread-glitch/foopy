import { NextResponse } from "next/server";
import { getPlayerStats } from "../../lib/data";
export async function GET() { return NextResponse.json(getPlayerStats()); }
