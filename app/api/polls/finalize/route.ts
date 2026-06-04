import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { awardAura } from "@/app/lib/aura";

export const dynamic = "force-dynamic";

const API_BASE = "https://v1.afl.api-sports.io";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function foopyRating(p: StatRow) {
  const goals = p.goals, ga = p.goalAssists, behinds = p.behinds;
  const kicks = p.kicks, hb = p.handballs, marks = p.marks;
  const tackles = p.tackles, ho = p.hitouts, cl = p.clearances;
  const disp = p.disposals, ff = p.freesFor, fa = p.freesAgainst;

  let score =
    goals * 5.5 + ga * 1.5 + behinds * 1.2 + kicks * 0.75 +
    hb * 0.55 + marks * 1.0 + tackles * 1.8 + ho * 0.35 +
    cl * 0.5 + ff * 0.3 - fa * 0.4;

  if (goals >= 3) score += 3;
  if (goals >= 5) score += 5;
  if (goals >= 7) score += 10;
  if (goals >= 10) score += 18;
  if (ga >= 3) score += 1;
  if (disp >= 25) score += 3;
  if (disp >= 30) score += 4;
  if (tackles >= 8) score += 4;
  if (cl >= 7) score += 1;
  if (marks >= 10) score += 3;
  if (ho >= 25) score += 3;
  if (fa >= 4) score -= 1;

  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(1));
}

type StatRow = {
  name: string;
  isHome: boolean;
  kicks: number; handballs: number; disposals: number; marks: number;
  tackles: number; hitouts: number; goals: number; behinds: number;
  clearances: number; goalAssists: number; freesFor: number; freesAgainst: number;
};

type PollRow = {
  id: string;
  question: string;
  poll_type: string;
  category_key: string | null;
  options: { id: string; label: string }[];
};

const POLL_CATEGORIES: Record<string, { stat: string; type: string }> = {
  team_winner:       { stat: "winner",     type: "team" },
  team_goals:        { stat: "goals",      type: "team" },
  team_disposals:    { stat: "disposals",  type: "team" },
  team_marks:        { stat: "marks",      type: "team" },
  player_goals:      { stat: "goals",      type: "player" },
  player_disposals:  { stat: "disposals",  type: "player" },
  player_marks:      { stat: "marks",      type: "player" },
  player_kicks:      { stat: "kicks",      type: "player" },
  player_handballs:  { stat: "handballs",  type: "player" },
  player_tackles:    { stat: "tackles",    type: "player" },
  player_hitouts:    { stat: "hitouts",    type: "player" },
  player_clearances: { stat: "clearances", type: "player" },
  player_foopy:      { stat: "foopy",      type: "player" },
  anytime_goal:      { stat: "goals",      type: "player_all" },
  goals_2plus:       { stat: "goals",      type: "player_all" },
  goals_3plus:       { stat: "goals",      type: "player_all" },
  goals_4plus:       { stat: "goals",      type: "player_all" },
  disp_20plus:       { stat: "disposals",  type: "player_all" },
  disp_25plus:       { stat: "disposals",  type: "player_all" },
  disp_30plus:       { stat: "disposals",  type: "player_all" },
  disp_35plus:       { stat: "disposals",  type: "player_all" },
};

function resolveWinner(
  poll: PollRow,
  homeStats: StatRow[],
  awayStats: StatRow[],
  homeTeam: string,
  awayTeam: string,
  hScore: number,
  aScore: number
): string | null {
  // Over/Under polls
  if (poll.poll_type === "over_under") {
    const parts = poll.question.split(" — ");
    const playerName = parts[0]?.trim();
    const m = parts[1]?.match(/Over\/Under\s+([\d.]+)\s+(\w+)/i);
    if (!m || !playerName) return null;
    const threshold = parseFloat(m[1]);
    const statKey = m[2].toLowerCase() as keyof StatRow;
    const ps = [...homeStats, ...awayStats].find(
      p => normalise(p.name) === normalise(playerName)
    );
    if (!ps) return null;
    return (ps[statKey] as number) >= threshold ? "Over" : "Under";
  }

  const cat = poll.category_key ? POLL_CATEGORIES[poll.category_key] : null;
  if (!cat) return null;

  // Team polls
  if (cat.type === "team") {
    // team_winner uses game score directly
    if (cat.stat === "winner") {
      if (hScore > aScore) return homeTeam;
      if (aScore > hScore) return awayTeam;
      return null;
    }
    const stat = cat.stat as keyof StatRow;
    const homeTotal = homeStats.reduce((s, p) => s + num(p[stat]), 0);
    const awayTotal = awayStats.reduce((s, p) => s + num(p[stat]), 0);
    if (homeTotal > awayTotal) return homeTeam;
    if (awayTotal > homeTotal) return awayTeam;
    return null;
  }

  // Player & player_all polls — find option with highest stat value
  const allStats = [...homeStats, ...awayStats];
  const stat = cat.stat;
  let best: string | null = null;
  let bestVal = -1;
  for (const opt of poll.options) {
    const ps = allStats.find(p => normalise(p.name) === normalise(opt.label));
    if (!ps) continue;
    const val = stat === "foopy" ? foopyRating(ps) : num(ps[stat as keyof StatRow]);
    if (val > bestVal) { bestVal = val; best = opt.label; }
  }
  return best;
}

function optionMatchesWinner(label: string, winner: string): boolean {
  const wLow = winner.toLowerCase();
  const oLow = label.toLowerCase();
  if (wLow === "over" || wLow === "under") return oLow.startsWith(wLow);
  return normalise(label) === normalise(winner);
}

async function fetchPlayerStats(apiSportsId: string): Promise<StatRow[]> {
  try {
    const res = await fetch(
      `${API_BASE}/games/statistics/players?id=${apiSportsId}`,
      {
        headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY ?? "" },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const teams: any[] = data?.response?.[0]?.teams ?? [];
    const rows: StatRow[] = [];

    // Squiggle home team name is passed separately; we classify by team array index (first = home)
    for (let ti = 0; ti < teams.length; ti++) {
      const team = teams[ti];
      const isHome = ti === 0; // API-Sports returns home team first
      for (const pe of team.players ?? []) {
        const s = pe.statistics ?? pe;
        const n = (v: any) => Number(v ?? 0) || 0;
        const kicks = n(s.kicks ?? s.Kicks);
        const handballs = n(s.handballs ?? s.Handballs);
        rows.push({
          name: pe.player?.name ?? "",
          isHome,
          kicks,
          handballs,
          disposals: kicks + handballs,
          marks: n(s.marks ?? s.Marks),
          tackles: n(s.tackles ?? s.Tackles),
          hitouts: n(s.hitouts ?? s.Hitouts),
          goals: n(s.goals ?? s.Goals),
          behinds: n(s.behinds ?? s.Behinds),
          clearances: n(s.clearances ?? s.Clearances),
          goalAssists: n(s.goalAssists ?? s.goal_assists ?? 0),
          freesFor: n(s.freesFor ?? s.frees_for ?? s.FreesFor ?? 0),
          freesAgainst: n(s.freesAgainst ?? s.frees_against ?? s.FreesAgainst ?? 0),
        });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

// POST /api/polls/finalize  — { game_id: number (squiggle ID) }
// GET  /api/polls/finalize?game_id=X  — same, for cron convenience
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return finalize(body.game_id);
}

export async function GET(req: Request) {
  const gameId = new URL(req.url).searchParams.get("game_id");
  return finalize(gameId ? Number(gameId) : undefined);
}

async function finalize(squiggleGameId: number | undefined) {
  if (!squiggleGameId) {
    return NextResponse.json({ error: "Missing game_id" }, { status: 400 });
  }

  // 1. Fetch game from Squiggle
  const squiggleRes = await fetch(
    `https://api.squiggle.com.au/?q=games;game=${squiggleGameId}`,
    { headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store" }
  );
  if (!squiggleRes.ok) {
    return NextResponse.json({ error: "Squiggle fetch failed" }, { status: 502 });
  }
  const squiggleData = await squiggleRes.json();
  const game = squiggleData.games?.[0];

  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (Number(game.complete ?? 0) < 100 && game.is_final !== 1) {
    return NextResponse.json({ ok: false, reason: "game not final yet" });
  }

  const homeTeam: string = game.hteam ?? "";
  const awayTeam: string = game.ateam ?? "";
  const hScore = num(game.hscore);
  const aScore = num(game.ascore);

  // 2. Fetch player stats from API-Sports
  const apiSportsId = API_SPORTS_MATCH_IDS[String(squiggleGameId)];
  let allStats: StatRow[] = [];
  if (apiSportsId) {
    allStats = await fetchPlayerStats(apiSportsId);
  }
  const homeStats = allStats.filter(p => p.isHome);
  const awayStats = allStats.filter(p => !p.isHome);

  // 3. Fetch polls for this game
  const admin = adminSupabase();
  const { data: polls, error: pollsErr } = await admin
    .from("match_polls")
    .select("id, question, poll_type, category_key, options:match_poll_options(id, label)")
    .eq("game_id", squiggleGameId);

  if (pollsErr) return NextResponse.json({ error: pollsErr.message }, { status: 500 });
  if (!polls?.length) return NextResponse.json({ ok: true, awarded: 0, reason: "no polls" });

  // 4. Fetch all votes for those polls
  const pollIds = polls.map((p: any) => p.id);
  const { data: votes, error: votesErr } = await admin
    .from("match_poll_votes")
    .select("poll_id, option_id, user_id")
    .in("poll_id", pollIds);

  if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 });

  const allVotes: { poll_id: string; option_id: string; user_id: string }[] =
    (votes as any[]) ?? [];

  // 5. For each poll resolve winner and award aura to all correct voters
  let totalAwarded = 0;

  for (const poll of polls as PollRow[]) {
    const winner = resolveWinner(
      poll, homeStats, awayStats, homeTeam, awayTeam, hScore, aScore
    );
    if (!winner) continue;

    const winOpt = poll.options.find(o => optionMatchesWinner(o.label, winner));
    if (!winOpt) continue;

    const correctVoters = allVotes.filter(
      v => v.poll_id === poll.id && v.option_id === winOpt.id
    );
    if (!correctVoters.length) continue;

    const isPlayerAll = poll.poll_type === "player_all";
    const optCount = poll.options.length;
    let auraAmount: number;

    if (isPlayerAll) {
      const vc = correctVoters.length;
      auraAmount = vc === 1 ? 100 : vc <= 3 ? 75 : vc <= 7 ? 50 : vc <= 15 ? 35 : 20;
    } else {
      auraAmount = optCount >= 4 ? 40 : optCount === 3 ? 30 : 20;
    }

    for (const voter of correctVoters) {
      const result = await awardAura(voter.user_id, "poll_correct", `poll_${poll.id}`, auraAmount);
      if (result.awarded) {
        totalAwarded++;
        // Send poll_win notification (non-fatal)
        try {
          await admin.from("notifications").insert({
            user_id: voter.user_id,
            type: "poll_win",
            actor_id: null,
            data: { poll_title: poll.question, aura: auraAmount },
            read: false,
          });
        } catch { /* non-fatal */ }
      }
    }
  }

  // 6. Award bonus aura for correct "Who will win?" picks
  if (hScore !== aScore) {
    const winningSide = hScore > aScore ? "home" : "away";
    const { data: picks } = await admin
      .from("winner_picks")
      .select("voter_id, side")
      .eq("match_id", String(squiggleGameId));

    if (picks && picks.length > 0) {
      const correctPicks = picks.filter((p: any) => p.side === winningSide);
      const totalPicks   = picks.length;
      const correctCount = correctPicks.length;
      // Bonus scales with how bold the pick was (underdog pays more)
      const pctCorrect = correctCount / totalPicks;
      const bonusAura  = pctCorrect < 0.4 ? 20 : pctCorrect < 0.6 ? 10 : 5;

      for (const pick of correctPicks) {
        if (!pick.voter_id) continue;
        // Look up auth user by voter_id (voter_id is stored as user_id for auth'd users)
        const result = await awardAura(
          pick.voter_id,
          "winner_pick_correct",
          `winner_pick_correct:${squiggleGameId}`,
          bonusAura
        );
        if (result.awarded) {
          totalAwarded++;
          try {
            await admin.from("notifications").insert({
              user_id: pick.voter_id,
              type: "poll_win",
              actor_id: null,
              data: { poll_title: `${homeTeam} vs ${awayTeam} — correct winner pick`, aura: bonusAura },
              read: false,
            });
          } catch {}
        }
      }
    }
  }

  return NextResponse.json({ ok: true, awarded: totalAwarded });
}
