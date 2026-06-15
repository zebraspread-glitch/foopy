"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import { formatAura } from "@/app/lib/format";
import { supabase } from "@/app/lib/supabase";
import { getLogo } from "@/app/match/[id]/utils";
import { AFL_TEAMS } from "@/app/lib/passes";

type Period = "day" | "week" | "month" | "overall";
type MainTab = "overall" | "teams" | "games";

type Entry = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  aura_total: number;
};

type Game = {
  id: number;
  hteam: string;
  ateam: string;
  hscore: number | null;
  ascore: number | null;
  date: string;
  round: number;
  roundname?: string;
};

type Particle = { left: number; delay: number; dur: number; size: number; sym: string };

const EARN_WAYS = [
  { icon: "📺", label: "Watch live game",   amount: "+10",     note: "once per game"      },
  { icon: "🎯", label: "Win a poll",        amount: "+20–100", note: "rarer = more aura"  },
  { icon: "🏆", label: "Pick the winner",   amount: "+3",      note: "before the game"    },
  { icon: "💬", label: "Post a comment",    amount: "+5",      note: "once per comment"   },
  { icon: "❤️", label: "Receive a like",   amount: "+2",      note: ""                   },
  { icon: "👍", label: "Like a comment",    amount: "+1",      note: ""                   },
  { icon: "🌅", label: "Daily login",       amount: "+10",     note: "once per day"       },
  { icon: "🎫", label: "Pass reward",       amount: "Varies",  note: "claim from passes"  },
];

const PERIOD_TABS: { label: string; value: Period }[] = [
  { label: "Today",   value: "day"     },
  { label: "Week",    value: "week"    },
  { label: "Month",   value: "month"   },
  { label: "All Time", value: "overall" },
];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function LeaderboardRow({ entry, rank, isMe }: { entry: Entry; rank: number; isMe: boolean }) {
  const label = entry.display_name || entry.username || "Unknown";
  return (
    <Link
      href={entry.username ? `/profile/${entry.username}` : "#"}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderTop: rank > 1 ? "1px solid var(--border-1)" : "none",
        background: isMe ? "rgba(139,92,246,0.08)" : "none",
        textDecoration: "none", color: "inherit",
      }}
    >
      <div style={{ width: 28, textAlign: "center", flexShrink: 0 }}>
        {rank === 1 ? <span style={{ fontSize: 18 }}>🥇</span>
          : rank === 2 ? <span style={{ fontSize: 18 }}>🥈</span>
          : rank === 3 ? <span style={{ fontSize: 18 }}>🥉</span>
          : <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-3)" }}>{rank}</span>}
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: "var(--surface-2)", overflow: "hidden", position: "relative",
        border: isMe ? "2px solid #c084fc" : "2px solid var(--border-2)",
      }}>
        {entry.avatar_url
          ? <img src={entry.avatar_url} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#c084fc" }}>{label[0]?.toUpperCase()}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: isMe ? 900 : 700, color: isMe ? "#c084fc" : "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.username ? `@${entry.username}` : label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", flexShrink: 0, letterSpacing: "-0.01em" }}>
        ✦ {formatAura(Number(entry.aura_total))}
      </div>
    </Link>
  );
}

function LeaderboardBox({ entries, loading, myUserId, emptyMsg }: { entries: Entry[]; loading: boolean; myUserId: string | null; emptyMsg?: string }) {
  return (
    <div style={{ borderRadius: 16, border: "1px solid var(--border-1)", background: "var(--surface-2)", overflow: "hidden" }}>
      {loading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 60, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", borderRadius: 0 }} />
          ))
        : entries.length === 0
          ? <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>{emptyMsg ?? "No data yet"}</div>
          : entries.map((e, i) => (
              <LeaderboardRow key={e.user_id} entry={e} rank={i + 1} isMe={e.user_id === myUserId} />
            ))
      }
    </div>
  );
}

export default function AuraPage() {
  return (
    <Suspense>
      <AuraPageInner />
    </Suspense>
  );
}

function AuraPageInner() {
  const [mainTab, setMainTab] = useState<MainTab>("overall");
  const [period, setPeriod] = useState<Period>("overall");

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myAura, setMyAura] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);

  // Overall leaderboard
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);

  // Team tab
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamEntries, setTeamEntries] = useState<Entry[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Game tab
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameEntries, setGameEntries] = useState<Entry[]>([]);
  const [gameLoading, setGameLoading] = useState(false);

  // Particles (client-only)
  const [particles, setParticles] = useState<Particle[]>([]);
  const SYMS = ["✦", "✧", "⋆", "✦", "✧"];
  useEffect(() => {
    setParticles(Array.from({ length: 18 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 5,
      dur: 4 + Math.random() * 5,
      size: 9 + Math.random() * 14,
      sym: SYMS[Math.floor(Math.random() * SYMS.length)],
    })));
  }, []);

  // Auth + my aura
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setMyUserId(uid);
      if (!uid) return;
      supabase.from("profiles").select("aura").eq("id", uid).single()
        .then(({ data: p }) => setMyAura(p?.aura ?? 0));
    });
  }, []);

  // Overall leaderboard
  useEffect(() => {
    if (mainTab !== "overall") return;
    setLbLoading(true);
    setEntries([]);
    supabase.rpc("get_aura_leaderboard", { period, limit_n: 50 })
      .then(({ data }) => { setEntries((data ?? []) as Entry[]); setLbLoading(false); });
  }, [period, mainTab]);

  // My rank in overall
  useEffect(() => {
    if (mainTab !== "overall" || !myUserId || entries.length === 0) { setMyRank(null); return; }
    const idx = entries.findIndex(e => e.user_id === myUserId);
    if (idx !== -1) { setMyRank(idx + 1); return; }
    if (period === "overall" && myAura !== null) {
      supabase.from("profiles").select("id", { count: "exact", head: true }).gt("aura", myAura)
        .then(({ count }) => setMyRank((count ?? 0) + 1));
    } else {
      setMyRank(null);
    }
  }, [entries, myUserId, period, mainTab, myAura]);

  // Team leaderboard
  useEffect(() => {
    if (!selectedTeam) return;
    setTeamLoading(true);
    setTeamEntries([]);
    supabase.rpc("get_team_aura_leaderboard", { p_team_name: selectedTeam, limit_n: 30 })
      .then(({ data, error }) => {
        if (!error) setTeamEntries((data ?? []) as Entry[]);
        setTeamLoading(false);
      });
  }, [selectedTeam]);

  // Recent games
  useEffect(() => {
    if (mainTab !== "games" || games.length > 0) return;
    setGamesLoading(true);
    fetch("https://api.squiggle.com.au/?q=games;complete=100;year=2025", {
      headers: { "User-Agent": "foopy/1.0" },
    })
      .then(r => r.json())
      .then(d => {
        const sorted = [...(d.games ?? [])]
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 40);
        setGames(sorted as Game[]);
        setGamesLoading(false);
      })
      .catch(() => setGamesLoading(false));
  }, [mainTab]);

  // Per-game leaderboard
  useEffect(() => {
    if (!selectedGame) return;
    setGameLoading(true);
    setGameEntries([]);
    supabase.rpc("get_game_aura_leaderboard", { p_game_id: selectedGame.id, limit_n: 20 })
      .then(({ data, error }) => {
        if (!error && data) setGameEntries(data as Entry[]);
        setGameLoading(false);
      });
  }, [selectedGame]);

  return (
    <>
      {/* ── Inline animations ── */}
      <style>{`
        @keyframes aura-particle {
          0%   { opacity: 0;   transform: translateY(0)    scale(0.6); }
          15%  { opacity: 1; }
          85%  { opacity: 0.7; }
          100% { opacity: 0;   transform: translateY(-120px) scale(1.1); }
        }
        @keyframes aura-hero-pulse {
          0%, 100% { text-shadow: 0 0 30px rgba(192,132,252,0.6), 0 0 60px rgba(139,92,246,0.4), 0 0 100px rgba(109,40,217,0.3); }
          50%       { text-shadow: 0 0 50px rgba(192,132,252,0.9), 0 0 100px rgba(139,92,246,0.7), 0 0 160px rgba(109,40,217,0.5); }
        }
        @keyframes aura-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes aura-hero-glow {
          0%, 100% { box-shadow: 0 0 60px rgba(139,92,246,0.25), 0 0 120px rgba(109,40,217,0.15); }
          50%       { box-shadow: 0 0 80px rgba(192,132,252,0.4), 0 0 160px rgba(139,92,246,0.25); }
        }
        @keyframes aura-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 90 }}>

        {/* ── Sticky header ── */}
        <PageHeader title="Aura" />

        {/* ── Hero ── */}
        <div style={{
          position: "relative", overflow: "hidden",
          background: "linear-gradient(180deg, rgba(109,40,217,0.22) 0%, rgba(139,92,246,0.1) 50%, transparent 100%)",
          padding: "36px 20px 40px",
          animation: "aura-hero-glow 4s ease-in-out infinite",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          {/* Glow blob */}
          <div style={{
            position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
            width: 340, height: 240, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* Floating particles */}
          {particles.map((p, i) => (
            <div key={i} style={{
              position: "absolute", bottom: 0, left: `${p.left}%`,
              fontSize: p.size, color: "#c084fc", userSelect: "none", pointerEvents: "none",
              animation: `aura-particle ${p.dur}s ${p.delay}s ease-in-out infinite`,
              opacity: 0,
            }}>
              {p.sym}
            </div>
          ))}

          {/* Big ✦ */}
          <div style={{
            fontSize: 72, lineHeight: 1, position: "relative", zIndex: 1,
            background: "linear-gradient(135deg, #c084fc 0%, #818cf8 40%, #fbbf24 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            animation: "aura-hero-pulse 3s ease-in-out infinite",
          }}>
            ✦
          </div>

          {/* Aura count */}
          {myAura !== null ? (
            <div style={{ textAlign: "center", zIndex: 1, animation: "aura-fade-in 0.5s ease both" }}>
              <div style={{
                fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1,
                background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                {myAura.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 4, letterSpacing: "0.06em" }}>
                YOUR AURA{myRank ? ` · ${ordinal(myRank)} globally` : ""}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.35)", zIndex: 1 }}>
              Sign in to track your Aura
            </div>
          )}
        </div>

        {/* ── How to Earn ── */}
        <div style={{ padding: "20px 16px 4px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: "rgba(192,132,252,0.7)", marginBottom: 12, textTransform: "uppercase" }}>
            How to Earn Aura
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {EARN_WAYS.map(w => (
              <div key={w.label} style={{
                background: "var(--surface-2)",
                border: "none",
                borderRadius: 14, padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 18 }}>{w.icon}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 900,
                    background: "linear-gradient(135deg, #c084fc, #818cf8)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>{w.amount}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.3 }}>{w.label}</div>
                {w.note && <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", lineHeight: 1.2 }}>{w.note}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Leaderboard section ── */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: "rgba(192,132,252,0.7)", marginBottom: 12, textTransform: "uppercase" }}>
            Leaderboards
          </div>

          {/* Main tab bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["overall", "teams", "games"] as MainTab[]).map(tab => (
              <button key={tab} onClick={() => setMainTab(tab)} style={{
                flex: 1, padding: "9px 4px",
                borderRadius: 12,
                border: mainTab === tab ? "1px solid rgba(139,92,246,0.5)" : "1px solid var(--border-2)",
                background: mainTab === tab ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))" : "var(--surface-2)",
                color: mainTab === tab ? "#c084fc" : "var(--text-3)",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                textTransform: "capitalize", transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}>
                {tab === "overall" ? "Overall" : tab === "teams" ? "By Team" : "By Game"}
              </button>
            ))}
          </div>

          {/* ── Overall tab ── */}
          {mainTab === "overall" && (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {PERIOD_TABS.map(t => (
                  <button key={t.value} onClick={() => setPeriod(t.value)} style={{
                    padding: "6px 14px", borderRadius: 999,
                    border: period === t.value ? "1px solid rgba(139,92,246,0.5)" : "1px solid var(--border-2)",
                    background: period === t.value ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))" : "var(--surface-2)",
                    color: period === t.value ? "#c084fc" : "var(--text-3)",
                    fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>
              {myUserId && myRank !== null && myAura !== null && (
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))", border: "1px solid rgba(139,92,246,0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>✦</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                    You're <span style={{ fontWeight: 900, color: "#c084fc" }}>{ordinal(myRank)}</span> with <span style={{ fontWeight: 900, color: "#c084fc" }}>{formatAura(myAura)}</span> Aura
                  </span>
                </div>
              )}
              <LeaderboardBox entries={entries} loading={lbLoading} myUserId={myUserId} emptyMsg="No aura earned this period yet" />
            </>
          )}

          {/* ── Teams tab ── */}
          {mainTab === "teams" && (
            <>
              {selectedTeam ? (
                <>
                  <button onClick={() => { setSelectedTeam(null); setTeamEntries([]); }} style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-3)",
                    fontSize: 13, fontWeight: 700, padding: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    All teams
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0 }}>
                      <img src={getLogo(selectedTeam)} alt={selectedTeam} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>{selectedTeam}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Supporter leaderboard</div>
                    </div>
                  </div>
                  <LeaderboardBox
                    entries={teamEntries} loading={teamLoading} myUserId={myUserId}
                    emptyMsg={`No ${selectedTeam} supporters with Aura yet`}
                  />
                </>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {AFL_TEAMS.map(team => (
                    <button key={team} onClick={() => setSelectedTeam(team)} style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      padding: "14px 8px", borderRadius: 14,
                      background: "var(--surface-2)", border: "1px solid var(--border-1)",
                      cursor: "pointer", transition: "all 0.15s",
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)" }}>
                        <img src={getLogo(team)} alt={team} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-2)", textAlign: "center", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                        {team.replace(" Cats", "").replace(" Lions", "").replace(" Giants", "").replace(" Suns", "").replace(" Eagles", "").replace(" Bulldogs", "")}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Games tab ── */}
          {mainTab === "games" && (
            <>
              {selectedGame ? (
                <>
                  <button onClick={() => { setSelectedGame(null); setGameEntries([]); }} style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-3)",
                    fontSize: 13, fontWeight: 700, padding: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    All games
                  </button>
                  <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGame.hteam}</span>
                        <img src={getLogo(selectedGame.hteam)} alt="" style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0 }} />
                      </div>
                      <div style={{ textAlign: "center", flexShrink: 0, padding: "0 8px" }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                          {selectedGame.hscore ?? "?"} – {selectedGame.ascore ?? "?"}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)" }}>FINAL</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, justifyContent: "flex-start" }}>
                        <img src={getLogo(selectedGame.ateam)} alt="" style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGame.ateam}</span>
                      </div>
                    </div>
                  </div>
                  <LeaderboardBox
                    entries={gameEntries} loading={gameLoading} myUserId={myUserId}
                    emptyMsg="No aura earned for this game yet"
                  />
                </>
              ) : gamesLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 66, borderRadius: 14, marginBottom: 8 }} />
                ))
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {games.map(g => (
                    <button key={g.id} onClick={() => setSelectedGame(g)} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 14px", borderRadius: 14,
                      background: "var(--surface-2)", border: "1px solid var(--border-1)",
                      cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.12s",
                    }}>
                      <img src={getLogo(g.hteam)} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.hteam} vs {g.ateam}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginTop: 1 }}>
                          Round {g.round} · {g.hscore} – {g.ascore}
                        </div>
                      </div>
                      <img src={getLogo(g.ateam)} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  ))}
                  {games.length === 0 && (
                    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>
                      No completed games found
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
