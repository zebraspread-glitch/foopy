"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
};

type Side = "home" | "draw" | "away";
type Votes = { home: number; draw: number; away: number; total: number };

function getOrCreateVoterId(): string {
  const key = "foopy_voter_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function WinnerPick({ matchId, homeTeam, awayTeam, gameStatus, homeScore, awayScore }: Props) {
  const router = useRouter();
  const storageKey = `winner-pick-${matchId}`;

  const [authed, setAuthed]         = useState<boolean | null>(null);
  const [authToken, setAuthToken]   = useState<string | null>(null);
  const [votes, setVotes]           = useState<Votes>({ home: 0, draw: 0, away: 0, total: 0 });
  const [myPick, setMyPick]         = useState<Side | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted]     = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data?.session?.user);
      setAuthToken(data?.session?.access_token ?? null);
    });
  }, []);

  const loadVotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/winner-picks?matchId=${matchId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setVotes({
        home:  Number(data.home  ?? 0),
        draw:  Number(data.draw  ?? 0),
        away:  Number(data.away  ?? 0),
        total: Number(data.total ?? 0),
      });
    } catch {}
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const saved = localStorage.getItem(storageKey) as Side | null;
    if (saved === "home" || saved === "away" || saved === "draw") {
      setMyPick(saved);
      setHasVoted(true);
    }
    loadVotes();
  }, [matchId, storageKey, loadVotes]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollRef.current = setInterval(loadVotes, 10_000);
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
    if (submitting || votingLocked) return;

    const team = side === "home" ? homeTeam : side === "away" ? awayTeam : "draw";
    const prev = myPick;
    setMyPick(side);
    setHasVoted(true);
    localStorage.setItem(storageKey, side);

    setVotes(v => {
      const next = { ...v };
      if (prev) next[prev] = Math.max(0, next[prev] - 1);
      else next.total += 1;
      next[side] += 1;
      return next;
    });

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch("/api/winner-picks", {
        method: "POST",
        headers,
        body: JSON.stringify({ matchId, team, side, voterId: getOrCreateVoterId() }),
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
  const locked   = authed === false || votingLocked;

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
      <div style={{ display: "flex", gap: 10, opacity: authed === false && !hasVoted ? 0.5 : 1, pointerEvents: locked ? "none" : "auto" }}>
        {options.map(({ side, logo, color }) => {
          const selected  = myPick === side;
          const isCorrect = !!finalResult && finalResult === side;
          const isWrong   = !!finalResult && selected && !isCorrect;
          const p         = pct[side];
          const isLeading = showPcts && p === maxPct && p > 0;

          return (
            <button
              key={side}
              type="button"
              onClick={() => pick(side)}
              disabled={submitting}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: showPcts ? 6 : 0,
                padding: "14px 8px",
                borderRadius: 12,
                border: showPcts ? "1.5px solid transparent" : `1.5px solid ${isWrong ? "#ef4444" : selected ? color : "var(--border-2)"}`,
                background: isWrong ? "rgba(239,68,68,.1)" : selected ? `${color}18` : "rgba(255,255,255,0.03)",
                cursor: locked ? "default" : "pointer",
                transition: "border-color 0.2s, background 0.2s",
                minHeight: 72,
              }}
            >
              <img src={logo} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "50%" }} />
              {showPcts && (
                <span style={{ fontSize: 16, fontWeight: 900, color: isCorrect ? "#22c55e" : isLeading ? "#22c55e" : "var(--text-3)", lineHeight: 1 }}>
                  {p}%
                </span>
              )}
            </button>
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
