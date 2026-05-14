"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { getLogo, teamColor } from "../utils";
import { supabase } from "@/app/lib/supabase";

type Props = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  gameStatus?: string;
  homeScore?: number | string | null;
  awayScore?: number | string | null;
};

type Votes = { home: number; away: number; total: number };

function getOrCreateVoterId(): string {
  const key = "foopy_voter_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function WinnerPick({ matchId, homeTeam, awayTeam, gameStatus, homeScore, awayScore }: Props) {
  const router = useRouter();
  const storageKey = `winner-pick-${matchId}`;

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [votes, setVotes] = useState<Votes>({ home: 0, away: 0, total: 0 });
  const [myPick, setMyPick] = useState<"home" | "away" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data?.session?.user));
  }, []);

  const homeColor = teamColor(homeTeam);
  const awayColor = teamColor(awayTeam);

  const homePercent = useMemo(() => {
    if (votes.total <= 0) return 50;
    return Math.round((votes.home / votes.total) * 100);
  }, [votes]);
  const awayPercent = 100 - homePercent;

  const loadVotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/winner-picks?matchId=${matchId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setVotes({
        home: Number(data.home ?? 0),
        away: Number(data.away ?? 0),
        total: Number(data.total ?? 0),
      });
    } catch {}
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const saved = localStorage.getItem(storageKey) as "home" | "away" | null;
    if (saved === "home" || saved === "away") {
      setMyPick(saved);
      setHasVoted(true);
    }
    loadVotes();
  }, [matchId, storageKey, loadVotes]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollRef.current = setInterval(loadVotes, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadVotes]);

  const votingLocked = !!gameStatus && gameStatus !== "UPCOMING";
  const finalWinner = useMemo<"home" | "away" | null>(() => {
    if (gameStatus !== "FINAL") return null;
    const home = Number(homeScore ?? 0);
    const away = Number(awayScore ?? 0);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) return null;
    return home > away ? "home" : "away";
  }, [awayScore, gameStatus, homeScore]);

  async function pick(side: "home" | "away") {
    if (!authed) { router.push("/login"); return; }
    if (submitting || votingLocked) return;

    const voterId = getOrCreateVoterId();
    const team = side === "home" ? homeTeam : awayTeam;
    const prev = myPick;
    setMyPick(side);
    setHasVoted(true);
    localStorage.setItem(storageKey, side);

    setVotes((v) => {
      const next = { ...v };
      if (prev) next[prev] = Math.max(0, next[prev] - 1);
      else next.total += 1;
      next[side] += 1;
      return next;
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/winner-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, team, side, voterId }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotes({ home: Number(data.home ?? 0), away: Number(data.away ?? 0), total: Number(data.total ?? 0) });
      }
    } catch {}
    setSubmitting(false);
  }

  const interactionLocked = authed === false || votingLocked;
  const dimUnavailable = authed === false && !hasVoted;

  const options: { side: "home" | "away"; team: string; color: string; percent: number; voteCount: number }[] = [
    { side: "home", team: homeTeam, color: homeColor, percent: homePercent, voteCount: votes.home },
    { side: "away", team: awayTeam, color: awayColor, percent: awayPercent, voteCount: votes.away },
  ];

  return (
    <div style={boxStyle}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <rect x="18" y="4" width="4" height="16" rx="1" />
              <rect x="10" y="9" width="4" height="11" rx="1" />
              <rect x="2" y="13" width="4" height="7" rx="1" />
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#a78bfa", letterSpacing: "0.08em" }}>POLL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
            {votes.total === 0 ? "No votes yet" : `${votes.total.toLocaleString()} votes`}
          </span>
        </div>
      </div>

      {/* ── Question ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          Who will win?
        </div>
        {!votingLocked && (
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginTop: 4 }}>
            Vote before the match starts
          </div>
        )}
        {votingLocked && (
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginTop: 4 }}>
            🔒 Voting closed — game in progress
          </div>
        )}
        {authed === false && (
          <button
            onClick={() => router.push("/login")}
            style={{ marginTop: 8, padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Sign in to vote
          </button>
        )}
      </div>

      {/* ── Options ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, opacity: dimUnavailable ? 0.5 : 1, pointerEvents: interactionLocked ? "none" : "auto" }}>
        {options.map(({ side, team, color, percent, voteCount }) => {
          const selected = myPick === side;
          const isWinner = finalWinner === side;
          const wrong = !!finalWinner && selected && !isWinner;
          const dimmed = !!finalWinner && !isWinner && !selected;
          return (
            <button
              key={side}
              type="button"
              onClick={() => pick(side)}
              disabled={submitting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: `1.5px solid ${wrong ? "#ef4444" : selected ? color : "rgba(255,255,255,0.1)"}`,
                background: wrong ? "rgba(239,68,68,.12)" : selected ? `${color}18` : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                opacity: dimmed ? 0.35 : 1,
                transition: "border-color 0.2s, background 0.2s",
              }}
            >
              {/* Radio */}
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${selected ? color : "rgba(255,255,255,0.25)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.2s",
              }}>
                {selected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />}
              </div>

              {/* Logo */}
              <img src={getLogo(team)} alt={team} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />

              {/* Name + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {team}
                  {isWinner && <CheckCircle size={15} color="#22c55e" style={{ display: "inline-block", verticalAlign: "-2px", marginLeft: 7 }} />}
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${percent}%`,
                    borderRadius: 999,
                    background: color,
                    transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                  }} />
                </div>
              </div>

              {/* % + votes */}
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: selected ? color : "#94a3b8", lineHeight: 1 }}>{percent}%</div>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginTop: 3 }}>{voteCount} votes</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const boxStyle: React.CSSProperties = {
  background: "#070707",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 20,
  padding: 20,
};
