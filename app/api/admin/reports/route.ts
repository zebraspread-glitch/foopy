import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/app/lib/admin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const dynamic = "force-dynamic";

const STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;

// GET /api/admin/reports?status=open — list reports for admin review.
export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = new URL(req.url).searchParams.get("status");

  let query = supabaseAdmin
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const { data: reports, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach reporter / reported usernames for display (FKs point at auth.users,
  // so we resolve profiles in a second pass rather than via PostgREST embed).
  const ids = Array.from(new Set(
    (reports ?? []).flatMap(r => [r.reporter_id, r.reported_user_id]).filter(Boolean),
  )) as string[];

  const profileMap: Record<string, { username: string | null; display_name: string | null }> = {};
  if (ids.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);
    for (const p of profiles ?? []) profileMap[p.id] = { username: p.username, display_name: p.display_name };
  }

  const enriched = (reports ?? []).map(r => ({
    ...r,
    reporter: profileMap[r.reporter_id] ?? null,
    reported: r.reported_user_id ? (profileMap[r.reported_user_id] ?? null) : null,
  }));

  return NextResponse.json({ reports: enriched });
}

// PATCH /api/admin/reports — update a report's status. Body: { id, status }.
export async function PATCH(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as string | undefined;
  if (!id || !status || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("reports")
    .update({ status, reviewed_at: status === "open" ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
