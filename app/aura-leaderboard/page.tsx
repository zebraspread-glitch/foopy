"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatAura } from "@/app/lib/format";
import { supabase } from "@/app/lib/supabase";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";

type Period  = "day" | "week" | "month" | "overall";
type MainTab = "leaderboard" | "history";

type Entry = {
  user_id:      string;
  username:     string | null;
  display_name: string | null;
  avatar_url:   string | null;
  aura_total:   number;
  verified?:    boolean;
};

type AuraEvent = {
  id:         string;
  event_type: string;
  related_id: string;
  amount:     number;
  created_at: string;
};

const PERIOD_TABS: { label: string; value: Period }[] = [
  { label: "Today",   value: "day"     },
  { label: "Week",    value: "week"    },
  { label: "Month",   value: "month"   },
  { label: "Overall", value: "overall" },
];

const EVENT_META: Record<string, { label: string; icon: string }> = {
  live_game_view:         { label: "Viewed a live game",       icon: "📺" },
  daily_login:            { label: "Daily login",              icon: "🌅" },
  poll_correct:           { label: "Won a poll",               icon: "🎯" },
  winner_pick:            { label: "Picked the winner",        icon: "🏆" },
  pass_reward:            { label: "Pass reward",              icon: "🎫" },
  comment_post:           { label: "Posted a comment",         icon: "💬" },
  like_given:             { label: "Liked a post",             icon: "👍" },
  like_received:          { label: "Received a like",          icon: "❤️" },
  duel_win:               { label: "Won a duel",               icon: "⚔️" },
  duel_loss:              { label: "Lost a duel",              icon: "🛡️" },
  badge_first_blood:      { label: "Badge: First Blood",       icon: "🩸" },
  badge_perfect_duellist: { label: "Badge: Perfect Duellist",  icon: "💯" },
};

function getEventMeta(type: string) {
  return EVENT_META[type] ?? {
    label: type.replace(/_/g, " "),
    icon:  "✦",
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d <  7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function AuraLeaderboardPage() {
  return (
    <Suspense>
      <AuraLeaderboardInner />
    </Suspense>
  );
}

function AuraLeaderboardInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [mainTab, setMainTab]   = useState<MainTab>(
    searchParams?.get("tab") === "history" ? "history" : "leaderboard"
  );
  const [period, setPeriod]     = useState<Period>("overall");
  const [entries, setEntries]   = useState<Entry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRank, setMyRank]     = useState<number | null>(null);
  const [myAura, setMyAura]     = useState<number | null>(null);

  // history
  const [history, setHistory]         = useState<AuraEvent[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [profileAura, setProfileAura] = useState<number | null>(null);

  // auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setMyUserId(data.session?.user.id ?? null);
    });
  }, []);

  // leaderboard data
  useEffect(() => {
    if (mainTab !== "leaderboard") return;
    setLbLoading(true);
    supabase.rpc("get_aura_leaderboard", { period, limit_n: 50 })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setEntries((data ?? []) as Entry[]);
        setLbLoading(false);
      });
  }, [period, mainTab]);

  // my rank
  useEffect(() => {
    if (!myUserId || entries.length === 0) { setMyRank(null); setMyAura(null); return; }
    const idx = entries.findIndex(e => e.user_id === myUserId);
    if (idx !== -1) {
      setMyRank(idx + 1);
      setMyAura(entries[idx].aura_total);
    } else if (period === "overall") {
      supabase.from("profiles").select("aura").eq("id", myUserId).single()
        .then(({ data }) => {
          const total = data?.aura ?? 0;
          setMyAura(total);
          supabase.from("profiles").select("id", { count: "exact", head: true }).gt("aura", total)
            .then(({ count }) => setMyRank((count ?? 0) + 1));
        });
    } else {
      setMyRank(null); setMyAura(null);
    }
  }, [entries, myUserId, period]);

  // history data
  useEffect(() => {
    if (mainTab !== "history" || !myUserId) return;
    setHistLoading(true);
    // Fetch actual total from profile (source of truth)
    supabase.from("profiles").select("aura").eq("id", myUserId).single()
      .then(({ data }) => setProfileAura(data?.aura ?? 0));
    supabase
      .from("aura_events")
      .select("id, event_type, related_id, amount, created_at")
      .eq("user_id", myUserId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setHistory((data ?? []) as AuraEvent[]);
        setHistLoading(false);
      });
  }, [mainTab, myUserId]);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 60 }}>

      {/* ── Sticky header ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--border-1)", paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 12px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #c084fc, #818cf8, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            ✦ Aura
          </div>
        </div>

        {/* Main tab switch */}
        <div style={{ display: "flex", padding: "0 18px 12px", gap: 6 }}>
          {(["leaderboard", "history"] as MainTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 12,
                border: mainTab === tab ? "1px solid rgba(139,92,246,0.5)" : "1px solid var(--border-2)",
                background: mainTab === tab ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))" : "var(--surface-3)",
                color: mainTab === tab ? "#c084fc" : "var(--text-3)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: "0.04em",
                textTransform: "capitalize",
                transition: "all 0.15s",
              }}
            >
              {tab === "leaderboard" ? "Leaderboard" : "History"}
            </button>
          ))}
        </div>

        {/* Period sub-tabs (leaderboard only) */}
        {mainTab === "leaderboard" && (
          <div style={{ display: "flex", padding: "0 18px 12px", gap: 6 }}>
            {PERIOD_TABS.map(t => (
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
        )}
      </div>

      {/* ── Leaderboard tab ── */}
      {mainTab === "leaderboard" && (
        <div style={{ padding: "16px 16px 0" }}>
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

          <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-3)", overflow: "hidden" }}>
            {lbLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 60, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", borderRadius: 0 }} />
              ))
            ) : entries.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
                No data yet for this period
              </div>
            ) : entries.map((e, i) => {
              const rank  = i + 1;
              const isMe  = e.user_id === myUserId;
              const label = e.display_name || e.username || "Unknown";
              return (
                <Link
                  key={e.user_id}
                  href={e.username ? `/profile/${e.username}` : "#"}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i > 0 ? "1px solid var(--border-1)" : "none", background: isMe ? "rgba(139,92,246,0.08)" : "none", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ width: 32, textAlign: "center", flexShrink: 0 }}>
                    {rank === 1 ? <span style={{ fontSize: 20 }}>🥇</span>
                     : rank === 2 ? <span style={{ fontSize: 20 }}>🥈</span>
                     : rank === 3 ? <span style={{ fontSize: 20 }}>🥉</span>
                     : <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-3)" }}>{rank}</span>}
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: "var(--surface-1)", overflow: "hidden", position: "relative", border: isMe ? "2px solid #c084fc" : "2px solid var(--border-2)" }}>
                    {e.avatar_url
                      ? <img src={e.avatar_url} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#c084fc" }}>{label[0]?.toUpperCase()}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: isMe ? 900 : 800, color: isMe ? "#c084fc" : "var(--text-1)", display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.username ? `@${e.username}` : label}</span>
                      {e.verified && <VerifiedBadge size={13} />}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", flexShrink: 0 }}>
                    {formatAura(Number(e.aura_total))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {mainTab === "history" && (
        <div style={{ padding: "16px 16px 0" }}>
          {!myUserId ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
              Sign in to view your aura history
            </div>
          ) : histLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 8 }} />
            ))
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
              No aura earned yet — view live games, win polls, and claim pass rewards to earn aura!
            </div>
          ) : (
            <>
              {/* Total banner */}
              <div style={{ marginBottom: 14, padding: "13px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>Total Aura</span>
                <span style={{ fontSize: 18, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  ✦ {(profileAura ?? 0).toLocaleString()}
                </span>
              </div>

              {/* Event list — flat, no box */}
              {history.map((ev, i) => {
                const meta = getEventMeta(ev.event_type);
                return (
                  <div
                    key={ev.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: i < history.length - 1 ? "1px solid var(--border-1)" : "none" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>
                        {timeAgo(ev.created_at)}
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", flexShrink: 0, marginLeft: 12 }}>
                      +{ev.amount}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
