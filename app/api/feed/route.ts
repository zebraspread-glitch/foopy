import { NextResponse } from "next/server";
import { getFeed } from "../../lib/data";
export async function GET() { return NextResponse.json(getFeed()); }
