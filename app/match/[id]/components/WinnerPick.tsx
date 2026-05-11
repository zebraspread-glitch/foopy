"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getLogo, teamColor } from "../utils";
import { supabase } from "@/app/lib/supabase";

type Props = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  gameStatus?: string;
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

export default function WinnerPick({ matchId, homeTeam, awayTeam, gameStatus }: Props) {
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
      const res = await fetch(`/api/winner-picks?matchId=${matchId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setVotes({
        home: Number(data.home ?? 0),
        away: Number(data.away ?? 0),
        total: Number(data.total ?? 0),
      });
    } catch {}
  }, [matchId]);

  // Restore saved pick + load initial vote counts
  useEffect(() => {
    if (!matchId) return;
    const saved = localStorage.getItem(storageKey) as "home" | "away" | null;
    if (saved === "home" || saved === "away") {
      setMyPick(saved);
      setHasVoted(true);
    }
    loadVotes();
  }, [matchId, storageKey, loadVotes]);

  // Poll every 15 seconds for live updates
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollRef.current = setInterval(loadVotes, 15_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadVotes]);

  const votingLocked = !!gameStatus && gameStatus !== "UPCOMING";

  async function pick(side: "home" | "away") {
    if (!authed) { router.push("/login"); return; }
    if (submitting || votingLocked) return;

    const voterId = getOrCreateVoterId();
    const team = side === "home" ? homeTeam : awayTeam;

    // Optimistic update
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
        // Replace optimistic counts with real server counts
        setVotes({
          home: Number(data.home ?? 0),
          away: Number(data.away ?? 0),
          total: Number(data.total ?? 0),
        });
      }
    } catch {}
    setSubmitting(false);
  }

  const homeSelected = myPick === "home";
  const awaySelected = myPick === "away";

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>PICK THE WINNER</div>

      {authed === false && (
        <button
          onClick={() => router.push("/login")}
          style={{ display: "block", width: "100%", marginBottom: 12, padding: "10px", borderRadius: 12, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.1)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center" }}
        >
          Sign in to vote
        </button>
      )}

      {votingLocked && !hasVoted && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#64748b", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          🔒 Voting closed — game has started
        </div>
      )}

      {/* Buttons */}
      <div style={{ ...buttonsStyle, opacity: (authed === false || votingLocked) ? 0.45 : 1, pointerEvents: (authed === false || (votingLocked && !hasVoted)) ? "none" : "auto" }}>
        <PickBtn
          team={homeTeam}
          side="home"
          selected={homeSelected}
          hasVoted={hasVoted}
          color={homeColor}
          percent={homePercent}
          submitting={submitting}
          onPick={() => pick("home")}
        />
        <PickBtn
          team={awayTeam}
          side="away"
          selected={awaySelected}
          hasVoted={hasVoted}
          color={awayColor}
          percent={awayPercent}
          submitting={submitting}
          onPick={() => pick("away")}
        />
      </div>

      {/* Bar */}
      <div style={barShellStyle}>
        <div
          style={{
            height: "100%",
            width: `${homePercent}%`,
            background: homeColor,
            transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            borderRadius: "999px 0 0 999px",
          }}
        />
        <div
          style={{
            height: "100%",
            width: `${awayPercent}%`,
            background: awayColor,
            transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            borderRadius: "0 999px 999px 0",
          }}
        />
      </div>

      {/* Vote count */}
      <div style={voteCountStyle}>
        {votes.total === 0
          ? "Be the first to vote"
          : votes.total === 1
          ? "1 vote"
          : `${votes.total.toLocaleString()} votes`}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────── */
/* Pick button                                       */
/* ──────────────────────────────────────────────── */

function PickBtn({
  team,
  side,
  selected,
  hasVoted,
  color,
  percent,
  submitting,
  onPick,
}: {
  team: string;
  side: "home" | "away";
  selected: boolean;
  hasVoted: boolean;
  color: string;
  percent: number;
  submitting: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={submitting}
      style={{
        ...btnBase,
        borderColor: selected ? color : "rgba(255,255,255,.14)",
        background: selected ? color : "#0b0b0b",
        boxShadow: "none",
      }}
    >
      <img src={getLogo(team)} alt={team} style={logoStyle} />
      <span style={{ ...teamNameStyle, color: selected ? "#ffffff" : "#94a3b8" }}>{team}</span>
      <span style={{ ...pickPercentStyle, color: selected ? "#ffffff" : "#f8fafc" }}>{percent}%</span>
    </button>
  );
}

/* ──────────────────────────────────────────────── */
/* Styles                                            */
/* ──────────────────────────────────────────────── */

const boxStyle: React.CSSProperties = {
  background: "#070707",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 18,
  padding: 18,
  boxShadow: "none",
};

const titleStyle: React.CSSProperties = {
  textAlign: "center",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 1000,
  letterSpacing: ".16em",
  marginBottom: 16,
};

const buttonsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const btnBase: React.CSSProperties = {
  position: "relative",
  border: "2px solid rgba(255,255,255,.14)",
  borderRadius: 16,
  padding: "16px 12px 14px",
  color: "#fff",
  fontWeight: 1000,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 7,
  minHeight: 154,
  overflow: "hidden",
  transition:
    "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
};

const logoStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  objectFit: "contain",
  borderRadius: "50%",
  padding: "4px",
  position: "relative",
  zIndex: 1,
};

const teamNameStyle: React.CSSProperties = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
  position: "relative",
  zIndex: 1,
};

const pickPercentStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 22,
  fontWeight: 1000,
  lineHeight: 1,
  position: "relative",
  zIndex: 1,
};

const barShellStyle: React.CSSProperties = {
  marginTop: 16,
  height: 12,
  borderRadius: 999,
  overflow: "hidden",
  background: "#111827",
  display: "flex",
  border: "1px solid rgba(255,255,255,.08)",
};

const voteCountStyle: React.CSSProperties = {
  marginTop: 12,
  textAlign: "center",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
};
