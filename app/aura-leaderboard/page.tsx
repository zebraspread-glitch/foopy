"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type Period = "day" | "week" | "month" | "overall";

type Entry = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  aura_total: number;
};

const TABS: { label: string; value: Period }[] = [
  { label: "Today",   value: "day"     },
  { label: "Week",    value: "week"    },
  { label: "Month",   value: "month"   },
  { label: "Overall", value: "overall" },
];

export default function AuraLeaderboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("overall");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myAura, setMyAura] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setMyUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    supabase.rpc("get_aura_leaderboard", { period, limit_n: 50 })
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        setEntries((data ?? []) as Entry[]);
        setLoading(false);
      });
  }, [period]);

  // Compute current user's rank + total from leaderboard data
  useEffect(() => {
    if (!myUserId || entries.length === 0) { setMyRank(null); setMyAura(null); return; }
    const idx = entries.findIndex(e => e.user_id === myUserId);
    if (idx !== -1) {
      setMyRank(idx + 1);
      setMyAura(entries[idx].aura_total);
    } else {
      // User is outside top 50 — fetch their total separately
      if (period === "overall") {
        supabase.from("profiles").select("aura").eq("id", myUserId).single()
          .then(({ data }) => {
            const total = data?.aura ?? 0;
            setMyAura(total);
            supabase.from("profiles").select("id", { count: "exact", head: true }).gt("aura", total)
              .then(({ count }) => setMyRank((count ?? 0) + 1));
          });
      } else {
        setMyRank(null);
        setMyAura(null);
      }
    }
  }, [entries, myUserId, period]);

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--border-1)", paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, display: "flex" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #c084fc, #818cf8, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                ✦ Aura Leaderboard
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 18px 12px", gap: 6 }}>
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setPeriod(t.value)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: period === t.value ? "1px solid rgba(139,92,246,0.5)" : "1px solid var(--border-2)",
                background: period === t.value ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))" : "var(--surface-3)",
                color: period === t.value ? "#c084fc" : "var(--text-3)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Your rank banner */}
        {myUserId && myRank !== null && myAura !== null && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✦</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>
              You are{" "}
              <span style={{ fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {ordinal(myRank)}
              </span>
              {" "}with{" "}
              <span style={{ fontWeight: 900, color: "#c084fc" }}>{myAura.toLocaleString()}</span>
              {" "}Aura
            </span>
          </div>
        )}

        {/* List */}
        <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 60, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", borderRadius: 0 }} />
            ))
          ) : entries.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
              No data yet for this period
            </div>
          ) : (
            entries.map((e, i) => {
              const rank = i + 1;
              const isMe = e.user_id === myUserId;
              const label = e.display_name || e.username || "Unknown";
              const initials = label[0]?.toUpperCase() ?? "?";

              return (
                <Link
                  key={e.user_id}
                  href={e.username ? `/profile/${e.username}` : "#"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderTop: i > 0 ? "1px solid var(--border-1)" : "none",
                    background: isMe ? "rgba(139,92,246,0.08)" : "none",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  {/* Rank */}
                  <div style={{ width: 32, textAlign: "center", flexShrink: 0 }}>
                    {rank === 1 ? (
                      <span style={{ fontSize: 20 }}>🥇</span>
                    ) : rank === 2 ? (
                      <span style={{ fontSize: 20 }}>🥈</span>
                    ) : rank === 3 ? (
                      <span style={{ fontSize: 20 }}>🥉</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-3)" }}>{rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: "var(--surface-1)", overflow: "hidden", position: "relative", border: isMe ? "2px solid #c084fc" : "2px solid var(--border-2)" }}>
                    {e.avatar_url ? (
                      <img src={e.avatar_url} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#c084fc" }}>
                        {initials}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: isMe ? 900 : 800, color: isMe ? "#c084fc" : "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.username ? `@${e.username}` : label}
                    </div>
                  </div>

                  {/* Aura total */}
                  <div style={{ fontSize: 15, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", flexShrink: 0 }}>
                    {Number(e.aura_total).toLocaleString()}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
