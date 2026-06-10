import { NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/verify — returns { admin } based on the caller's bearer token.
export async function GET(req: Request) {
  return NextResponse.json({ admin: await isAdminRequest(req) });
}
