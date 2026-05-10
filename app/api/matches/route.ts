import { NextResponse } from "next/server";
import { getMatches } from "../../lib/data";
export async function GET() { return NextResponse.json(getMatches()); }
