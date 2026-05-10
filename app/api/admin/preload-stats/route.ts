import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

// Fallback empty map — populate app/data/footywireMatchIds.ts to enable preloading
const FOOTYWIRE_MATCH_IDS: Record<string, string> = {};

export const runtime = "nodejs";

export async function GET() {
  try {
    const results: any[] = [];

    for (const [squiggleId, fwId] of Object.entries(FOOTYWIRE_MATCH_IDS)) {
      console.log(`Checking game ${squiggleId}`);

      // 1. check if already saved
      const { data: existing } = await supabase
        .from("match_stats")
        .select("squiggle_id")
        .eq("squiggle_id", squiggleId)
        .maybeSingle();

      if (existing) {
        results.push({ squiggleId, status: "SKIPPED" });
        continue;
      }

      // 2. fetch stats from your API (which scrapes FootyWire)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/footywire/match/${fwId}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        results.push({ squiggleId, status: "FAILED_FETCH" });
        continue;
      }

      const data = await res.json();
      const stats = data.stats ?? [];
const teamStats = data.teamStats ?? null;

      if (!stats.length) {
        results.push({ squiggleId, status: "NO_STATS" });
        continue;
      }

      // 3. save to Supabase
      await supabase.from("match_stats").upsert(
  {
    squiggle_id: squiggleId,
    footywire_id: fwId,
    status: "FINAL",
    stats,
    team_stats: teamStats,
    updated_at: new Date().toISOString(),
  },
  {
    onConflict: "squiggle_id",
  }
);

      results.push({ squiggleId, status: "SAVED" });

      // optional delay so you don’t spam FootyWire
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Preload failed" },
      { status: 500 }
    );
  }
}