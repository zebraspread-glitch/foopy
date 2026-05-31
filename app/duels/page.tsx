"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type DuelSummary = {
  id: string;
  status: string;
  challenger_id: string;
  opponent_id: string | null;
  challenger_score: number | null;
  opponent_score: number | null;
  winner_id: string | null;
  is_draw: boolean;
  aura_awarded_challenger: number;
  coins_awarded_challenger: number;
  aura_awarded_opponent: number;
  coins_awarded_opponent: number;
  completed_at: string | null;
  created_at: string;
  duel_game: {
    id: string;
    game_id: number;
    round: number;
    season: number;
    home_team: string;
    away_team: string;
    game_date: string;
  } | null;
  challenger: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  opponent:   { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

type Stats = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number;
  winStreak: number;
};

export default function DuelsPage() {
  const [duels, setDuels]   = useState<DuelSummary[]>([]);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      setUserId(data.session?.user.id ?? null);
      if (!token) { setSignedIn(false); setLoading(false); return; }

      const res = await fetch("/api/duels/history", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDuels(json.duels ?? []);
        setStats(json.stats ?? null);
        setUserId(json.userId ?? null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <main className="page grid">
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", animation: "spin 0.75s linear infinite" }} />
        </div>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="page grid">
        <section className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <span style={{ fontSize: 40 }}>⚔</span>
          <h1 style={{ marginTop: 12 }}>Duels</h1>
          <p className="muted">Sign in to see your duel history.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page grid">
      {/* Header */}
      <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="pill">⚔ Duels</span>
          <h1 style={{ marginTop: 8 }}>My Duels</h1>
        </div>
        <Link href="/duels/leaderboard" style={linkBtnStyle}>
          Leaderboard →
        </Link>
      </section>

      {/* Stats summary */}
      {stats && (
        <section style={statsGridStyle}>
          <StatCard label="Wins"       value={stats.wins}      color="#4ade80" />
          <StatCard label="Losses"     value={stats.losses}    color="#ef4444" />
          <StatCard label="Win Rate"   value={`${stats.winRate}%`} color="#3b82f6" />
          <StatCard label="Win Streak" value={stats.winStreak} color="#f59e0b" suffix={stats.winStreak === 1 ? " W" : stats.winStreak > 1 ? " W" : ""} />
        </section>
      )}

      {/* Duel list */}
      <section className="card">
        <h2 style={{ marginBottom: 16 }}>History</h2>
        {duels.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#64748b" }}>
            <p style={{ fontSize: 32 }}>⚔</p>
            <p style={{ marginTop: 8 }}>No duels yet. Enter one from a match page!</p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {duels.map((d) => (
            <DuelRow key={d.id} duel={d} userId={userId!} />
          ))}
        </div>
      </section>
    </main>
  );
}

function DuelRow({ duel, userId }: { duel: DuelSummary; userId: string }) {
  const isChallenger = duel.challenger_id === userId;
  const me       = isChallenger ? duel.challenger : duel.opponent;
  const opponent = isChallenger ? duel.opponent   : duel.challenger;
  const myScore  = isChallenger ? duel.challenger_score  : duel.opponent_score;
  const oppScore = isChallenger ? duel.opponent_score    : duel.challenger_score;
  const myAura   = isChallenger ? duel.aura_awarded_challenger  : duel.aura_awarded_opponent;
  const myCoins  = isChallenger ? duel.coins_awarded_challenger : duel.coins_awarded_opponent;

  const iWon  = duel.winner_id === userId;
  const isDraw = duel.is_draw;
  const isPending = duel.status === "waiting" || duel.status === "active";

  const resultColor = isPending ? "#64748b" : iWon ? "#4ade80" : isDraw ? "#f59e0b" : "#ef4444";
  const resultLabel = isPending
    ? (duel.opponent_id ? "Active" : "Waiting")
    : iWon ? "Won" : isDraw ? "Draw" : "Lost";

  const dg = duel.duel_game;

  return (
    <Link
      href={dg ? `/match/${dg.game_id}?tab=duels` : "#"}
      style={duelRowLinkStyle}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {/* Opponent avatar */}
        <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>
          {opponent?.avatar_url
            ? <img src={opponent.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (opponent?.display_name || opponent?.username || "?").slice(0, 2).toUpperCase()
          }
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {opponent?.display_name || opponent?.username || (duel.status === "waiting" ? "Waiting for opponent..." : "Unknown")}
          </div>
          {dg && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {dg.home_team} vs {dg.away_team} · R{dg.round}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ ...resultPillStyle, background: `${resultColor}20`, color: resultColor }}>
          {resultLabel}
        </span>
        {duel.status === "complete" && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
            {myScore ?? 0}–{oppScore ?? 0}
          </span>
        )}
        {(myAura > 0 || myCoins > 0) && duel.status === "complete" && (
          <span style={{ fontSize: 11, color: "#4ade80" }}>
            {myAura > 0 && `+${myAura} aura`}{myCoins > 0 && ` +${myCoins}c`}
          </span>
        )}
      </div>
    </Link>
  );
}

function StatCard({ label, value, color, suffix }: { label: string; value: number | string; color: string; suffix?: string }) {
  return (
    <div style={{ ...statCardStyle, borderColor: `${color}30` }}>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>
        {value}{suffix ?? ""}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 10,
};

const statCardStyle: React.CSSProperties = {
  padding: "14px 10px", borderRadius: 14, textAlign: "center",
  background: "var(--surface-2)", border: "2px solid",
};

const duelRowLinkStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "12px 14px", borderRadius: 12,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
  textDecoration: "none", color: "var(--text-1)",
};

const resultPillStyle: React.CSSProperties = {
  padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
};

const linkBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 10,
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  color: "var(--text-1)", textDecoration: "none", fontWeight: 600, fontSize: 14,
};
