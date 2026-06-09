"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";

const CURRENT_SEASON = new Date().getFullYear();
const DUEL_GRADIENT = "linear-gradient(135deg, #fb923c, #ef4444)";

type SortKey = "wins" | "losses" | "win_rate" | "streak" | "best_streak" | "total_points";

const SORT_OPTIONS: { key: SortKey; label: string; unit: string }[] = [
  { key: "wins",         label: "Wins",    unit: "wins" },
  { key: "win_rate",     label: "Win %",   unit: "win rate" },
  { key: "streak",       label: "Streak",  unit: "streak" },
  { key: "best_streak",  label: "Best",    unit: "best streak" },
  { key: "total_points", label: "Points",  unit: "points" },
  { key: "losses",       label: "Losses",  unit: "losses" },
];

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
  streak?: number;        // signed: + for a win streak, - for a losing streak
  best_streak?: number;   // longest win streak ever
  total_points?: number;  // sum of duel scores
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function Stat({ value, label, color, minWidth = 20 }: { value: number | string; label: string; color: string; minWidth?: number }) {
  return (
    <div style={{ textAlign: "center", minWidth }}>
      <div style={{ fontSize: 14, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function DuelsLeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("wins"); // defaults to wins on open

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setMyUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/duels/leaderboard?season=${CURRENT_SEASON}`)
      .then((r) => r.json())
      .then((json) => {
        setEntries(json.leaderboard ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const val = (e: LeaderboardEntry, k: SortKey) => Number(e[k] ?? 0);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const diff = val(b, sortKey) - val(a, sortKey);
      if (diff !== 0) return diff;
      // tiebreakers: wins, then win rate, then points
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      return (b.total_points ?? 0) - (a.total_points ?? 0);
    });
  }, [entries, sortKey]);

  const myIndex = myUserId ? sorted.findIndex((e) => e.user_id === myUserId) : -1;
  const me = myIndex !== -1 ? sorted[myIndex] : null;
  const sortMeta = SORT_OPTIONS.find((o) => o.key === sortKey)!;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 60 }}>

      {/* ── Sticky header ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--border-1)", paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 14px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.03em", background: DUEL_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            ⚔ Duels
          </div>
        </div>

        {/* Sort pills */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  border: active ? "1px solid rgba(249,115,22,0.5)" : "1px solid var(--border-2)",
                  background: active ? "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(239,68,68,0.15))" : "var(--surface-3)",
                  color: active ? "#fb923c" : "var(--text-3)",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* Your rank banner */}
        {me && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.1))", border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚔</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>
              You are{" "}
              <span style={{ fontWeight: 900, background: DUEL_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {ordinal(myIndex + 1)}
              </span>
              {" "}with{" "}
              <span style={{ fontWeight: 900, color: "#fb923c" }}>
                {sortKey === "win_rate" ? `${me.win_rate}%` : val(me, sortKey)}
              </span>
              {" "}{sortMeta.unit}
            </span>
          </div>
        )}

        <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 48, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", borderRadius: 0 }} />
            ))
          ) : entries.length === 0 ? (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚔</div>
              No duels played yet
            </div>
          ) : sorted.map((e, i) => {
            const rank  = i + 1;
            const isMe  = e.user_id === myUserId;
            const label = e.display_name || e.username || "Unknown";
            return (
              <Link
                key={e.user_id}
                href={e.username ? `/profile/${e.username}` : "#"}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderTop: i > 0 ? "1px solid var(--border-1)" : "none", background: isMe ? "rgba(249,115,22,0.08)" : "none", textDecoration: "none", color: "inherit" }}
              >
                <div style={{ width: 32, textAlign: "center", flexShrink: 0 }}>
                  {rank === 1 ? <span style={{ fontSize: 20 }}>🥇</span>
                   : rank === 2 ? <span style={{ fontSize: 20 }}>🥈</span>
                   : rank === 3 ? <span style={{ fontSize: 20 }}>🥉</span>
                   : <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-3)" }}>{rank}</span>}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "var(--surface-1)", overflow: "hidden", position: "relative", border: isMe ? "2px solid #fb923c" : "2px solid var(--border-2)" }}>
                  {e.avatar_url
                    ? <img src={e.avatar_url} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#fb923c" }}>{label[0]?.toUpperCase()}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: isMe ? 900 : 800, color: isMe ? "#fb923c" : "var(--text-1)", display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.username ? `@${e.username}` : label}</span>
                    {e.verified && <VerifiedBadge size={13} />}
                  </div>
                </div>
                {(() => {
                  const streak = e.streak ?? 0;
                  const streakColor = streak > 0 ? "#F97316" : streak < 0 ? "#EF4444" : "#9CA3AF";
                  return (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                      <Stat value={e.wins} label="W" color="#22C55E" />
                      <Stat value={e.losses} label="L" color="#EF4444" />
                      <Stat value={`${e.win_rate}%`} label="Win" color="#60A5FA" minWidth={30} />
                      <Stat value={streak} label="Streak" color={streakColor} />
                      <Stat value={e.best_streak ?? 0} label="Best" color="#FBBF24" />
                      <Stat value={e.total_points ?? 0} label="Pts" color="#F3F4F6" />
                    </div>
                  );
                })()}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
