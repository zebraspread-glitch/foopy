import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import playersJson from "@/app/data/players.json";
import { awardAura } from "@/app/lib/aura";

// Build apiSportsId → name lookup so match_cache stats (ID-keyed) can be
// matched against question option_a/option_b (name-keyed).
const PLAYER_NAME_BY_ID = new Map<number, string>(
  (playersJson as { apiSportsId?: number | null; name?: string }[])
    .filter(p => p.apiSportsId && p.name)
    .map(p => [Number(p.apiSportsId), p.name!])
);

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const API_BASE    = "https://v1.afl.api-sports.io";

// Margins are now stored as exact numeric strings (e.g. "30")
// Kept for backward compat with any old range-format picks still in the DB
const LEGACY_MARGIN_RANGES = [
  { label: "1-12",  mid: 6  },
  { label: "13-24", mid: 18 },
  { label: "25-36", mid: 30 },
  { label: "37-48", mid: 42 },
  { label: "49+",   mid: 56 },
];
function pickMarginNum(m: string | null | undefined): number {
  if (!m) return -999;
  // New format: exact number
  const direct = Number(m);
  if (Number.isFinite(direct) && direct > 0) return direct;
  // Legacy format: range label
  return LEGACY_MARGIN_RANGES.find(r => r.label === m)?.mid ?? -999;
}

// Same categories as polls
const POLL_CATEGORIES: Record<string, { stat: string; type: string }> = {
  team_winner:       { stat: "winner",     type: "team" },
  team_goals:        { stat: "goals",      type: "team" },
  team_disposals:    { stat: "disposals",  type: "team" },
  team_marks:        { stat: "marks",      type: "team" },
  team_free_kicks:   { stat: "freesFor",   type: "team" },
  team_hitouts:      { stat: "hitouts",    type: "team" },
  team_clearances:   { stat: "clearances", type: "team" },
  team_inside50s:    { stat: "inside50s",  type: "team" },
  player_goals:      { stat: "goals",      type: "player" },
  player_disposals:  { stat: "disposals",  type: "player" },
  player_marks:      { stat: "marks",      type: "player" },
  player_kicks:      { stat: "kicks",      type: "player" },
  player_handballs:  { stat: "handballs",  type: "player" },
  player_tackles:    { stat: "tackles",    type: "player" },
  player_hitouts:    { stat: "hitouts",    type: "player" },
  player_clearances: { stat: "clearances", type: "player" },
  player_foopy:      { stat: "foopy",      type: "player" },
};

type StatRow = {
  name: string;
  isHome: boolean;
  kicks: number; handballs: number; disposals: number; marks: number;
  tackles: number; hitouts: number; goals: number; behinds: number;
  clearances: number; goalAssists: number; freesFor: number; freesAgainst: number;
};

function num(v: any) { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }

function foopyRating(p: StatRow) {
  const { goals, goalAssists: ga, behinds, kicks, handballs, marks, tackles, hitouts, clearances, freesFor, freesAgainst } = p;
  const disp = kicks + handballs;
  let score = goals * 5.5 + ga * 1.5 + behinds * 1.2 + kicks * 0.75 +
    handballs * 0.55 + marks * 1.0 + tackles * 1.8 + hitouts * 0.35 +
    clearances * 0.5 + freesFor * 0.3 - freesAgainst * 0.4;
  if (goals >= 3) score += 3; if (goals >= 5) score += 5;
  if (goals >= 7) score += 10; if (goals >= 10) score += 18;
  if (disp >= 25) score += 3; if (disp >= 30) score += 4;
  if (tackles >= 8) score += 4; if (marks >= 10) score += 3;
  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(1));
}

// Returns 'a' or 'b' (the winning option), or null for a tie
function resolveQuestion(
  categoryKey: string,
  optionA: string,
  optionB: string,
  homeStats: StatRow[],
  awayStats: StatRow[],
  homeTeam: string,
  awayTeam: string,
  hScore: number,
  aScore: number
): "a" | "b" | null {
  const cat = POLL_CATEGORIES[categoryKey];
  if (!cat) return null;

  if (cat.type === "team") {
    if (cat.stat === "winner") {
      if (hScore === aScore) return null;
      const winTeam = hScore > aScore ? homeTeam : awayTeam;
      if (norm(optionA) === norm(winTeam)) return "a";
      if (norm(optionB) === norm(winTeam)) return "b";
      return null;
    }
    const stat = cat.stat as keyof StatRow;
    const homeTotal = homeStats.reduce((s, p) => s + num(p[stat]), 0);
    const awayTotal = awayStats.reduce((s, p) => s + num(p[stat]), 0);
    if (homeTotal === awayTotal) return null;
    const winTeam = homeTotal > awayTotal ? homeTeam : awayTeam;
    if (norm(optionA) === norm(winTeam)) return "a";
    if (norm(optionB) === norm(winTeam)) return "b";
    return null;
  }

  if (cat.type === "player") {
    const allStats = [...homeStats, ...awayStats];
    const stat = cat.stat;
    const findStat = (name: string) => {
      const p = allStats.find(s => norm(s.name) === norm(name));
      if (!p) return -1;
      return stat === "foopy" ? foopyRating(p) : num(p[stat as keyof StatRow]);
    };
    const valA = findStat(optionA);
    const valB = findStat(optionB);
    if (valA === valB) return null;
    return valA > valB ? "a" : "b";
  }

  return null;
}


function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function fetchPlayerStats(apiSportsId: string): Promise<StatRow[]> {
  // Prefer match_cache (populated by sync-round-stats every minute) to avoid
  // hitting the API-Sports rate limit during batch resolution of multiple duels.
  try {
    const db = adminSupabase();
    const { data: cached } = await db
      .from("match_cache")
      .select("payload")
      .eq("game_id", apiSportsId)
      .eq("data_type", "player_stats")
      .maybeSingle();
    if (cached?.payload) {
      const teams: any[] = (cached.payload as any)?.response?.[0]?.teams ?? [];
      if (teams.length > 0) return parseTeams(teams);
    }
  } catch {}

  // Fall back to direct API-Sports call if cache miss
  try {
    const res = await fetch(
      `${API_BASE}/games/statistics/players?id=${apiSportsId}`,
      { headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const teams: any[] = data?.response?.[0]?.teams ?? [];
    return parseTeams(teams);
  } catch { return []; }
}

function parseTeams(teams: any[]): StatRow[] {
  const rows: StatRow[] = [];
  for (let ti = 0; ti < teams.length; ti++) {
    const isHome = ti === 0;
    for (const pe of teams[ti].players ?? []) {
      const s = pe.statistics ?? pe;
      const n = (v: any) => Number(v ?? 0) || 0;
      const kicks = n(s.kicks ?? s.Kicks);
      const handballs = n(s.handballs ?? s.Handballs);
      // Prefer the name from players.json mapping (match_cache may omit it)
      const pid = Number(pe.player?.id ?? 0);
      const playerName = pe.player?.name || PLAYER_NAME_BY_ID.get(pid) || "";
      rows.push({
        name: playerName,
        isHome,
        kicks, handballs,
        disposals:    kicks + handballs,
        marks:        n(s.marks      ?? s.Marks),
        tackles:      n(s.tackles    ?? s.Tackles),
        hitouts:      n(s.hitouts    ?? s.Hitouts),
        goals:        n(s.goals      ?? s.Goals),
        behinds:      n(s.behinds    ?? s.Behinds),
        clearances:   n(s.clearances ?? s.Clearances),
        goalAssists:  n(s.goalAssists ?? s.goal_assists ?? 0),
        freesFor:     n(s.freesFor   ?? s.frees_for    ?? s.FreesFor    ?? 0),
        freesAgainst: n(s.freesAgainst ?? s.frees_against ?? s.FreesAgainst ?? 0),
      });
    }
  }
  return rows;
}

// Vercel cron jobs send GET with "Authorization: Bearer <secret>"
// Keep POST for backward compat (manual triggers)
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runResolution();
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  const auth   = req.headers.get("authorization");
  if (secret !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runResolution();
}

async function runResolution() {

  const db = adminSupabase();
  let resolved = 0;
  let cancelled = 0;

  // Cancel waiting duels whose game has already started
  const { data: staleWaiting } = await db.from("duels").select("id, duel_game_id").eq("status", "waiting").is("opponent_id", null);
  if ((staleWaiting ?? []).length > 0) {
    const waitIds = [...new Set(staleWaiting!.map((d: any) => d.duel_game_id).filter(Boolean))];
    const { data: waitGames } = await db.from("duel_games").select("id, game_date").in("id", waitIds);
    const waitGameMap = new Map((waitGames ?? []).map((g: any) => [g.id, g]));
    for (const d of staleWaiting ?? []) {
      const gameDate = waitGameMap.get((d as any).duel_game_id)?.game_date;
      if (gameDate && new Date(gameDate) <= new Date()) {
        await db.from("duels").update({ status: "cancelled" }).eq("id", d.id);
        cancelled++;
      }
    }
  }

  // Find active duels — fetch duel_game separately to avoid FK join issues
  const { data: activeDuels } = await db.from("duels").select("*").eq("status", "active");

  // Prefetch all relevant duel_game rows in one query
  const duelGameIds = [...new Set((activeDuels ?? []).map((d: any) => d.duel_game_id).filter(Boolean))];
  const { data: duelGameRows } = duelGameIds.length
    ? await db.from("duel_games").select("id, game_id, home_team, away_team, status").in("id", duelGameIds)
    : { data: [] };
  const duelGameMap = new Map((duelGameRows ?? []).map((g: any) => [g.id, g]));

  for (const duel of activeDuels ?? []) {
    const duelGame = duelGameMap.get(duel.duel_game_id);
    if (!duelGame) continue;

    // Fetch score from Squiggle — also used to auto-complete duel_game when
    // the AFL game finishes (complete=100) and stats have had time to settle
    let hScore = 0, aScore = 0;
    let gameIsComplete = duelGame.status === "complete";
    try {
      const sq = await fetch(`https://api.squiggle.com.au/?q=games;game=${duelGame.game_id}`, {
        headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store",
      });
      if (sq.ok) {
        const sqData = await sq.json();
        const g = sqData.games?.[0];
        if (g) {
          hScore = num(g.hscore);
          aScore = num(g.ascore);
          // Auto-complete: Squiggle shows 100% done AND the last update was
          // at least 7 minutes ago (enough time for API-Sports stats to publish)
          if (!gameIsComplete && num(g.complete) >= 100 && g.updated) {
            const msSinceUpdate = Date.now() - new Date(g.updated).getTime();
            if (msSinceUpdate >= 7 * 60 * 1000) {
              gameIsComplete = true;
              await db.from("duel_games").update({ status: "complete" }).eq("id", duelGame.id);
            }
          }
        }
      }
    } catch {}

    if (!gameIsComplete) continue;

    // Fetch player stats from API-Sports
    const apiSportsId = API_SPORTS_MATCH_IDS[String(duelGame.game_id)];
    let allStats: StatRow[] = [];
    if (apiSportsId) allStats = await fetchPlayerStats(String(apiSportsId));
    const homeStats = allStats.filter(p => p.isHome);
    const awayStats = allStats.filter(p => !p.isHome);

    // Get questions and auto-resolve correct answers
    const { data: questions } = await db
      .from("duel_questions")
      .select("*")
      .eq("duel_game_id", duel.duel_game_id);

    if (!questions?.length) continue;

    // Set correct_answer on each question from stats
    for (const q of questions) {
      if (q.correct_answer) continue; // already resolved

      if (q.is_tiebreaker) {
        // Tiebreaker: team pick is team_winner, margin from score
        const winTeam = hScore > aScore ? duelGame.home_team : hScore < aScore ? duelGame.away_team : null;
        const correctAnswer = winTeam
          ? (norm(q.option_a) === norm(winTeam) ? "a" : "b")
          : null;
        const correctMargin = Math.abs(hScore - aScore) > 0
          ? String(Math.abs(hScore - aScore))
          : null;
        if (correctAnswer) {
          await db.from("duel_questions").update({ correct_answer: correctAnswer, correct_margin: correctMargin }).eq("id", q.id);
          q.correct_answer = correctAnswer;
          q.correct_margin = correctMargin;
        }
        continue;
      }

      if (!q.category_key) continue;

      const correctAnswer = resolveQuestion(
        q.category_key, q.option_a, q.option_b,
        homeStats, awayStats, duelGame.home_team, duelGame.away_team, hScore, aScore
      );
      if (correctAnswer) {
        await db.from("duel_questions").update({ correct_answer: correctAnswer }).eq("id", q.id);
        q.correct_answer = correctAnswer;
      }
    }

    // Score picks
    const { data: allPicks } = await db.from("duel_picks").select("*").eq("duel_id", duel.id);
    const challengerPicks = (allPicks ?? []).filter(p => p.user_id === duel.challenger_id);
    const opponentPicks   = (allPicks ?? []).filter(p => p.user_id === duel.opponent_id);

    // Handle forfeits
    if (challengerPicks.length === 0 && opponentPicks.length > 0) {
      await finaliseDuel(db, duel, duel.opponent_id, false, false, true, false);
      resolved++; continue;
    }
    if (opponentPicks.length === 0 && challengerPicks.length > 0) {
      await finaliseDuel(db, duel, duel.challenger_id, false, false, false, true);
      resolved++; continue;
    }
    if (challengerPicks.length === 0 && opponentPicks.length === 0) continue;

    const regularQs = questions.filter(q => !q.is_tiebreaker && q.correct_answer);
    const tbQuestion = questions.find(q => q.is_tiebreaker && q.correct_answer);

    let challengerScore = 0, opponentScore = 0;

    for (const q of regularQs) {
      const cp = challengerPicks.find(p => p.question_id === q.id);
      const op = opponentPicks.find(p   => p.question_id === q.id);
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

    const challengerPerfect = challengerScore === regularQs.length && regularQs.length === 10;
    const opponentPerfect   = opponentScore   === regularQs.length && regularQs.length === 10;

    // Determine winner
    let winnerId: string | null = null;
    let isDraw = false;

    if (challengerScore > opponentScore) {
      winnerId = duel.challenger_id;
    } else if (opponentScore > challengerScore) {
      winnerId = duel.opponent_id;
    } else if (tbQuestion) {
      // Tiebreaker: compare team pick then margin
      const cp = challengerPicks.find(p => p.question_id === tbQuestion.id);
      const op = opponentPicks.find(p   => p.question_id === tbQuestion.id);
      const cTeamRight = cp?.pick === tbQuestion.correct_answer;
      const oTeamRight = op?.pick === tbQuestion.correct_answer;

      if (cp) await db.from("duel_picks").update({ is_correct: cTeamRight }).eq("id", cp.id);
      if (op) await db.from("duel_picks").update({ is_correct: oTeamRight }).eq("id", op.id);

      if (cTeamRight && !oTeamRight) {
        winnerId = duel.challenger_id;
      } else if (oTeamRight && !cTeamRight) {
        winnerId = duel.opponent_id;
      } else if (cTeamRight && oTeamRight && tbQuestion.correct_margin) {
        const correctMid = pickMarginNum(tbQuestion.correct_margin);
        const cpDist = Math.abs(pickMarginNum(cp?.pick_margin) - correctMid);
        const opDist = Math.abs(pickMarginNum(op?.pick_margin) - correctMid);
        if (cpDist < opDist)      winnerId = duel.challenger_id;
        else if (opDist < cpDist) winnerId = duel.opponent_id;
        else isDraw = true; // same distance → draw, no rewards
      } else {
        isDraw = true;
      }
    } else {
      isDraw = true;
    }

    await finaliseDuel(db, duel, winnerId, isDraw, challengerPerfect, false, false, challengerScore, opponentScore, opponentPerfect);
    resolved++;
  }

  return NextResponse.json({ resolved, cancelled });
}

async function finaliseDuel(
  db: ReturnType<typeof adminSupabase>,
  duel: any,
  winnerId: string | null,
  isDraw: boolean,
  challengerPerfect: boolean,
  challengerForfeited: boolean,
  opponentForfeited: boolean,
  challengerScore = 0,
  opponentScore = 0,
  opponentPerfect = false,
) {
  let challengerAura = 0, challengerCoins = 0;
  let opponentAura   = 0, opponentCoins   = 0;

  if (!isDraw) {
    if (winnerId === duel.challenger_id) {
      challengerAura  = challengerPerfect ? 200 : 100;
      challengerCoins = challengerPerfect ? 100 : 50;
      if (!challengerForfeited) opponentAura = 20;
    } else if (winnerId === duel.opponent_id) {
      opponentAura  = opponentPerfect ? 200 : 100;
      opponentCoins = opponentPerfect ? 100 : 50;
      if (!opponentForfeited) challengerAura = 20;
    }
  }

  await db.from("duels").update({
    status: "complete",
    winner_id: winnerId,
    is_draw: isDraw,
    challenger_score: challengerScore,
    opponent_score:   opponentScore,
    challenger_perfect: challengerPerfect,
    opponent_perfect:   opponentPerfect,
    challenger_forfeited: challengerForfeited,
    opponent_forfeited:   opponentForfeited,
    aura_awarded_challenger:  challengerAura,
    coins_awarded_challenger: challengerCoins,
    aura_awarded_opponent:  opponentAura,
    coins_awarded_opponent: opponentCoins,
    completed_at: new Date().toISOString(),
  }).eq("id", duel.id);

  if (winnerId === duel.challenger_id) {
    await awardAura(duel.challenger_id, "duel_win",  duel.id, challengerAura);
    if (opponentAura > 0) await awardAura(duel.opponent_id, "duel_loss", duel.id, opponentAura);
  } else if (winnerId === duel.opponent_id) {
    await awardAura(duel.opponent_id,   "duel_win",  duel.id, opponentAura);
    if (challengerAura > 0) await awardAura(duel.challenger_id, "duel_loss", duel.id, challengerAura);
  }

  if (challengerCoins > 0) await awardCoins(db, duel.challenger_id, challengerCoins);
  if (opponentCoins   > 0) await awardCoins(db, duel.opponent_id,   opponentCoins);

  if (winnerId) await checkBadge(db, winnerId, "first_blood", duel.id);
  if (challengerPerfect) await checkBadge(db, duel.challenger_id, "perfect_duellist", duel.id);
  if (opponentPerfect)   await checkBadge(db, duel.opponent_id,   "perfect_duellist", duel.id);

  await notify(db, duel.challenger_id, duel.opponent_id, "duel_result", {
    duel_id: duel.id,
    result:  isDraw ? "draw" : winnerId === duel.challenger_id ? "win" : "loss",
    aura:    challengerAura, coins: challengerCoins,
  });
  await notify(db, duel.opponent_id, duel.challenger_id, "duel_result", {
    duel_id: duel.id,
    result:  isDraw ? "draw" : winnerId === duel.opponent_id ? "win" : "loss",
    aura:    opponentAura, coins: opponentCoins,
  });
}

async function awardCoins(db: ReturnType<typeof adminSupabase>, userId: string, amount: number) {
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

async function checkBadge(db: ReturnType<typeof adminSupabase>, userId: string, badge: string, relatedId: string) {
  const { data } = await db.from("aura_events").select("id").eq("user_id", userId).eq("event_type", `badge_${badge}`).limit(1).maybeSingle();
  if (!data) await awardAura(userId, `badge_${badge}`, relatedId, 50);
}

async function notify(db: ReturnType<typeof adminSupabase>, recipientId: string, actorId: string | null, type: string, data: Record<string, unknown>) {
  if (!recipientId) return;
  try {
    await db.from("notifications").insert({ user_id: recipientId, type, actor_id: actorId ?? null, data, read: false });
  } catch {}
}
