"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";
import { teamColors } from "../utils";

const MARGIN_RANGES = ["1-12", "13-24", "25-36", "37-48", "49+"];

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

export default function DuelsTab({ gameId, gameStarted, onDuelGameFound }: { gameId: number; gameStarted: boolean; onDuelGameFound?: (found: boolean) => void }) {
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

    // Initialise draft picks when we have questions but no picks yet
    if ((json.questions ?? []).length > 0 && (json.picks ?? []).length === 0 && json.duel) {
      setDraftPicks((json.questions as DuelQuestion[]).map((q) => ({
        question_id: q.id,
        pick: null,
        pick_margin: null,
      })));
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

function DuelUserCard({ user, label, accentColor }: {
  user: { username: string; display_name: string; avatar_url: string | null; aura?: number; favourite_team?: string | null; duelRecord?: { wins: number; losses: number; draws: number } } | null;
  label: string;
  accentColor: string;
}) {
  const name = user?.display_name || user?.username || label;
  const record = user?.duelRecord;
  const colours = user?.favourite_team ? teamColors(user.favourite_team) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}>
      <div style={{ position: "relative" }}>
        <UserAvatar user={user ?? { username: label, display_name: label, avatar_url: null }} size={54} />
        {colours && (
          <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `2.5px solid ${colours.primary}`, pointerEvents: "none" }} />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: accentColor, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{name}</div>
      {user?.aura != null && (
        <div style={{ fontSize: 12, fontWeight: 700, background: "linear-gradient(135deg,#c084fc,#818cf8,#fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          ✦ {(user.aura).toLocaleString()}
        </div>
      )}
      {colours && user?.favourite_team && (
        <div style={{ fontSize: 11, color: colours.primary, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${colours.primary}22`, border: `1px solid ${colours.primary}40` }}>
          {user.favourite_team}
        </div>
      )}
      {record && (
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
          {record.wins}W–{record.draws}D–{record.losses}L
        </div>
      )}
    </div>
  );
}

function PicksLockedScreen({
  opponent, me, duelGame, questions, myPicks, oppPicks,
}: {
  opponent: Duel["opponent"];
  me: Duel["challenger"];
  duelGame: DuelGame;
  questions: DuelQuestion[];
  myPicks: Pick[];
  oppPicks: Pick[];
}) {
  const regularQs  = questions.filter(q => !q.is_tiebreaker);
  const tbQuestion = questions.find(q => q.is_tiebreaker);

  return (
    <div style={{ padding: "16px 16px 48px" }}>
      <style>{`
        @keyframes lpr-in { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* VS matchup card */}
      <div style={{
        borderRadius: 18, overflow: "hidden", marginBottom: 20,
        background: "linear-gradient(145deg,#0d1117,#131920)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}>
        <div style={{ height: 3, background: "linear-gradient(90deg,#3b82f6,#6366f1,#3b82f6)", backgroundSize: "200% 100%", animation: "dc-sweep 3s linear infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: "20px 16px 18px" }}>
          <DuelUserCard user={me} label="YOU" accentColor="#3b82f6" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color: "#334155" }}>VS</span>
            <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom,transparent,rgba(255,255,255,0.08),transparent)" }} />
          </div>
          <DuelUserCard user={opponent} label={opponent?.display_name || opponent?.username || "Opponent"} accentColor="#94a3b8" />
        </div>
      </div>

      {/* Pick rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {regularQs.map((q, i) => {
          const mp = myPicks.find(p => p.question_id === q.id);
          const op = oppPicks.find(p => p.question_id === q.id);
          return <LockedPickRow key={q.id} question={q} myPick={mp ?? null} oppPick={op ?? null} index={i} />;
        })}
        {tbQuestion && (() => {
          const mp = myPicks.find(p => p.question_id === tbQuestion.id);
          const op = oppPicks.find(p => p.question_id === tbQuestion.id);
          return <LockedPickRow key={tbQuestion.id} question={tbQuestion} myPick={mp ?? null} oppPick={op ?? null} isTiebreaker index={regularQs.length} />;
        })()}
      </div>
    </div>
  );
}

function LockedPickRow({ question, myPick, oppPick, isTiebreaker, index = 0 }: {
  question: DuelQuestion;
  myPick: Pick | null;
  oppPick: Pick | null;
  isTiebreaker?: boolean;
  index?: number;
}) {
  const myLabel  = myPick  ? (myPick.pick  === "a" ? question.option_a : question.option_b) : "—";
  const oppLabel = oppPick ? (oppPick.pick === "a" ? question.option_a : question.option_b) : "—";
  const myImage  = myPick  ? (myPick.pick  === "a" ? question.option_a_image : question.option_b_image) : null;
  const oppImage = oppPick ? (oppPick.pick === "a" ? question.option_a_image : question.option_b_image) : null;
  const myTeam   = myPick  ? (myPick.pick  === "a" ? question.option_a_team  : question.option_b_team)  : null;
  const oppTeam  = oppPick ? (oppPick.pick === "a" ? question.option_a_team  : question.option_b_team)  : null;
  const agree    = myPick && oppPick && myPick.pick === oppPick.pick;

  const myColor  = myTeam  ? teamColors(myTeam).primary  : "#3b82f6";
  const oppColor = oppTeam ? teamColors(oppTeam).primary : "#475569";

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      border: agree ? "1px solid rgba(251,191,36,0.25)" : "1px solid rgba(255,255,255,0.06)",
      animation: `lpr-in 0.3s ${index * 0.04}s ease both`,
    }}>
      {/* Question label */}
      <div style={{ padding: "8px 12px 6px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: isTiebreaker ? "#f59e0b" : "#475569", letterSpacing: "0.06em" }}>
          {isTiebreaker ? "TIEBREAKER" : `Q${question.question_order}`}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginLeft: 6 }}>{question.question_text}</span>
      </div>

      {/* Picks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", background: "rgba(0,0,0,0.2)" }}>
        {/* My pick */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: `${myColor}14`, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          {myImage && (
            <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1.5px solid ${myColor}50` }}>
              <img src={myImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>{myLabel}</div>
            {myTeam && <div style={{ fontSize: 10, color: myColor, fontWeight: 700, marginTop: 1 }}>{myTeam}</div>}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: agree ? 14 : 10, color: agree ? "#fbbf24" : "#1e293b", fontWeight: 900 }}>
            {agree ? "=" : "⚔"}
          </span>
        </div>

        {/* Opp pick */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "10px 12px", background: `${oppColor}10`, borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8", lineHeight: 1.2 }}>{oppPick ? oppLabel : "Pending"}</div>
            {oppTeam && <div style={{ fontSize: 10, color: oppColor, fontWeight: 700, marginTop: 1 }}>{oppTeam}</div>}
          </div>
          {oppImage && (
            <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1.5px solid ${oppColor}50` }}>
              <img src={oppImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </div>
      </div>

      {/* Tiebreaker margins */}
      {isTiebreaker && (myPick?.pick_margin || oppPick?.pick_margin) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.15)" }}>
          <div style={{ padding: "5px 12px", fontSize: 11, color: "#64748b", fontWeight: 700 }}>{myPick?.pick_margin ?? "—"} pts</div>
          <div />
          <div style={{ padding: "5px 12px", fontSize: 11, color: "#64748b", fontWeight: 700, textAlign: "right" }}>{oppPick?.pick_margin ?? "—"} pts</div>
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
