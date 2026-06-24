import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { claimPassRewardsForUser } from "@/app/api/passes/claim/route";

export const dynamic = "force-dynamic";
// Fans out to one claim pass per user — allow up to 5 minutes.
export const maxDuration = 300;

/**
 * GET /api/cron/claim-pass-rewards
 *
 * Automatically claims pending pass rewards for EVERY user who holds an active
 * pass, so rewards land without the user having to open the app. Runs on a
 * Vercel Cron schedule. The per-user claim is idempotent (pass_rewards UNIQUE
 * constraint dedupes), so the client-side PassRewardCollector still works and
 * never double-awards.
 *
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Collect every user holding an active pass (team or player).
  const [{ data: teamRows }, { data: playerRows }] = await Promise.all([
    supabaseServer.from("user_team_passes").select("user_id").eq("active", true),
    supabaseServer.from("user_player_passes").select("user_id").eq("active", true),
  ]);

  const userIds = [...new Set([
    ...(teamRows   ?? []).map((r) => r.user_id as string),
    ...(playerRows ?? []).map((r) => r.user_id as string),
  ].filter(Boolean))];

  let usersAwarded = 0;
  let totalAura  = 0;
  let totalCoins = 0;
  let errors     = 0;

  for (const userId of userIds) {
    try {
      const result = await claimPassRewardsForUser(userId);
      if (result.claimed > 0) {
        usersAwarded++;
        totalAura  += result.totalAura;
        totalCoins += result.totalCoins;
      }
    } catch (err) {
      errors++;
      console.error("[cron/claim-pass-rewards]", userId, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[cron/claim-pass-rewards] users=${userIds.length} awarded=${usersAwarded} aura=${totalAura} coins=${totalCoins} errors=${errors}`);
  return NextResponse.json({ users: userIds.length, usersAwarded, totalAura, totalCoins, errors });
}
