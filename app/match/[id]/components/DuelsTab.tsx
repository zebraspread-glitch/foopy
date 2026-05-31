"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { teamColors } from "../utils";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";

function teamLogoUrl(name: string): string {
  const k = name.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    adelaide:"crows",adelaidecrows:"crows",brisbane:"lions",brisbanelions:"lions",
    carlton:"blues",collingwood:"magpies",essendon:"bombers",fremantle:"dockers",
    geelong:"cats",geelongcats:"cats",goldcoast:"suns",goldcoastsuns:"suns",
    gws:"giants",gwsgiants:"giants",greaterwesternsydney:"giants",
    hawthorn:"hawks",hawthornhawks:"hawks",melbourne:"demons",melbournedemons:"demons",
    northmelbourne:"kangaroos",northmelbournekangaroos:"kangaroos",
    portadelaide:"power",portadelaidepower:"power",richmond:"tigers",richmondtigers:"tigers",
    stkilda:"saints",stkildasaints:"saints",sydney:"swans",sydneyswans:"swans",
    westcoast:"eagles",westcoasteagles:"eagles",westernbulldogs:"bulldogs",
  };
  const slug = map[k];
  return slug ? `/team-logos/${slug}.png` : "";
}

const MARGIN_RANGES = ["1-12", "13-24", "25-36", "37-48", "49+"];

const DUEL_STAT_CATS: Record<string, { key: string; label: string; type: "player" | "team" }> = {
  player_goals:      { key: "goals",      label: "goals",   type: "player" },
  player_disposals:  { key: "disposals",  label: "disp",    type: "player" },
  player_marks:      { key: "marks",      label: "marks",   type: "player" },
  player_kicks:      { key: "kicks",      label: "kicks",   type: "player" },
  player_handballs:  { key: "handballs",  label: "HBs",     type: "player" },
  player_tackles:    { key: "tackles",    label: "tackles", type: "player" },
  player_hitouts:    { key: "hitouts",    label: "hitouts", type: "player" },
  player_clearances: { key: "clearances", label: "clears",  type: "player" },
  player_foopy:      { key: "foopy",      label: "foopy",   type: "player" },
  team_winner:       { key: "score",      label: "pts",     type: "team"   },
  team_goals:        { key: "goals",      label: "goals",   type: "team"   },
  team_disposals:    { key: "disposals",  label: "disp",    type: "team"   },
  team_marks:        { key: "marks",      label: "marks",   type: "team"   },
  team_free_kicks:   { key: "freesFor",   label: "frees",   type: "team"   },
  team_hitouts:      { key: "hitouts",    label: "hitouts", type: "team"   },
  team_clearances:   { key: "clearances", label: "clears",  type: "team"   },
  team_inside50s:    { key: "inside50s",  label: "i50s",    type: "team"   },
};

type LiveStat = {
  name: string; isHome: boolean;
  goals: number; disposals: number; marks: number; kicks: number;
  handballs: number; tackles: number; hitouts: number; clearances: number;
  behinds: number; goalAssists: number; freesFor: number; freesAgainst: number;
  inside50s: number;
};

type LiveGameStats = {
  players: LiveStat[];
  homeTeam: string;
  awayTeam: string;
};

function liveStatFoopy(p: LiveStat): number {
  let score = p.goals * 5.5 + p.goalAssists * 1.5 + p.behinds * 1.2 +
    p.kicks * 0.75 + p.handballs * 0.55 + p.marks * 1.0 +
    p.tackles * 1.8 + p.hitouts * 0.35 + p.clearances * 0.5 +
    p.freesFor * 0.3 - p.freesAgainst * 0.4;
  if (p.goals >= 3)      score += 3;
  if (p.goals >= 5)      score += 5;
  if (p.goals >= 7)      score += 10;
  if (p.goals >= 10)     score += 18;
  if (p.disposals >= 25) score += 3;
  if (p.disposals >= 30) score += 4;
  if (p.tackles >= 8)    score += 4;
  if (p.marks >= 10)     score += 3;
  if (score <= 0) return 0;
  return Math.round(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))) * 10) / 10;
}

type DuelQuestion = {
  id: string;
  question_order: number;
  is_tiebreaker: boolean;
  question_text: string;
  option_a: string;
  option_b: string;
  option_a_image: string | null;
  option_b_image: string | null;
  option_a_team: string | null;
  option_b_team: string | null;
  category_key: string | null;
  correct_answer: "a" | "b" | null;
  correct_margin: string | null;
};

type DuelGame = {
  id: string;
  game_id: number;
  round: number;
  season: number;
  home_team: string;
  away_team: string;
  game_date: string;
  status: "open" | "locked" | "complete";
};

type Duel = {
  id: string;
  duel_game_id: string;
  challenger_id: string;
  opponent_id: string | null;
  status: "waiting" | "active" | "complete" | "cancelled";
  challenger_score: number | null;
  opponent_score: number | null;
  winner_id: string | null;
  is_draw: boolean;
  challenger_perfect: boolean;
  opponent_perfect: boolean;
  challenger_forfeited: boolean;
  opponent_forfeited: boolean;
  aura_awarded_challenger: number;
  coins_awarded_challenger: number;
  aura_awarded_opponent: number;
  coins_awarded_opponent: number;
  challenger: { id: string; username: string; display_name: string; avatar_url: string | null; aura?: number; favourite_team?: string | null; duelRecord?: { wins: number; losses: number; draws: number } } | null;
  opponent:   { id: string; username: string; display_name: string; avatar_url: string | null; aura?: number; favourite_team?: string | null; duelRecord?: { wins: number; losses: number; draws: number } } | null;
};

type Pick = {
  id: string;
  question_id: string;
  pick: "a" | "b";
  pick_margin?: string | null;
  is_correct: boolean | null;
};

type DraftPick = {
  question_id: string;
  pick: "a" | "b" | null;
  pick_margin?: string | null;
};

export default function DuelsTab({
  gameId, gameStarted, apiSportsGameId,
  matchHomeStats, matchAwayStats, matchHomeTeam, matchAwayTeam,
  onDuelGameFound,
}: {
  gameId: number;
  gameStarted: boolean;
  apiSportsGameId?: string;
  /** Live player stats piped in directly from the match page (same data as the stats tab) */
  matchHomeStats?: any[];
  matchAwayStats?: any[];
  matchHomeTeam?: string;
  matchAwayTeam?: string;
  onDuelGameFound?: (found: boolean) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [duelGame, setDuelGame]     = useState<DuelGame | null>(null);
  const [duel, setDuel]             = useState<Duel | null>(null);
  const [questions, setQuestions]   = useState<DuelQuestion[]>([]);
  const [myPicks, setMyPicks]       = useState<Pick[]>([]);
  const [oppPicks, setOppPicks]     = useState<Pick[]>([]);

  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading]       = useState(true);
  const [entering, setEntering]     = useState(false);
  const [enterError, setEnterError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [liveGameStats, setLiveGameStats] = useState<LiveGameStats | null>(null);

  // Build LiveGameStats from the stats the match page already fetches (same data as the stats tab).
  // Prefer this over the internally-fetched copy so we never have ID-mapping or caching issues.
  const matchDerivedStats = useMemo((): LiveGameStats | null => {
    if (!matchHomeStats?.length && !matchAwayStats?.length) return null;
    const num = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
    const toStat = (p: any, isHome: boolean): LiveStat => ({
      name:         p.player || p.name || "",
      isHome,
      goals:        num(p.goals),
      disposals:    num(p.disposals),
      marks:        num(p.marks),
      kicks:        num(p.kicks),
      handballs:    num(p.handballs),
      tackles:      num(p.tackles),
      hitouts:      num(p.hitouts),
      clearances:   num(p.clearances),
      behinds:      num(p.behinds),
      goalAssists:  num(p.goalAssists ?? (p as any).goalAssists),
      freesFor:     num(p.freesFor   ?? (p as any).freesFor),
      freesAgainst: num(p.freesAgainst ?? (p as any).freesAgainst),
      inside50s:    num(p.inside50s  ?? (p as any).inside50s),
    });
    return {
      players: [
        ...(matchHomeStats ?? []).map(p => toStat(p, true)),
        ...(matchAwayStats ?? []).map(p => toStat(p, false)),
      ],
      homeTeam: matchHomeTeam ?? "",
      awayTeam: matchAwayTeam ?? "",
    };
  }, [matchHomeStats, matchAwayStats, matchHomeTeam, matchAwayTeam]);

  // Use match-page-derived stats when available; fall back to DuelsTab's own fetch
  const effectiveLiveStats = matchDerivedStats ?? liveGameStats;

  // Get auth token
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    // Always get a fresh token — stale tokens cause the API to return duel:null
    // which would reset state and send the user back to the Enter Duel screen
    const { data: sessionData } = await supabase.auth.getSession();
    const freshToken = sessionData.session?.access_token;

    const headers: Record<string, string> = {};
    if (freshToken) headers["authorization"] = `Bearer ${freshToken}`;

    const res = await fetch(`/api/duels/game?game_id=${gameId}`, { headers });
    if (!res.ok) { setLoading(false); return; }

    const json = await res.json();
    setDuelGame(json.duelGame ?? null);
    setDuel(json.duel ?? null);
    setQuestions(json.questions ?? []);
    setMyPicks(json.picks ?? []);
    setOppPicks(json.opponentPicks ?? []);
    setLoading(false);
    onDuelGameFound?.(!!json.duelGame);

    // Initialise draft picks when we have questions but no picks yet.
    // Use functional update so polling never overwrites picks the user has already made.
    if ((json.questions ?? []).length > 0 && (json.picks ?? []).length === 0 && json.duel) {
      setDraftPicks((prev) =>
        prev.length > 0
          ? prev
          : (json.questions as DuelQuestion[]).map((q) => ({
              question_id: q.id,
              pick: null,
              pick_margin: null,
            }))
      );
    }
  }, [gameId, token]);

  useEffect(() => {
    if (token !== null) load();
  }, [load, token]);

  // Poll for match while in waiting status
  useEffect(() => {
    if (duel?.status === "waiting") {
      const iv = setInterval(load, 4000);
      setPollInterval(iv);
      return () => clearInterval(iv);
    } else {
      if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.status]);

  // Fetch live player stats while game is in progress so PicksLockedScreen can show them.
  // Re-runs whenever the resolved API Sports ID, game liveness, or duelGame changes.
  useEffect(() => {
    // Prefer the apiSportsGameId prop (computed by parent with full fallback logic).
    // Fall back to the static mapping if prop not provided.
    const apiId =
      (apiSportsGameId && apiSportsGameId !== "undefined" && apiSportsGameId !== "null")
        ? apiSportsGameId
        : (duelGame ? API_SPORTS_MATCH_IDS[String(duelGame.game_id)] ?? "" : "");

    if (!apiId) return;

    const started = gameStarted || (duelGame ? new Date(duelGame.game_date) <= new Date() : false);
    if (!started) return;

    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(`/api/afl/player-stats?id=${apiId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const teams: any[] = data?.response?.[0]?.teams ?? [];
        if (!teams.length) return;

        const players: LiveStat[] = [];
        for (let ti = 0; ti < teams.length; ti++) {
          const isHome = ti === 0;
          for (const pe of teams[ti]?.players ?? []) {
            const s = pe.statistics ?? pe;
            const n = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
            const kicks = n(s.kicks ?? s.Kicks);
            const hb    = n(s.handballs ?? s.Handballs);
            players.push({
              name:         pe.player?.name ?? "",
              isHome,
              kicks, handballs: hb, disposals: kicks + hb,
              marks:        n(s.marks        ?? s.Marks),
              tackles:      n(s.tackles      ?? s.Tackles),
              hitouts:      n(s.hitouts      ?? s.Hitouts),
              goals:        n(s.goals?.total ?? s.goals   ?? s.Goals),
              behinds:      n(s.behinds      ?? s.Behinds),
              clearances:   n(s.clearances   ?? s.Clearances),
              goalAssists:  n(s.goalAssists  ?? s.goal_assists ?? 0),
              freesFor:     n(s.freesFor     ?? s.frees_for    ?? s.FreesFor    ?? 0),
              freesAgainst: n(s.freesAgainst ?? s.frees_against ?? s.FreesAgainst ?? 0),
              inside50s:    n(s.inside50s    ?? s.insides50    ?? s.Inside50s   ?? 0),
            });
          }
        }
        if (!cancelled && players.length > 0) {
          setLiveGameStats({
            players,
            homeTeam: duelGame?.home_team ?? "",
            awayTeam: duelGame?.away_team ?? "",
          });
        }
      } catch {}
    }

    fetchStats();
    const iv = setInterval(fetchStats, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [apiSportsGameId, duelGame?.game_id, gameStarted]);

  async function enterDuel() {
    if (!duelGame) { setEnterError("Duel not loaded yet — try again"); return; }
    setEntering(true);
    setEnterError("");
    try {
      // Always get a fresh token at click time — stored token may have expired
      const { data: sessionData } = await supabase.auth.getSession();
      const freshToken = sessionData.session?.access_token;
      if (!freshToken) { setEnterError("You need to be signed in to enter a duel."); setEntering(false); return; }

      const res = await fetch("/api/duels/enter", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${freshToken}` },
        body: JSON.stringify({ duel_game_id: duelGame.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        // Immediately set duel state from the response so the UI transitions
        // without waiting on a second round-trip (avoids race conditions)
        if (json.duel) {
          setDuel(json.duel);
          if (questions.length > 0) {
            setDraftPicks(questions.map(q => ({
              question_id: q.id,
              pick: null,
              pick_margin: null,
            })));
          }
          // Don't call load() here — it races the DB write and can return null,
          // resetting duel state. The polling interval handles refresh.
        }
      } else {
        setEnterError(json.error ?? `Server error (${res.status})`);
      }
    } catch (err: any) {
      setEnterError(err?.message ?? "Network error — please try again");
    } finally {
      setEntering(false);
    }
  }

  async function submitPicks() {
    if (!duel) return;
    // Validate all picks set
    const regularPicks = draftPicks.filter((p) => {
      const q = questions.find((q) => q.id === p.question_id);
      return q && !q.is_tiebreaker;
    });
    const tbPick = draftPicks.find((p) => {
      const q = questions.find((q) => q.id === p.question_id);
      return q?.is_tiebreaker;
    });

    if (regularPicks.some((p) => p.pick === null)) {
      alert("Please answer all 10 questions before submitting");
      return;
    }
    if (tbPick && (tbPick.pick === null || !tbPick.pick_margin)) {
      alert("Please answer the tiebreaker question (team + margin)");
      return;
    }

    const picks = draftPicks
      .filter((p) => p.pick !== null)
      .map((p) => ({ question_id: p.question_id, pick: p.pick!, pick_margin: p.pick_margin ?? undefined }));

    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const freshToken = sessionData.session?.access_token;
    if (!freshToken) { setSubmitting(false); alert("Not signed in"); return; }

    const res = await fetch("/api/duels/picks", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${freshToken}` },
      body: JSON.stringify({ duel_id: duel.id, picks }),
    });
    setSubmitting(false);

    if (res.ok) {
      await load();
    } else {
      const json = await res.json().catch(() => ({}));
      // Picks already submitted — refresh to show correct waiting state
      if ((json.error ?? "").includes("already submitted")) {
        await load();
      } else {
        alert(json.error ?? "Failed to submit picks");
      }
    }
  }

  if (loading) return <LoadingSpinner />;

  // No duel game enabled for this match
  if (!duelGame) {
    return (
      <div style={emptyStyle}>
        <span style={{ fontSize: 32 }}>⚔</span>
        <p style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>No Duel for this game</p>
        <p style={{ color: "#64748b", fontSize: 14 }}>Check back for featured matchups each week.</p>
      </div>
    );
  }

  const isGameStarted = gameStarted || new Date(duelGame.game_date) <= new Date();
  const regularQs     = questions.filter((q) => !q.is_tiebreaker);
  const tbQuestion    = questions.find((q) => q.is_tiebreaker);

  // ── Not entered yet ──
  if (!duel) {
    if (isGameStarted) {
      return (
        <div style={emptyStyle}>
          <span style={{ fontSize: 32 }}>⚔</span>
          <p style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Entries Closed</p>
          <p style={{ color: "#64748b", fontSize: 14 }}>Duels for this game are now locked.</p>
        </div>
      );
    }
    if (!userId) {
      return (
        <div style={emptyStyle}>
          <span style={{ fontSize: 32 }}>⚔</span>
          <p style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Sign in to Duel</p>
          <p style={{ color: "#64748b", fontSize: 14 }}>Log in to challenge someone for this game.</p>
        </div>
      );
    }
    return <EnterDuelScreen duelGame={duelGame} onEnter={enterDuel} entering={entering} error={enterError} />;
  }

  // ── Cancelled ──
  if (duel.status === "cancelled") {
    return (
      <div style={emptyStyle}>
        <span style={{ fontSize: 32 }}>⚔</span>
        <p style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Duel Cancelled</p>
        <p style={{ color: "#64748b", fontSize: 14 }}>No opponent was found before the game started.</p>
      </div>
    );
  }

  // ── Waiting for opponent ──
  if (duel.status === "waiting") {
    const hasPicks = myPicks.length > 0;
    if (!hasPicks && draftPicks.length > 0) {
      return (
        <PicksForm
          questions={regularQs}
          tbQuestion={tbQuestion}
          draftPicks={draftPicks}
          onChange={setDraftPicks}
          onSubmit={submitPicks}
          submitting={submitting}
          headerNote="Submit your picks now, then we'll match you with an opponent."
          duelGame={duelGame}
          isGameStarted={isGameStarted}
        />
      );
    }
    return <WaitingScreen duelGame={duelGame} picksSubmitted={hasPicks} />;
  }

  // ── Active — picks not yet submitted ──
  if (duel.status === "active" && myPicks.length === 0) {
    const opponent = duel.challenger_id === userId ? duel.opponent : duel.challenger;
    return (
      <PicksForm
        questions={regularQs}
        tbQuestion={tbQuestion}
        draftPicks={draftPicks}
        onChange={setDraftPicks}
        onSubmit={submitPicks}
        submitting={submitting}
        opponent={opponent}
        headerNote={null}
        duelGame={duelGame}
        isGameStarted={isGameStarted}
      />
    );
  }

  // ── Active — picks submitted, waiting for game ──
  if (duel.status === "active" && myPicks.length > 0) {
    const opponent = duel.challenger_id === userId ? duel.opponent : duel.challenger;
    const me = duel.challenger_id === userId ? duel.challenger : duel.opponent;
    return (
      <PicksLockedScreen
        opponent={opponent}
        me={me}
        duelGame={duelGame}
        questions={questions}
        myPicks={myPicks}
        oppPicks={oppPicks}
        liveGameStats={effectiveLiveStats}
      />
    );
  }

  // ── Complete — show result ──
  if (duel.status === "complete") {
    return (
      <ResultScreen
        duel={duel}
        questions={questions}
        myPicks={myPicks}
        oppPicks={oppPicks}
        userId={userId!}
      />
    );
  }

  return null;
}

// ── Sub-components ─────────────────────────────────��──────────────────────────

function EnterDuelScreen({
  duelGame, onEnter, entering, error,
}: {
  duelGame: DuelGame;
  onEnter: () => void;
  entering: boolean;
  error?: string;
}) {
  return (
    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={duelBannerStyle}>
        <span style={{ fontSize: 40 }}>⚔</span>
        <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>DUEL AVAILABLE</div>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>
          {duelGame.home_team} vs {duelGame.away_team}
        </div>
      </div>

      <div style={rulesCardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>How it works</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 14, lineHeight: 1.7 }}>
          <li>Answer 10 AFL predictions + 1 tiebreaker</li>
          <li>Get matched against a random opponent</li>
          <li>Most correct picks wins</li>
          <li>Win: <strong style={{ color: "#4ade80" }}>+100 aura, +50 coins</strong></li>
          <li>Perfect (10/10): <strong style={{ color: "#f59e0b" }}>+200 aura, +100 coins</strong></li>
        </ul>
      </div>

      <button
        className="button"
        style={{ width: "100%", maxWidth: 360, padding: "14px", fontSize: 16, fontWeight: 800 }}
        onClick={onEnter}
        disabled={entering}
      >
        {entering ? "Entering..." : "⚔ Enter Duel"}
      </button>
      {error && (
        <div style={{ maxWidth: 360, width: "100%", padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 14, textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function PicksForm({
  questions, tbQuestion, draftPicks, onChange, onSubmit, submitting,
  opponent, headerNote, duelGame, isGameStarted,
}: {
  questions: DuelQuestion[];
  tbQuestion?: DuelQuestion;
  draftPicks: DraftPick[];
  onChange: (picks: DraftPick[]) => void;
  onSubmit: () => void;
  submitting: boolean;
  opponent?: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  headerNote: string | null;
  duelGame: DuelGame;
  isGameStarted: boolean;
}) {
  if (isGameStarted) {
    return (
      <div style={emptyStyle}>
        <span style={{ fontSize: 32 }}>🔒</span>
        <p style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Picks Locked</p>
        <p style={{ color: "#64748b", fontSize: 14 }}>The game has started. Your duel will be cancelled.</p>
      </div>
    );
  }

  function setPick(questionId: string, pick: "a" | "b") {
    onChange(draftPicks.map((p) => p.question_id === questionId ? { ...p, pick } : p));
  }
  function setMargin(questionId: string, margin: string) {
    onChange(draftPicks.map((p) => p.question_id === questionId ? { ...p, pick_margin: margin } : p));
  }

  const answered = draftPicks.filter((p) => {
    const q = questions.find((q) => q.id === p.question_id);
    return q && p.pick !== null;
  }).length;

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      {opponent && (
        <div style={opponentBannerStyle}>
          <UserAvatar user={opponent} size={36} />
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>YOU VS</div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {opponent.display_name || opponent.username}
            </div>
          </div>
        </div>
      )}
      {headerNote && (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 16, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
          {headerNote}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {questions.map((q) => {
          const dp = draftPicks.find((p) => p.question_id === q.id);
          return (
            <QuestionCard
              key={q.id}
              question={q}
              pick={dp?.pick ?? null}
              onPick={(pick) => setPick(q.id, pick)}
            />
          );
        })}

        {tbQuestion && (() => {
          const dp = draftPicks.find((p) => p.question_id === tbQuestion.id);
          return (
            <TiebreakerCard
              question={tbQuestion}
              pick={dp?.pick ?? null}
              margin={dp?.pick_margin ?? null}
              onPick={(pick) => setPick(tbQuestion.id, pick)}
              onMargin={(m) => setMargin(tbQuestion.id, m)}
            />
          );
        })()}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: "rgba(20,20,28,0.97)", borderTop: "1px solid var(--border-2)", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {answered} / {questions.length} answered
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            {questions.map((q, i) => {
              const dp = draftPicks.find((p) => p.question_id === q.id);
              return (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: dp?.pick ? "#4ade80" : "rgba(255,255,255,0.15)" }} />
              );
            })}
          </div>
        </div>
        <button
          className="button"
          style={{ width: "100%", padding: "13px", fontWeight: 800, fontSize: 15 }}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Lock In Picks ⚔"}
        </button>
      </div>
    </div>
  );
}

function OptionAvatar({ image, label, size = 44 }: { image: string | null; label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = label.split(" ").map(w => w[0] ?? "").slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.33, fontWeight: 800, color: "#fff" }}>
      {!failed && image
        ? <img src={image} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
        : initials
      }
    </div>
  );
}

function QuestionCard({
  question, pick, onPick,
}: {
  question: DuelQuestion;
  pick: "a" | "b" | null;
  onPick: (pick: "a" | "b") => void;
}) {
  const hasImages = !!(question.option_a_image || question.option_b_image);

  return (
    <div style={questionCardStyle}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>
        Q{question.question_order}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, lineHeight: 1.3 }}>
        {question.question_text}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["a", "b"] as const).map((opt) => {
          const label = opt === "a" ? question.option_a : question.option_b;
          const image = opt === "a" ? question.option_a_image : question.option_b_image;
          const active = pick === opt;
          return (
            <button
              key={opt}
              onClick={() => onPick(opt)}
              style={{
                ...pickBtnStyle,
                background: active ? "#3b82f6" : "var(--surface-2)",
                border: active ? "2px solid #3b82f6" : "2px solid var(--border-2)",
                color: active ? "#fff" : "var(--text-1)",
                fontWeight: active ? 800 : 600,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}
            >
              {hasImages && <OptionAvatar image={image ?? null} label={label} size={48} />}
              <span style={{ fontSize: 13, lineHeight: 1.2, textAlign: "center" }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TiebreakerCard({
  question, pick, margin, onPick, onMargin,
}: {
  question: DuelQuestion;
  pick: "a" | "b" | null;
  margin: string | null;
  onPick: (p: "a" | "b") => void;
  onMargin: (m: string) => void;
}) {
  return (
    <div style={{ ...questionCardStyle, border: "2px solid #f59e0b" }}>
      <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>
        TIEBREAKER
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, lineHeight: 1.3 }}>
        Which team wins, and by what margin?
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {(["a", "b"] as const).map((opt) => {
          const label = opt === "a" ? question.option_a : question.option_b;
          const active = pick === opt;
          return (
            <button
              key={opt}
              onClick={() => onPick(opt)}
              style={{
                ...pickBtnStyle,
                background: active ? "#f59e0b" : "var(--surface-2)",
                border: active ? "2px solid #f59e0b" : "2px solid var(--border-2)",
                color: active ? "#000" : "var(--text-1)",
                fontWeight: active ? 800 : 600,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, fontWeight: 600 }}>
        Winning margin:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MARGIN_RANGES.map((r) => {
          const active = margin === r;
          return (
            <button
              key={r}
              onClick={() => onMargin(r)}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: active ? "#f59e0b" : "var(--surface-2)",
                border: active ? "2px solid #f59e0b" : "2px solid var(--border-2)",
                color: active ? "#000" : "var(--text-1)",
                cursor: "pointer",
              }}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WaitingScreen({ duelGame, picksSubmitted }: { duelGame: DuelGame; picksSubmitted: boolean }) {
  return (
    <div style={{ padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.15)", borderTopColor: "#3b82f6", animation: "spin 0.9s linear infinite" }} />
      <div style={{ fontWeight: 800, fontSize: 18 }}>Waiting for opponent</div>
      <div style={{ color: "#64748b", fontSize: 14 }}>
        {picksSubmitted
          ? "Your picks are locked in. We'll notify you when you're matched!"
          : "Submit your picks — we'll match you with an opponent."}
      </div>
      <div style={{ fontSize: 13, color: "#475569", padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
        {duelGame.home_team} vs {duelGame.away_team} · Round {duelGame.round}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeTeamColor(team: string | null | undefined, fallback = "#334155"): string {
  if (!team) return fallback;
  const c = teamColors(team);
  // Avoid white on dark backgrounds
  if (!c.primary || c.primary === "#ffffff" || c.primary === "#fff") return c.secondary || fallback;
  return c.primary;
}

// ─── Redesigned matchup components ───────────────────────────────────────────

function DuelUserCard({ user, label, accentColor }: {
  user: { username: string; display_name: string; avatar_url: string | null; aura?: number; favourite_team?: string | null; duelRecord?: { wins: number; losses: number; draws: number } } | null;
  label: string;
  accentColor: string;
}) {
  // unused — replaced by inline rendering in PicksLockedScreen
  return null;
}

function PicksLockedScreen({
  opponent, me, duelGame, questions, myPicks, oppPicks, liveGameStats,
}: {
  opponent: Duel["opponent"];
  me: Duel["challenger"];
  duelGame: DuelGame;
  questions: DuelQuestion[];
  myPicks: Pick[];
  oppPicks: Pick[];
  liveGameStats?: LiveGameStats | null;
}) {
  const regularQs  = questions.filter(q => !q.is_tiebreaker);
  const tbQuestion = questions.find(q => q.is_tiebreaker);

  const meColor  = safeTeamColor(me?.favourite_team,  "#3b82f6");
  const oppColor = safeTeamColor(opponent?.favourite_team, "#64748b");

  return (
    <div style={{ paddingBottom: 60 }}>
      <style>{`
        @keyframes lpr-in {
          from { opacity:0; transform:translateY(18px) scale(0.96); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        @keyframes lpr-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        .lpr-card { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s; }
        .lpr-card:hover  { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
        .lpr-card:active { transform: scale(0.984); box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
        @media (max-width: 500px) {
          .pick-col { position: relative !important; padding: 0 !important; height: 130px !important; overflow: hidden !important; }
          .pick-col-inner { position: absolute !important; inset: 0 !important; }
          .pick-avatar-wrap { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border-radius: 0 !important; border: none !important; flex-shrink: 0 !important; }
          .pick-avatar-img { object-position: top center !important; }
          .pick-name { display: none !important; }
          .pick-team { display: none !important; }
          .pick-gradient { display: block !important; }
          .pick-badge-pos { position: absolute !important; bottom: 8px !important; left: 8px !important; margin: 0 !important; z-index: 3 !important; }
          .pick-badge-pos-right { position: absolute !important; bottom: 8px !important; right: 8px !important; margin: 0 !important; z-index: 3 !important; }
        }
        .pick-gradient { display: none; position: absolute; inset: 0; z-index: 2; pointer-events: none; }
      `}</style>

      {/* ── Matchup header ── */}
      <div style={{
        margin: "0 0 2px",
        background: "#0b0e14",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "18px 16px 16px",
      }}>
        {/* Game pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "lpr-pulse 2s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "#22c55e" }}>PICKS LOCKED</span>
          <span style={{ color: "#1e293b", fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.02em" }}>
            R{duelGame.round} · {duelGame.home_team} vs {duelGame.away_team}
          </span>
        </div>

        {/* VS layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", alignItems: "start", gap: 0 }}>

          {/* Me */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingRight: 12 }}>
            <Link href={me?.username ? `/profile/${me.username}` : "#"} style={{ textDecoration: "none", display: "block" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: `3px solid ${meColor}`, flexShrink: 0 }}>
                <UserAvatar user={me ?? { username: "You", display_name: "You", avatar_url: null }} size={64} />
              </div>
            </Link>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", lineHeight: 1.2 }}>{me?.display_name || me?.username || "You"}</div>
              {me?.favourite_team && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 6 }}>
                  {teamLogoUrl(me.favourite_team) && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: `${meColor}18` }}>
                      <img src={teamLogoUrl(me.favourite_team)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", letterSpacing: "-0.01em" }}>{me.favourite_team}</span>
                </div>
              )}
              {me?.aura != null && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#c084fc", marginTop: 4 }}>✦ {me.aura.toLocaleString()}</div>
              )}
              {me?.duelRecord && (
                <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, marginTop: 4 }}>
                  {me.duelRecord.wins}W · {me.duelRecord.draws}D · {me.duelRecord.losses}L
                </div>
              )}
            </div>
          </div>

          {/* VS divider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 6 }}>
            <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: "#1e293b" }}>VS</span>
            <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Opponent */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingLeft: 12 }}>
            <Link href={opponent?.username ? `/profile/${opponent.username}` : "#"} style={{ textDecoration: "none", display: "block" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", border: `3px solid ${oppColor}`, flexShrink: 0 }}>
                <UserAvatar user={opponent ?? { username: "?", display_name: "?", avatar_url: null }} size={64} />
              </div>
            </Link>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#94a3b8", lineHeight: 1.2 }}>{opponent?.display_name || opponent?.username || "Opponent"}</div>
              {opponent?.favourite_team && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 6 }}>
                  {teamLogoUrl(opponent.favourite_team) && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: `${oppColor}18` }}>
                      <img src={teamLogoUrl(opponent.favourite_team)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", letterSpacing: "-0.01em" }}>{opponent.favourite_team}</span>
                </div>
              )}
              {opponent?.aura != null && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginTop: 4 }}>✦ {opponent.aura.toLocaleString()}</div>
              )}
              {opponent?.duelRecord && (
                <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, marginTop: 4 }}>
                  {opponent.duelRecord.wins}W · {opponent.duelRecord.draws}D · {opponent.duelRecord.losses}L
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pick cards: contested → tiebreaker → agreed ── */}
      {(() => {
        const withPicks = regularQs.map(q => ({
          q,
          mp: myPicks.find(p => p.question_id === q.id) ?? null,
          op: oppPicks.find(p => p.question_id === q.id) ?? null,
        }));
        const different = withPicks.filter(({ mp, op }) => !mp || !op || mp.pick !== op.pick);
        const same      = withPicks.filter(({ mp, op }) => mp && op && mp.pick === op.pick);
        const tbMp = tbQuestion ? myPicks.find(p => p.question_id === tbQuestion.id) ?? null : null;
        const tbOp = tbQuestion ? oppPicks.find(p => p.question_id === tbQuestion.id) ?? null : null;
        let animIdx = 0;

        return (
          <div style={{ padding: "10px 12px 0", display: "flex", flexDirection: "column", gap: 0 }}>

            {/* Contested */}
            {different.length > 0 && (
              <>
                <PickSection label="CONTESTED" type="contested" count={different.length} color="#ef4444" index={animIdx} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {different.map(({ q, mp, op }) => (
                    <LockedPickRow key={q.id} question={q} myPick={mp} oppPick={op} index={animIdx++} liveGameStats={liveGameStats} />
                  ))}
                </div>
              </>
            )}

            {/* Tiebreaker */}
            {tbQuestion && (
              <>
                <PickSection label="TIEBREAKER" type="tiebreaker" count={null} color="#f59e0b" index={animIdx} />
                <div style={{ marginBottom: 16 }}>
                  <LockedPickRow question={tbQuestion} myPick={tbMp} oppPick={tbOp} isTiebreaker index={animIdx++} liveGameStats={liveGameStats} />
                </div>
              </>
            )}

            {/* Agreed */}
            {same.length > 0 && (
              <>
                <PickSection label="AGREED" type="agreed" count={same.length} color="#22c55e" index={animIdx} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {same.map(({ q, mp, op }) => (
                    <LockedPickRow key={q.id} question={q} myPick={mp} oppPick={op} index={animIdx++} liveGameStats={liveGameStats} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function SectionIcon({ type }: { type: "contested" | "tiebreaker" | "agreed" }) {
  if (type === "agreed") return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
  if (type === "tiebreaker") return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
  // contested — two crossing lines (X)
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PickSection({ label, type, count, color, index }: {
  label: string; type: "contested" | "tiebreaker" | "agreed"; count: number | null; color: string; index: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "4px 0 9px",
      color, animation: `lpr-in 0.22s ${Math.min(index * 0.04, 0.3)}s ease both`,
    }}>
      <SectionIcon type={type} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em" }}>{label}</span>
      {count !== null && (
        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.5 }}>{count}</span>
      )}
    </div>
  );
}

function LockedPickRow({ question, myPick, oppPick, isTiebreaker, index = 0, liveGameStats }: {
  question: DuelQuestion;
  myPick: Pick | null;
  oppPick: Pick | null;
  isTiebreaker?: boolean;
  index?: number;
  liveGameStats?: LiveGameStats | null;
}) {
  const myLabel  = myPick  ? (myPick.pick  === "a" ? question.option_a : question.option_b) : "—";
  const oppLabel = oppPick ? (oppPick.pick === "a" ? question.option_a : question.option_b) : "—";

  // Live stat display
  const cat = !isTiebreaker && question.category_key ? DUEL_STAT_CATS[question.category_key] : null;
  function getStatDisplay(optName: string): { value: string; label: string } | null {
    if (!liveGameStats || !cat || !optName || optName === "—") return null;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const lastName = (s: string) => s.trim().split(/\s+/).pop()?.toLowerCase() ?? "";

    if (cat.type === "player") {
      let p = liveGameStats.players.find(pl => norm(pl.name) === norm(optName));
      if (!p) p = liveGameStats.players.find(pl => lastName(pl.name) === lastName(optName) && pl.name.length > 0);
      if (!p) return null;
      if (cat.key === "foopy") return { value: String(liveStatFoopy(p)), label: "foopy" };
      const val = (p as any)[cat.key] as number ?? 0;
      return { value: String(val), label: cat.label };
    }
    if (cat.type === "team" && cat.key !== "score") {
      const normOpt = norm(optName);
      const isHome = normOpt === norm(liveGameStats.homeTeam);
      const isAway = !isHome && normOpt === norm(liveGameStats.awayTeam);
      if (!isHome && !isAway) return null;
      const total = liveGameStats.players
        .filter(p => isHome ? p.isHome : !p.isHome)
        .reduce((sum, p) => sum + ((p as any)[cat.key] as number ?? 0), 0);
      return { value: String(total), label: cat.label };
    }
    return null;
  }
  const myOptName  = myPick  ? (myPick.pick  === "a" ? question.option_a : question.option_b) : null;
  const oppOptName = oppPick ? (oppPick.pick === "a" ? question.option_a : question.option_b) : null;
  const myStat  = myOptName  ? getStatDisplay(myOptName)  : null;
  const oppStat = oppOptName ? getStatDisplay(oppOptName) : null;
  const myImage  = myPick  ? (myPick.pick  === "a" ? question.option_a_image : question.option_b_image) : null;
  const oppImage = oppPick ? (oppPick.pick === "a" ? question.option_a_image : question.option_b_image) : null;
  const myTeam   = myPick  ? (myPick.pick  === "a" ? question.option_a_team  : question.option_b_team)  : null;
  const oppTeam  = oppPick ? (oppPick.pick === "a" ? question.option_a_team  : question.option_b_team)  : null;
  const agree    = !!(myPick && oppPick && myPick.pick === oppPick.pick);

  const myColor  = safeTeamColor(myTeam,  "#3b82f6");
  const oppColor = safeTeamColor(oppTeam, "#475569");

  const delay = `${Math.min(index * 0.045, 0.38)}s`;

  return (
    <div
      className="lpr-card"
      style={{
        borderRadius: 18,
        overflow: "hidden",
        background: "#0e1118",
        border: "1px solid rgba(255,255,255,0.07)",
        animation: `lpr-in 0.3s ${delay} cubic-bezier(0.16,1,0.3,1) both`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
      }}
    >
      {/* Question row */}
      <div style={{
        padding: "13px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#cbd5e1", lineHeight: 1.3 }}>
          {question.question_text}
        </span>
      </div>

      {/* Two option tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>

        {/* My pick */}
        <div className="pick-col" style={{
          padding: "14px 16px 12px",
          background: myPick ? `${myColor}0c` : "transparent",
          boxShadow: myPick ? `inset 2px 0 0 ${myColor}` : undefined,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div className="pick-avatar" style={{
              width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
              background: `${myColor}18`,
              border: myPick ? `2px solid ${myColor}60` : "2px solid rgba(255,255,255,0.08)",
            }}>
              {myImage
                ? <img src={myImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.15)", fontSize: 18 }}>–</div>
              }
            </div>
            <div className="pick-name" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myLabel}</div>
              {myTeam && <div className="pick-team" style={{ fontSize: 10, fontWeight: 600, color: myPick ? myColor : "#475569", marginTop: 2 }}>{myTeam}</div>}
            </div>
          </div>
          {myPick && (
            <div className="pick-badge-pos" style={{ marginTop: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", color: "#3b82f6", background: "#3b82f614", padding: "2px 7px", borderRadius: 999 }}>YOU</span>
              {myStat && (
                <div style={{ marginTop: 4, lineHeight: 1 }}>
                  <div style={{ fontSize: 56, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", lineHeight: 0.9 }}>{myStat.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 5 }}>{myStat.label}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Thin separator */}
        <div style={{ background: "rgba(255,255,255,0.05)", width: 1 }} />

        {/* Opponent pick */}
        <div className="pick-col" style={{
          padding: "14px 16px 12px",
          background: oppPick ? `${oppColor}0a` : "transparent",
          boxShadow: oppPick ? `inset -2px 0 0 ${oppColor}` : undefined,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexDirection: "row-reverse" }}>
            <div className="pick-avatar" style={{
              width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
              background: `${oppColor}15`,
              border: oppPick ? `2px solid ${oppColor}55` : "2px solid rgba(255,255,255,0.08)",
            }}>
              {oppImage
                ? <img src={oppImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.15)", fontSize: 18 }}>–</div>
              }
            </div>
            <div className="pick-name" style={{ minWidth: 0, textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#94a3b8", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {oppPick ? oppLabel : <span style={{ color: "#2d3748", fontStyle: "italic", fontWeight: 400, fontSize: 13 }}>Pending</span>}
              </div>
              {oppTeam && <div className="pick-team" style={{ fontSize: 10, fontWeight: 600, color: oppPick ? oppColor : "#334155", marginTop: 2 }}>{oppTeam}</div>}
            </div>
          </div>
          {oppPick && (
            <div className="pick-badge-pos-right" style={{ marginTop: 10, textAlign: "right" }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", color: "#64748b", background: "#64748b14", padding: "2px 7px", borderRadius: 999 }}>OPP</span>
              {oppStat && (
                <div style={{ marginTop: 4, lineHeight: 1 }}>
                  <div style={{ fontSize: 56, fontWeight: 900, color: "#94a3b8", letterSpacing: "-0.04em", lineHeight: 0.9 }}>{oppStat.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 5 }}>{oppStat.label}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tiebreaker margin strip */}
      {isTiebreaker && (myPick?.pick_margin || oppPick?.pick_margin) && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1px 1fr",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ padding: "7px 16px", fontSize: 11, fontWeight: 600, color: "#64748b" }}>
            by <span style={{ color: "#a78bfa" }}>{myPick?.pick_margin ?? "—"}</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)" }} />
          <div style={{ padding: "7px 16px", fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "right" }}>
            by <span style={{ color: "#a78bfa" }}>{oppPick?.pick_margin ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultScreen({
  duel, questions, myPicks, oppPicks, userId,
}: {
  duel: Duel;
  questions: DuelQuestion[];
  myPicks: Pick[];
  oppPicks: Pick[];
  userId: string;
}) {
  const isChallenger = duel.challenger_id === userId;
  const me       = isChallenger ? duel.challenger : duel.opponent;
  const opponent = isChallenger ? duel.opponent   : duel.challenger;

  const myScore   = isChallenger ? duel.challenger_score  : duel.opponent_score;
  const oppScore  = isChallenger ? duel.opponent_score    : duel.challenger_score;
  const myAura    = isChallenger ? duel.aura_awarded_challenger  : duel.aura_awarded_opponent;
  const myCoins   = isChallenger ? duel.coins_awarded_challenger : duel.coins_awarded_opponent;
  const isPerfect = isChallenger ? duel.challenger_perfect : duel.opponent_perfect;
  const iWon      = duel.winner_id === userId;
  const isDraw    = duel.is_draw;

  const regularQs  = questions.filter((q) => !q.is_tiebreaker);
  const tbQuestion = questions.find((q) => q.is_tiebreaker);

  const resultColor = iWon ? "#4ade80" : isDraw ? "#f59e0b" : "#ef4444";
  const resultLabel = iWon ? "YOU WON" : isDraw ? "DRAW" : "YOU LOST";

  return (
    <div style={{ padding: "16px 16px 40px" }}>
      {/* Result banner */}
      <div style={{ ...resultBannerStyle, borderColor: resultColor }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: resultColor }}>
          {resultLabel}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8 }}>
          <ScoreBubble score={myScore ?? 0} label="You" color={resultColor} />
          <span style={{ fontSize: 22, fontWeight: 900, color: "#475569" }}>–</span>
          <ScoreBubble score={oppScore ?? 0} label={opponent?.display_name || opponent?.username || "Opponent"} color="#475569" />
        </div>
        {isPerfect && (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
            ⭐ Perfect Duellist — 10/10!
          </div>
        )}
        {!isDraw && (myAura > 0 || myCoins > 0) && (
          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {myAura  > 0 && <span style={rewardPillStyle}>+{myAura} aura</span>}
            {myCoins > 0 && <span style={{ ...rewardPillStyle, background: "#f59e0b22", color: "#f59e0b" }}>+{myCoins} coins</span>}
          </div>
        )}
        {isDraw && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
            No rewards — tiebreaker couldn't decide a winner
          </div>
        )}
      </div>

      {/* Opponent card */}
      {opponent && (
        <div style={opponentBannerStyle}>
          <UserAvatar user={opponent} size={36} />
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>YOUR OPPONENT</div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {opponent.display_name || opponent.username}
            </div>
          </div>
        </div>
      )}

      {/* Side-by-side picks */}
      <div style={{ fontWeight: 700, fontSize: 15, margin: "20px 0 12px" }}>Pick breakdown</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {regularQs.map((q) => {
          const mp = myPicks.find((p)  => p.question_id === q.id);
          const op = oppPicks.find((p) => p.question_id === q.id);
          return (
            <PickRow
              key={q.id}
              question={q}
              myPick={mp ?? null}
              oppPick={op ?? null}
            />
          );
        })}

        {tbQuestion && (() => {
          const mp = myPicks.find((p)  => p.question_id === tbQuestion.id);
          const op = oppPicks.find((p) => p.question_id === tbQuestion.id);
          return (
            <PickRow
              key={tbQuestion.id}
              question={tbQuestion}
              myPick={mp ?? null}
              oppPick={op ?? null}
              isTiebreaker
            />
          );
        })()}
      </div>
    </div>
  );
}

function ScoreBubble({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 12, color: "#64748b", maxWidth: 80, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

function PickRow({
  question, myPick, oppPick, isTiebreaker,
}: {
  question: DuelQuestion;
  myPick: Pick | null;
  oppPick: Pick | null;
  isTiebreaker?: boolean;
}) {
  const myLabel    = myPick  ? (myPick.pick  === "a" ? question.option_a : question.option_b) : "—";
  const oppLabel   = oppPick ? (oppPick.pick === "a" ? question.option_a : question.option_b) : "—";
  const myImage    = myPick  ? (myPick.pick  === "a" ? question.option_a_image : question.option_b_image) : null;
  const oppImage   = oppPick ? (oppPick.pick === "a" ? question.option_a_image : question.option_b_image) : null;

  return (
    <div style={pickRowStyle}>
      <div style={{ fontSize: 11, color: isTiebreaker ? "#f59e0b" : "#64748b", fontWeight: 700, marginBottom: 6 }}>
        {isTiebreaker ? "TIEBREAKER" : `Q${question.question_order}`} · {question.question_text}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PickResultCell label={myLabel} image={myImage} correct={myPick?.is_correct ?? null} suffix={myPick?.pick_margin} />
        <PickResultCell label={oppLabel} image={oppImage} correct={oppPick?.is_correct ?? null} suffix={oppPick?.pick_margin} side="opp" />
      </div>
    </div>
  );
}

function PickResultCell({
  label, image, correct, suffix, side,
}: {
  label: string;
  image?: string | null;
  correct: boolean | null;
  suffix?: string | null;
  side?: "opp";
}) {
  const bg = correct === true ? "rgba(74,222,128,0.12)" : correct === false ? "rgba(239,68,68,0.10)" : "var(--surface-2)";
  const icon = correct === true ? "✓" : correct === false ? "✗" : "";
  const iconColor = correct === true ? "#4ade80" : "#ef4444";

  return (
    <div style={{ background: bg, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
      {image && (
        <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.1)" }}>
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {suffix && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>by {suffix}</div>}
        {side === "opp" && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Opponent</div>}
      </div>
      {icon && <span style={{ fontSize: 16, fontWeight: 900, color: iconColor, flexShrink: 0 }}>{icon}</span>}
    </div>
  );
}

function UserAvatar({ user, size }: { user: { username: string; display_name: string; avatar_url: string | null }; size: number }) {
  const [failed, setFailed] = useState(false);
  const initials = (user.display_name || user.username || "?").slice(0, 2).toUpperCase();

  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 800, color: "#fff" }}>
      {!failed && user.avatar_url
        ? <img src={user.avatar_url} alt={user.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
        : initials
      }
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", animation: "spin 0.75s linear infinite" }} />
    </div>
  );
}

// ── Styles ────────────────────────────────��─────────────────────────────��─────

const emptyStyle: React.CSSProperties = {
  padding: "48px 16px", display: "flex", flexDirection: "column", alignItems: "center",
  textAlign: "center", gap: 4, color: "var(--text-1)",
};

const duelBannerStyle: React.CSSProperties = {
  width: "100%", maxWidth: 360,
  padding: "24px 20px", borderRadius: 16,
  background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))",
  border: "2px solid rgba(59,130,246,0.3)",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center",
};

const rulesCardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 360,
  padding: "16px 18px", borderRadius: 14,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
};

const questionCardStyle: React.CSSProperties = {
  padding: "14px", borderRadius: 12,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
};

const pickBtnStyle: React.CSSProperties = {
  padding: "11px 8px", borderRadius: 10, cursor: "pointer",
  fontSize: 13, textAlign: "center", lineHeight: 1.3,
  transition: "all 0.1s",
};

const opponentBannerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "12px 14px", borderRadius: 12, marginBottom: 12,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
};

const resultBannerStyle: React.CSSProperties = {
  padding: "20px 16px", borderRadius: 16, marginBottom: 16,
  background: "var(--surface-2)", border: "2px solid",
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4,
};

const rewardPillStyle: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 999,
  background: "rgba(74,222,128,0.15)", color: "#4ade80",
  fontSize: 13, fontWeight: 800,
};

const pickRowStyle: React.CSSProperties = {
  padding: "12px", borderRadius: 12,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
};
