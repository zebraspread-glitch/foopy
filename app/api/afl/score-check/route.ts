import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Server-side cooldown — don't re-run for the same game+score within 8s
const lastRun = new Map<string, number>();
const COOLDOWN_MS = 8_000;

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function scoreType(delta: number, goalsDelta?: number, behindsDelta?: number): "GOAL" | "BEHIND" | null {
  if (delta <= 0) return null;
  if (goalsDelta != null && goalsDelta > 0) return "GOAL";
  if (behindsDelta != null && behindsDelta > 0) return "BEHIND";
  if (delta % 6 === 0) return "GOAL";
  if (delta === 1 || delta === 2) return "BEHIND";
  return "GOAL";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { gameId, hteamId, ateamId, hscore, ascore, hgoals, hbehinds, agoals, abehinds, period, minute } = body;

  if (!gameId || hteamId == null || ateamId == null || hscore == null || ascore == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const currentHome = Number(hscore);
  const currentAway = Number(ascore);

  if (currentHome === 0 && currentAway === 0) return NextResponse.json({ inserted: [] });

  // Cooldown per game+score to avoid hammering on every re-render
  const cooldownKey = `${gameId}|${currentHome}|${currentAway}`;
  const now = Date.now();
  if ((lastRun.get(cooldownKey) ?? 0) + COOLDOWN_MS > now) {
    return NextResponse.json({ inserted: [], reason: "cooldown" });
  }
  lastRun.set(cooldownKey, now);

  const supabase = adminSupabase();

  // Get all events for this game to derive baselines and check for existing coverage
  const { data: events } = await supabase
    .from("live_game_feed")
    .select("home_score, away_score, team_id")
    .eq("api_game_id", String(gameId));

  const rows = events ?? [];

  // Last known home score = highest home_score seen in any event
  // Last known away score = highest away_score seen in any event
  // These are independent — correct because each represents the running total for that team
  const lastHomeScore = rows.length > 0 ? Math.max(...rows.map((e: any) => Number(e.home_score ?? 0))) : 0;
  const lastAwayScore = rows.length > 0 ? Math.max(...rows.map((e: any) => Number(e.away_score ?? 0))) : 0;

  const homeDelta = currentHome - lastHomeScore;
  const awayDelta = currentAway - lastAwayScore;

  const inserted: string[] = [];

  // Home team scored — check if any event already covers Melbourne reaching this score
  if (homeDelta > 0) {
    const alreadyCovered = rows.some((e: any) => Number(e.home_score ?? 0) >= currentHome);
    if (!alreadyCovered) {
      const type = scoreType(
        homeDelta,
        hgoals != null ? Number(hgoals) - Math.floor(lastHomeScore / 6) : undefined,
        hbehinds != null ? Number(hbehinds) - Math.round((lastHomeScore % 6)) : undefined,
      );
      if (type) {
        await supabase.from("live_game_feed").insert({
          api_game_id: String(gameId),
          period: period != null ? Number(period) : null,
          minute: minute != null ? Number(minute) : null,
          type,
          team_id: Number(hteamId),
          player_id: null,
          player_name: null,
          home_score: currentHome,
          away_score: currentAway,
          inferred: true,
        });
        inserted.push(`home:${type}`);
      }
    }
  }

  // Away team scored — check if any event already covers Hawthorn reaching this score
  if (awayDelta > 0) {
    const alreadyCovered = rows.some((e: any) => Number(e.away_score ?? 0) >= currentAway);
    if (!alreadyCovered) {
      const type = scoreType(
        awayDelta,
        agoals != null ? Number(agoals) - Math.floor(lastAwayScore / 6) : undefined,
        abehinds != null ? Number(abehinds) - Math.round((lastAwayScore % 6)) : undefined,
      );
      if (type) {
        await supabase.from("live_game_feed").insert({
          api_game_id: String(gameId),
          period: period != null ? Number(period) : null,
          minute: minute != null ? Number(minute) : null,
          type,
          team_id: Number(ateamId),
          player_id: null,
          player_name: null,
          home_score: currentHome,
          away_score: currentAway,
          inferred: true,
        });
        inserted.push(`away:${type}`);
      }
    }
  }

  return NextResponse.json({ inserted });
}
