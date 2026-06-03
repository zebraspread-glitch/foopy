"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";

const CURRENT_SEASON = new Date().getFullYear();

type LeaderboardEntry = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  verified?: boolean;
  wins: number;
  losses: number;
  draws: number;
  total_duels: number;
  win_rate: number;
};

export default function DuelsLeaderboardPage() {
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState<"season" | "round">("season");
  const [round, setRound]       = useState<number | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setMyUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ season: String(CURRENT_SEASON) });
    if (period === "round" && round) params.set("round", String(round));

    fetch(`/api/duels/leaderboard?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setEntries(json.leaderboard ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period, round]);

  return (
    <main className="page grid">
      {/* Header */}
      <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="pill">⚔ Duels</span>
          <h1 style={{ marginTop: 8 }}>Duel Leaderboard</h1>
          <p className="muted" style={{ marginTop: 4 }}>{CURRENT_SEASON} Season</p>
        </div>
        <Link href="/duels" style={linkBtnStyle}>← My Duels</Link>
      </section>

      {/* Period picker */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setPeriod("season")}
          style={{ ...tabBtnStyle, borderBottom: period === "season" ? "2px solid #fff" : "2px solid transparent", color: period === "season" ? "#fff" : "#64748b" }}
        >
          Season
        </button>
        <button
          onClick={() => setPeriod("round")}
          style={{ ...tabBtnStyle, borderBottom: period === "round" ? "2px solid #fff" : "2px solid transparent", color: period === "round" ? "#fff" : "#64748b" }}
        >
          By Round
        </button>
      </div>

      {period === "round" && (
        <section className="card">
          <label style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>Select Round</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                onClick={() => setRound(r)}
                style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: round === r ? "#3b82f6" : "var(--surface-2)",
                  border: round === r ? "2px solid #3b82f6" : "2px solid var(--border-2)",
                  color: "var(--text-1)", cursor: "pointer",
                }}
              >
                R{r}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Leaderboard table */}
      <section className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", animation: "spin 0.75s linear infinite" }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#64748b" }}>
            <p style={{ fontSize: 32 }}>⚔</p>
            <p style={{ marginTop: 8 }}>No duels yet this {period === "round" && round ? `round` : "season"}.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map((entry, i) => {
              const isMe = entry.user_id === myUserId;
              return (
                <Link
                  key={entry.user_id}
                  href={`/profile/${entry.username}`}
                  style={{
                    ...rowStyle,
                    background: isMe ? "rgba(59,130,246,0.12)" : "var(--surface-2)",
                    border: isMe ? "1px solid rgba(59,130,246,0.3)" : "1px solid var(--border-2)",
                  }}
                >
                  {/* Rank */}
                  <div style={rankStyle(i)}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </div>

                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "#1e3a8a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>
                    {entry.avatar_url
                      ? <img src={entry.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (entry.display_name || entry.username || "?").slice(0, 2).toUpperCase()
                    }
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.display_name || entry.username}</span>
                      {entry.verified && <VerifiedBadge size={13} />}
                      {isMe && <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 800, flexShrink: 0 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {entry.total_duels} duel{entry.total_duels !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>{entry.wins}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>W</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>{entry.losses}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>L</div>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 40 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#3b82f6", lineHeight: 1 }}>{entry.win_rate}%</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>Win%</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function rankStyle(i: number): React.CSSProperties {
  return {
    width: 32, textAlign: "center", fontSize: i < 3 ? 18 : 13,
    fontWeight: 800, color: i < 3 ? undefined : "#64748b", flexShrink: 0,
  };
}

const tabBtnStyle: React.CSSProperties = {
  flex: 1, padding: "11px 8px", background: "none", border: "none",
  cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "color 0.12s",
};

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: 12,
  textDecoration: "none", color: "var(--text-1)",
};

const linkBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 10,
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  color: "var(--text-1)", textDecoration: "none", fontWeight: 600, fontSize: 14,
};
