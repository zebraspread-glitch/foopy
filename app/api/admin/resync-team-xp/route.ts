/**
 * POST /api/admin/resync-team-xp
 *
 * Re-calculates every user's team-pass XP using the fixed teamsMatch logic
 * (exact canonical matching — no more substring collisions between e.g.
 * Melbourne / North Melbourne or Adelaide Crows / Port Adelaide).
 *
 * Protected by ADMIN_SECRET env var.
 * Call once after deploying the teamsMatch fix to correct historical data.
 *
 * Optional body: { user_id: "uuid" }  → resyncs only that one user.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.ADMIN_SECRET;
  const auth   = req.headers.get("x-admin-secret");
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Optional single-user mode ─────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const singleUserId: string | undefined = body?.user_id;

  // ── Fetch affected user IDs ───────────────────────────────────────────────
  let userIds: string[];

  if (singleUserId) {
    userIds = [singleUserId];
  } else {
    const { data, error } = await supabaseServer
      .from("user_team_passes")
      .select("user_id")
      .eq("active", true);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Deduplicate
    userIds = [...new Set((data ?? []).map((r: any) => r.user_id as string))];
  }

  // ── Resync each user ──────────────────────────────────────────────────────
  const results: { user_id: string; updated: number; error?: string }[] = [];

  for (const userId of userIds) {
    try {
      const { updated } = await syncPassXpFromCards(userId);
      results.push({ user_id: userId, updated });
    } catch (err: any) {
      results.push({ user_id: userId, updated: 0, error: String(err?.message ?? err) });
    }
  }

  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  const errors       = results.filter(r => r.error);

  return NextResponse.json({
    ok:           true,
    users_checked: userIds.length,
    passes_updated: totalUpdated,
    errors:        errors.length,
    details:       results,
  });
}
