"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getLogo, teamColor } from "../utils";
import { supabase } from "@/app/lib/supabase";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";

type Props = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  gameStatus?: string;
  homeScore?: number | string | null;
  awayScore?: number | string | null;
  // Called once the initial vote-check (auth + existing pick) has resolved,
  // so a parent page can hold its own loading state until this poll knows
  // whether to show the vote buttons or the already-voted result — avoids
  // a flash of the unvoted state for users who already voted.
  onReady?: () => void;
};

type Side = "home" | "draw" | "away";
type Votes = { home: number; draw: number; away: number; total: number };

export default function WinnerPick({ matchId, homeTeam, awayTeam, gameStatus, homeScore, awayScore, onReady }: Props) {
  const router = useRouter();

  const [authed, setAuthed]         = useState<boolean | null>(null);
  const [authToken, setAuthToken]   = useState<string | null>(null);
  const [votes, setVotes]           = useState<Votes>({ home: 0, draw: 0, away: 0, total: 0 });
  const [myPick, setMyPick]         = useState<Side | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted]     = useState(false);
  // True until both auth state and existing-vote fetch have resolved —
  // prevents the race condition where a fast tap submits before we know
  // the user already voted.
  const [loadingVotes, setLoadingVotes] = useState(true);

  // Always call the latest onReady without making loadVotes depend on it
  // (the parent typically passes a fresh inline arrow every render).
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data?.session?.user);
      setAuthToken(data?.session?.access_token ?? null);
    });
  }, []);

  const loadVotes = useCallback(async (token?: string | null, initial = false) => {
    try {
      const headers: Record<string, string> = {};
      const t = token ?? authToken;
      if (t) headers["Authorization"] = `Bearer ${t}`;
      const res = await fetch(`/api/winner-picks?matchId=${matchId}`, {
        cache: "no-store", headers,
      });
      if (res.ok) {
        const data = await res.json();
        setVotes({
          home:  Number(data.home  ?? 0),
          draw:  Number(data.draw  ?? 0),
          away:  Number(data.away  ?? 0),
          total: Number(data.total ?? 0),
        });
        // Restore pick from database — reliable across devices/browser clears
        if (data.my_pick) {
          setMyPick(data.my_pick as Side);
          setHasVoted(true);
        }
      }
    } catch {
      // Swallowed — a failed vote-check just means the buttons stay
      // interactive rather than restoring a saved pick. Still must fall
      // through to the `finally` below so `initial` callers (and the
      // parent's page-load gate via onReady) are never left hanging.
    } finally {
      if (initial) {
        setLoadingVotes(false);
        onReadyRef.current?.();
      }
    }
  }, [matchId, authToken]);

  // Load votes once auth is resolved so we can restore the user's pick.
  // Pass initial=true so loadingVotes is cleared after the first fetch.
  useEffect(() => {
    if (!matchId || authed === null) return;
    loadVotes(authToken, true);
  }, [matchId, authed, authToken, loadVotes]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollRef.current = setInterval(() => loadVotes(), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadVotes]);

  const votingLocked = !!gameStatus && gameStatus !== "UPCOMING" || hasVoted;

  const finalResult = useMemo<Side | null>(() => {
    if (gameStatus !== "FINAL") return null;
    const h = Number(homeScore ?? 0);
    const a = Number(awayScore ?? 0);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
    if (h === a) return "draw";
    return h > a ? "home" : "away";
  }, [gameStatus, homeScore, awayScore]);

  const pct = useMemo(() => {
    if (votes.total <= 0) return { home: 50, away: 50 };
    return {
      home: Math.round((votes.home / votes.total) * 100),
      away: Math.round((votes.away / votes.total) * 100),
    };
  }, [votes]);

  const maxPct = Math.max(pct.home, pct.away);

  async function pick(side: Side) {
    if (!authed) { router.push("/login"); return; }
    if (submitting || votingLocked || loadingVotes) return;
    if (!authToken) return;

    const team = side === "home" ? homeTeam : side === "away" ? awayTeam : "draw";
    setMyPick(side);
    setHasVoted(true);

    setVotes(v => {
      const next = { ...v };
      next[side] = (next[side] ?? 0) + 1;
      next.total += 1;
      return next;
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/winner-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({ matchId, team, side }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotes({ home: Number(data.home ?? 0), draw: Number(data.draw ?? 0), away: Number(data.away ?? 0), total: Number(data.total ?? 0) });
        if (data.aura_awarded) auraToastEmitter.emit(3, "picking a winner");
      }
    } catch {}
    setSubmitting(false);
  }

  const showPcts = hasVoted || votingLocked;
  const locked   = loadingVotes || authed === false || votingLocked;

  const options: { side: Side; logo: string; color: string }[] = [
    { side: "home", logo: getLogo(homeTeam), color: teamColor(homeTeam) },
    { side: "away", logo: getLogo(awayTeam), color: teamColor(awayTeam) },
  ];

  return (
    <div style={{ borderRadius: 16, padding: "16px 0 8px", marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "0 2px" }}>
        <span style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.01em" }}>Who will win?</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>
          {votes.total > 0 ? `Total votes: ${votes.total.toLocaleString()}` : "No votes yet"}
        </span>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: authed === false && !hasVoted ? 0.5 : 1, pointerEvents: locked ? "none" : "auto" }}>
        {options.map(({ side, logo, color }, i) => {
          const selected  = myPick === side;
          const isCorrect = !!finalResult && finalResult === side;
          const isWrong   = !!finalResult && selected && !isCorrect;
          const p         = pct[side];
          const isLeading = showPcts && p === maxPct && p > 0;
          return (
            <React.Fragment key={side}>
              <button
                type="button"
                onClick={() => pick(side)}
                disabled={submitting}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: showPcts ? 6 : 0, padding: "14px 8px",
                  borderRadius: 12,
                  border: showPcts ? "1.5px solid transparent" : `1.5px solid ${isWrong ? "#ef4444" : selected ? color : "var(--border-2)"}`,
                  background: showPcts ? "transparent" : isWrong ? "rgba(239,68,68,.1)" : selected ? `${color}18` : "rgba(255,255,255,0.03)",
                  cursor: locked ? "default" : "pointer",
                  transition: "border-color 0.2s, background 0.2s", minHeight: 72,
                }}
              >
                <img src={logo} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "50%" }} />
                {showPcts && (
                  <span style={{ fontSize: 16, fontWeight: 900, color: isCorrect ? "#22c55e" : isLeading ? "#22c55e" : "var(--text-3)", lineHeight: 1 }}>
                    {p}%
                  </span>
                )}
              </button>
              {i < options.length - 1 && (
                <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text-4)", flexShrink: 0 }}>VS</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {authed === false && (
        <button
          onClick={() => router.push("/login")}
          style={{ marginTop: 10, width: "100%", padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Sign in to vote
        </button>
      )}
    </div>
  );
}
