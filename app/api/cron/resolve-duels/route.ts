import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { awardAura } from "@/app/lib/aura";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET ?? "foopy-cron";

const MARGIN_RANGES = [
  { label: "1-12",  mid: 6  },
  { label: "13-24", mid: 18 },
  { label: "25-36", mid: 30 },
  { label: "37-48", mid: 42 },
  { label: "49+",   mid: 56 },
];

function closestMarginRange(margin: number): string {
  let best = MARGIN_RANGES[0];
  let bestDist = Math.abs(margin - best.mid);
  for (const r of MARGIN_RANGES) {
    const d = Math.abs(margin - r.mid);
    if (d < bestDist) { best = r; bestDist = d; }
  }
  return best.label;
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// POST /api/cron/resolve-duels
// Called after games complete. Scores all active duels for completed games.
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminSupabase();
  let resolved = 0;
  let cancelled = 0;

  // 1. Cancel unmatched waiting duels whose game has started
  const { data: staleWaiting } = await db
    .from("duels")
    .select("id")
    .eq("status", "waiting")
    .is("opponent_id", null);

  if (staleWaiting?.length) {
    for (const d of staleWaiting) {
      const { data: duelFull } = await db
        .from("duels")
        .select("id, duel_game_id, duel_game:duel_games(game_date)")
        .eq("id", d.id)
        .single();

      const gameDate = (duelFull?.duel_game as any)?.game_date;
      if (gameDate && new Date(gameDate) <= new Date()) {
        await db.from("duels").update({ status: "cancelled" }).eq("id", d.id);
        cancelled++;
      }
    }
  }

  // 2. Find active duels whose game is complete (duel_games.status = 'complete')
  const { data: activeDuels } = await db
    .from("duels")
    .select(`
      *,
      duel_game:duel_games(id, home_team, away_team, status)
    `)
    .eq("status", "active");

  if (!activeDuels?.length) {
    return NextResponse.json({ resolved, cancelled, message: "No active duels to resolve" });
  }

  for (const duel of activeDuels) {
    const duelGame = duel.duel_game as any;
    if (!duelGame || duelGame.status !== "complete") continue;

    // Check both players submitted picks
    const { data: allPicks } = await db
      .from("duel_picks")
      .select("*")
      .eq("duel_id", duel.id);

    const challengerPicks = (allPicks ?? []).filter((p) => p.user_id === duel.challenger_id);
    const opponentPicks   = (allPicks ?? []).filter((p) => p.user_id === duel.opponent_id);

    // Handle forfeit: opponent never submitted
    if (opponentPicks.length === 0 && challengerPicks.length > 0) {
      await db.from("duels").update({
        status: "complete",
        winner_id: duel.challenger_id,
        opponent_forfeited: true,
        challenger_score: challengerPicks.length,
        opponent_score: 0,
        aura_awarded_challenger: 100,
        coins_awarded_challenger: 50,
        completed_at: new Date().toISOString(),
      }).eq("id", duel.id);
      await awardAura(duel.challenger_id, "duel_win", duel.id, 100);
      await awardCoins(db, duel.challenger_id, 50);
      await sendDuelNotification(db, duel.challenger_id, duel.opponent_id, "duel_result", {
        duel_id: duel.id, result: "win", forfeited: true,
      });
      resolved++;
      continue;
    }

    // Handle forfeit: challenger never submitted
    if (challengerPicks.length === 0 && opponentPicks.length > 0) {
      await db.from("duels").update({
        status: "complete",
        winner_id: duel.opponent_id,
        challenger_forfeited: true,
        challenger_score: 0,
        opponent_score: opponentPicks.length,
        aura_awarded_opponent: 100,
        coins_awarded_opponent: 50,
        completed_at: new Date().toISOString(),
      }).eq("id", duel.id);
      await awardAura(duel.opponent_id, "duel_win", duel.id, 100);
      await awardCoins(db, duel.opponent_id, 50);
      await sendDuelNotification(db, duel.opponent_id, duel.challenger_id, "duel_result", {
        duel_id: duel.id, result: "win", forfeited: true,
      });
      resolved++;
      continue;
    }

    if (challengerPicks.length === 0 && opponentPicks.length === 0) continue;

    // Get questions with correct answers
    const { data: questions } = await db
      .from("duel_questions")
      .select("*")
      .eq("duel_game_id", duel.duel_game_id);

    if (!questions?.length) continue;

    const regularQs  = questions.filter((q) => !q.is_tiebreaker);
    const tbQuestion = questions.find((q) => q.is_tiebreaker);

    // Score regular questions
    let challengerScore = 0;
    let opponentScore   = 0;

    for (const q of regularQs) {
      if (!q.correct_answer) continue;
      const cp = challengerPicks.find((p) => p.question_id === q.id);
      const op = opponentPicks.find((p) => p.question_id === q.id);

      if (cp) {
        const correct = cp.pick === q.correct_answer;
        await db.from("duel_picks").update({ is_correct: correct }).eq("id", cp.id);
        if (correct) challengerScore++;
      }
      if (op) {
        const correct = op.pick === q.correct_answer;
        await db.from("duel_picks").update({ is_correct: correct }).eq("id", op.id);
        if (correct) opponentScore++;
      }
    }

    const challengerPerfect = challengerScore === regularQs.filter((q) => q.correct_answer).length;
    const opponentPerfect   = opponentScore   === regularQs.filter((q) => q.correct_answer).length;

    // Determine winner
    let winnerId: string | null = null;
    let isDraw = false;

    if (challengerScore > opponentScore) {
      winnerId = duel.challenger_id;
    } else if (opponentScore > challengerScore) {
      winnerId = duel.opponent_id;
    } else if (tbQuestion && tbQuestion.correct_answer && tbQuestion.correct_margin) {
      // Tiebreaker
      const cp = challengerPicks.find((p) => p.question_id === tbQuestion.id);
      const op = opponentPicks.find((p)   => p.question_id === tbQuestion.id);

      const challengerTeamRight = cp?.pick === tbQuestion.correct_answer;
      const opponentTeamRight   = op?.pick === tbQuestion.correct_answer;

      if (challengerTeamRight && !opponentTeamRight) {
        winnerId = duel.challenger_id;
      } else if (opponentTeamRight && !challengerTeamRight) {
        winnerId = duel.opponent_id;
      } else if (challengerTeamRight && opponentTeamRight) {
        // Both picked the right team — compare margins
        const correctMid = MARGIN_RANGES.find((r) => r.label === tbQuestion.correct_margin)?.mid ?? 0;
        const cpMid = MARGIN_RANGES.find((r) => r.label === cp?.pick_margin)?.mid ?? -999;
        const opMid = MARGIN_RANGES.find((r) => r.label === op?.pick_margin)?.mid ?? -999;
        const cpDist = Math.abs(cpMid - correctMid);
        const opDist = Math.abs(opMid - correctMid);

        if (cpDist < opDist)      winnerId = duel.challenger_id;
        else if (opDist < cpDist) winnerId = duel.opponent_id;
        else isDraw = true;
      } else {
        // Neither picked the right team
        isDraw = true;
      }

      // Mark tiebreaker correctness
      if (cp) await db.from("duel_picks").update({ is_correct: challengerTeamRight }).eq("id", cp.id);
      if (op) await db.from("duel_picks").update({ is_correct: opponentTeamRight   }).eq("id", op.id);
    } else {
      isDraw = true;
    }

    // Calculate rewards
    let challengerAura = 0, challengerCoins = 0;
    let opponentAura   = 0, opponentCoins   = 0;

    if (isDraw) {
      // Draw: no rewards
    } else if (winnerId === duel.challenger_id) {
      challengerAura  = challengerPerfect ? 200 : 100;
      challengerCoins = challengerPerfect ? 100 : 50;
      opponentAura    = 20;
    } else {
      opponentAura  = opponentPerfect ? 200 : 100;
      opponentCoins = opponentPerfect ? 100 : 50;
      challengerAura = 20;
    }

    // Save final state
    await db.from("duels").update({
      status: "complete",
      winner_id: winnerId,
      is_draw: isDraw,
      challenger_score: challengerScore,
      opponent_score: opponentScore,
      challenger_perfect: challengerPerfect,
      opponent_perfect: opponentPerfect,
      aura_awarded_challenger:  challengerAura,
      coins_awarded_challenger: challengerCoins,
      aura_awarded_opponent:  opponentAura,
      coins_awarded_opponent: opponentCoins,
      completed_at: new Date().toISOString(),
    }).eq("id", duel.id);

    // Award aura and coins
    if (winnerId === duel.challenger_id) {
      await awardAura(duel.challenger_id, "duel_win",  duel.id, challengerAura);
      await awardAura(duel.opponent_id,   "duel_loss", duel.id, opponentAura);
    } else if (winnerId === duel.opponent_id) {
      await awardAura(duel.opponent_id,   "duel_win",  duel.id, opponentAura);
      await awardAura(duel.challenger_id, "duel_loss", duel.id, challengerAura);
    }

    if (challengerCoins > 0) await awardCoins(db, duel.challenger_id, challengerCoins);
    if (opponentCoins   > 0) await awardCoins(db, duel.opponent_id,   opponentCoins);

    // Check and award badges
    if (winnerId) {
      await checkAndAwardBadge(db, winnerId, "first_blood", duel.id);
    }
    if (challengerPerfect) await checkAndAwardBadge(db, duel.challenger_id, "perfect_duellist", duel.id);
    if (opponentPerfect)   await checkAndAwardBadge(db, duel.opponent_id,   "perfect_duellist", duel.id);

    // Notify both players
    const challengerResult = isDraw ? "draw" : winnerId === duel.challenger_id ? "win" : "loss";
    const opponentResult   = isDraw ? "draw" : winnerId === duel.opponent_id   ? "win" : "loss";

    await sendDuelNotification(db, duel.challenger_id, duel.opponent_id, "duel_result", {
      duel_id: duel.id, result: challengerResult,
      aura: challengerAura, coins: challengerCoins,
    });
    await sendDuelNotification(db, duel.opponent_id, duel.challenger_id, "duel_result", {
      duel_id: duel.id, result: opponentResult,
      aura: opponentAura, coins: opponentCoins,
    });

    resolved++;
  }

  return NextResponse.json({ resolved, cancelled });
}

async function awardCoins(db: ReturnType<typeof adminSupabase>, userId: string, amount: number) {
  // Fetch current balance then increment — user_currency has no RPC for this
  const { data } = await db.from("user_currency").select("coins, total_earned").eq("user_id", userId).maybeSingle();
  if (data) {
    await db.from("user_currency").update({
      coins:        (data.coins        ?? 0) + amount,
      total_earned: (data.total_earned ?? 0) + amount,
      updated_at:   new Date().toISOString(),
    }).eq("user_id", userId);
  } else {
    await db.from("user_currency").insert({ user_id: userId, coins: amount, total_earned: amount });
  }
}

async function checkAndAwardBadge(
  db: ReturnType<typeof adminSupabase>,
  userId: string,
  badge: string,
  relatedId: string
) {
  const { data: existing } = await db
    .from("aura_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", `badge_${badge}`)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    await awardAura(userId, `badge_${badge}`, relatedId, 50);
  }
}

async function sendDuelNotification(
  db: ReturnType<typeof adminSupabase>,
  recipientId: string,
  actorId: string | null,
  type: string,
  data: Record<string, unknown>
) {
  if (!recipientId) return;
  try {
    await db.from("notifications").insert({
      user_id:  recipientId,
      type,
      actor_id: actorId ?? null,
      data,
      read: false,
    });
  } catch {}
}
