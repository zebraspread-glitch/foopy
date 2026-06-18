"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import PageHeader from "@/app/components/PageHeader";

type MainTab = "history" | "referrals";

type CoinEvent = {
  id:         string;
  event_type: string;
  related_id: string;
  amount:     number;
  created_at: string;
};

type Referral = {
  username:      string | null;
  referral_paid: boolean;
  created_at:    string;
};

const REFERRAL_COINS = 250;
const MAX_REFERRALS = 10;

const EVENT_META: Record<string, { label: string; icon: string }> = {
  pass_reward:         { label: "Pass reward",            icon: "🎫" },
  duel_win:            { label: "Won a duel",             icon: "⚔️" },
  winner_pick_correct: { label: "Correct winner pick",    icon: "🎉" },
  poll_leaderboard:    { label: "Poll leaderboard prize", icon: "🏅" },
  referral:            { label: "Referral bonus",         icon: "🤝" },
  aura_milestone_1k:   { label: "Aura milestone",         icon: "✦"  },
  aura_milestone_10k:  { label: "Big aura milestone",     icon: "🌟" },
  pack_open:           { label: "Opened a pack",          icon: "📦" },
  player_pass:         { label: "Bought a player pass",   icon: "🎟️" },
  team_pass:           { label: "Bought a team pass",     icon: "🎟️" },
};

function getEventMeta(type: string) {
  return EVENT_META[type] ?? { label: type.replace(/_/g, " "), icon: "🪙" };
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

export default function CoinsPage() {
  return (
    <Suspense>
      <CoinsInner />
    </Suspense>
  );
}

function CoinsInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [mainTab, setMainTab] = useState<MainTab>(
    searchParams?.get("tab") === "referrals" ? "referrals" : "history"
  );
  const [myUserId, setMyUserId]   = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [coins, setCoins]         = useState<number | null>(null);

  const [history, setHistory]     = useState<CoinEvent[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [copied, setCopied]       = useState(false);

  // auth + my profile
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setMyUserId(uid);
      if (!uid) { setHistLoading(false); setRefLoading(false); return; }
      supabase.from("profiles").select("coins, username").eq("id", uid).single()
        .then(({ data: p }) => {
          setCoins(p?.coins ?? 0);
          setMyUsername(p?.username ?? null);
        });
    });
  }, []);

  // coin history
  useEffect(() => {
    if (!myUserId) return;
    setHistLoading(true);
    supabase
      .from("coin_events")
      .select("id, event_type, related_id, amount, created_at")
      .eq("user_id", myUserId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setHistory((data ?? []) as CoinEvent[]);
        setHistLoading(false);
      });
  }, [myUserId]);

  // referrals (people who used my code)
  useEffect(() => {
    if (!myUserId) return;
    setRefLoading(true);
    supabase
      .from("profiles")
      .select("username, referral_paid, created_at")
      .eq("referred_by", myUserId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setReferrals((data ?? []) as Referral[]);
        setRefLoading(false);
      });
  }, [myUserId]);

  const paidCount    = referrals.filter(r => r.referral_paid).length;
  const pendingCount = referrals.length - paidCount;
  const coinsEarned  = paidCount * REFERRAL_COINS;
  const shareLink    = myUsername
    ? `https://foopy.app/login?mode=signup&ref=${myUsername}`
    : "";

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — ignore */ }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 60 }}>
      <PageHeader title="Coins" onBack={() => router.back()} />

      {/* Tabs */}
      <div style={{ background: "var(--bg)", borderBottom: "1px solid var(--border-1)" }}>
        <div style={{ display: "flex", padding: "0 18px 12px", gap: 6 }}>
          {(["history", "referrals"] as MainTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 12,
                border: mainTab === tab ? "1px solid rgba(251,191,36,0.5)" : "1px solid var(--border-2)",
                background: mainTab === tab ? "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(217,119,6,0.14))" : "var(--surface-3)",
                color: mainTab === tab ? "#fbbf24" : "var(--text-3)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: "0.04em",
                textTransform: "capitalize",
                transition: "all 0.15s",
              }}
            >
              {tab === "history" ? "History" : "Referrals"}
            </button>
          ))}
        </div>
      </div>

      {/* ── History tab ── */}
      {mainTab === "history" && (
        <div style={{ padding: "16px 16px 0" }}>
          {!myUserId ? (
            <div style={emptyStyle}>Sign in to view your coin history</div>
          ) : histLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 8 }} />
            ))
          ) : (
            <>
              {/* Total banner */}
              <div style={bannerStyle}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>Total Coins</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>
                  <img src="/coin/coin.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                  {(coins ?? 0).toLocaleString()}
                </span>
              </div>

              {history.length === 0 ? (
                <div style={emptyStyle}>
                  No coin activity yet — win duels, claim pass rewards, and hit aura milestones to earn coins!
                </div>
              ) : history.map((ev, i) => {
                const meta = getEventMeta(ev.event_type);
                const positive = ev.amount >= 0;
                return (
                  <div
                    key={ev.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: i < history.length - 1 ? "1px solid var(--border-1)" : "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{meta.label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>{timeAgo(ev.created_at)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: positive ? "#22c55e" : "#f87171", flexShrink: 0, marginLeft: 12 }}>
                      {positive ? "+" : "−"}{Math.abs(ev.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Referrals tab ── */}
      {mainTab === "referrals" && (
        <div style={{ padding: "16px 16px 0" }}>
          {!myUserId ? (
            <div style={emptyStyle}>Sign in to view your referrals</div>
          ) : refLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 8 }} />
            ))
          ) : (
            <>
              {/* Code + share */}
              <div style={{ padding: "16px", borderRadius: 16, border: "1px solid rgba(251,191,36,0.3)", background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(217,119,6,0.08))", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your referral code</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", marginTop: 4 }}>{myUsername ?? "—"}</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500, marginTop: 8, lineHeight: 1.4 }}>
                  Friends enter your username when signing up. You earn{" "}
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>{REFERRAL_COINS} coins</span>{" "}
                  once they watch their first live game — up to {MAX_REFERRALS} friends.
                </div>
                <button
                  onClick={copyLink}
                  disabled={!shareLink}
                  style={{ marginTop: 12, width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: shareLink ? "linear-gradient(135deg,#d97706,#fbbf24)" : "var(--surface-2)", color: shareLink ? "#1a1205" : "var(--text-3)", fontSize: 14, fontWeight: 900, cursor: shareLink ? "pointer" : "default" }}
                >
                  {copied ? "✓ Link copied!" : "Copy invite link"}
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{paidCount}<span style={{ fontSize: 14, color: "var(--text-3)", fontWeight: 700 }}>/{MAX_REFERRALS}</span></div>
                  <div style={statLabelStyle}>Joined</div>
                </div>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{pendingCount}</div>
                  <div style={statLabelStyle}>Pending</div>
                </div>
                <div style={statCardStyle}>
                  <div style={{ ...statValueStyle, color: "#fbbf24" }}>{coinsEarned.toLocaleString()}</div>
                  <div style={statLabelStyle}>Coins earned</div>
                </div>
              </div>

              {/* Referral list */}
              {referrals.length === 0 ? (
                <div style={emptyStyle}>No referrals yet — share your code to start earning!</div>
              ) : referrals.map((r, i) => (
                <div
                  key={`${r.username}-${i}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: i < referrals.length - 1 ? "1px solid var(--border-1)" : "none" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
                    @{r.username ?? "unknown"}
                  </div>
                  {r.referral_paid ? (
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}>
                      +{REFERRAL_COINS}
                      <img src="/coin/coin.png" alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Pending live game</span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const emptyStyle = { textAlign: "center" as const, padding: "60px 20px", color: "var(--text-3)", fontSize: 14, fontWeight: 700 };
const bannerStyle = { marginBottom: 14, padding: "13px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(251,191,36,0.14), rgba(217,119,6,0.08))", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" };
const statCardStyle = { flex: 1, padding: "12px 8px", borderRadius: 12, border: "1px solid var(--border-1)", background: "var(--surface-3)", textAlign: "center" as const };
const statValueStyle = { fontSize: 20, fontWeight: 900, color: "var(--text-1)" };
const statLabelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginTop: 2, textTransform: "uppercase" as const, letterSpacing: "0.04em" };
