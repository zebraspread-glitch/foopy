"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import {
  AFL_TEAMS,
  MAX_PLAYER_PASSES,
  MAX_TEAM_PASSES,
  PLAYER_PASS_COST,
  TEAM_PASS_COST,
  PLAYER_PASS_LEVELS,
  TEAM_PASS_LEVELS,
  getPassLevel,
  type TeamPass,
  type PlayerPass,
  type PassReward,
  type PassLevelInfo,
} from "@/app/lib/passes";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";
import playersRaw from "@/app/data/players.json";
import { PlayerPassCard, TeamPassCard, PASS_TEAM_LOGOS, PASS_TEAM_COLORS, playerPassImgSrc } from "@/app/components/PassCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

const teamLogo  = (n: string) => PASS_TEAM_LOGOS[n]  ?? "/team-logos/default.png";
const teamColor = (n: string) => PASS_TEAM_COLORS[n] ?? "#6d28d9";


function fmtCoins(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
}

function CoinImg({ size = 14 }: { size?: number }) {
  return <img suppressHydrationWarning src="/coin/coin.png" alt="coins" style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle", display: "inline-block" }} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "player" | "team";

type PassesData = {
  teamPasses: TeamPass[];
  playerPasses: PlayerPass[];
  pendingRewards: unknown[];
  recentRewards: PassReward[];
  playerPassCount: number;
  hasBoughtTeamPass: boolean;
  coins: number;
};

// Local aliases so all the existing call sites keep working unchanged
const PlayerCard = PlayerPassCard;
const TeamCard   = ({ pass }: { pass: TeamPass }) => (
  <div style={{ display: "flex", justifyContent: "center" }}>
    <div style={{ width: "100%", maxWidth: 280 }}>
      <TeamPassCard pass={pass} />
    </div>
  </div>
);

// ── Empty state card ──────────────────────────────────────────────────────────

function EmptyCard({ tab, coins }: { tab: Tab; coins: number }) {
  const cost = tab === "player" ? PLAYER_PASS_COST : TEAM_PASS_COST;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "56px 20px", textAlign: "center" }}>
      <span style={{ fontSize: 44 }}>{tab === "team" ? "🏆" : "⭐"}</span>
      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-1)" }}>
        No {tab === "team" ? "Team" : "Player"} Pass
      </div>
      <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 260 }}>
        {tab === "team"
          ? "Support your team and earn bonus rewards every time they win."
          : "Follow your favourite players and earn rewards based on their Foopy Rating each game."}
      </div>
      {coins < cost && (
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          Need <CoinImg size={11} /> {fmtCoins(cost - coins)} more coins
        </div>
      )}
    </div>
  );
}

// ── Pass Leaderboard ──────────────────────────────────────────────────────────

type LeaderboardEntry = {
  id: string;
  user_id: string;
  serial_number: number | null;
  xp: number;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

function PassLeaderboard({ pass, onClose }: { pass: PlayerPass; onClose: () => void }) {
  const [sort, setSort]         = useState<"first" | "level">("first");
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(true);
  const [myId, setMyId]         = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    async function load() {
      setLoadingLb(true);
      try {
        const res = await fetch(`/api/passes/leaderboard?player_id=${encodeURIComponent(pass.player_id)}`);
        if (res.ok) setEntries(await res.json());
      } catch {}
      setLoadingLb(false);
    }
    load();
  }, [pass.player_id]);

  const sorted = [...entries].sort((a, b) =>
    sort === "first"
      ? (a.serial_number ?? 999999) - (b.serial_number ?? 999999)
      : (b.xp ?? 0) - (a.xp ?? 0)
  );

  const myRank = sorted.findIndex(e => e.user_id === myId) + 1;
  const total  = sorted.length;
  const imgSrc = playerPassImgSrc(pass.player_name, pass.team_name);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 2 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: 0, marginRight: 16 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)" }}>Leaderboard</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 1 }}>{pass.player_name} · {pass.team_name}</div>
        </div>
        {imgSrc && (
          <img src={imgSrc} alt={pass.player_name} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", objectPosition: "top", border: "2px solid var(--border-3)", background: "var(--surface-2)" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", padding: "16px 16px calc(100px + env(safe-area-inset-bottom))" }}>
        {/* Sort toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3, marginBottom: 14 }}>
          {(["first", "level"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              flex: 1, padding: "8px 0", borderRadius: 999, border: "none",
              background: sort === s ? "rgba(255,255,255,0.12)" : "transparent",
              color: sort === s ? "var(--text-1)" : "var(--text-3)",
              fontWeight: sort === s ? 800 : 600, fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
            }}>
              {s === "first" ? "First Bought" : "Level"}
            </button>
          ))}
        </div>

        {/* Your position */}
        {myRank > 0 && (
          <div style={{ textAlign: "center", marginBottom: 14, fontSize: 13, color: "var(--text-3)", fontWeight: 700 }}>
            You are <span style={{ color: "var(--text-1)", fontWeight: 900 }}>#{myRank}</span> of <span style={{ color: "var(--text-1)", fontWeight: 900 }}>{total}</span>
          </div>
        )}

        {loadingLb ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid var(--border-2)", borderTop: "2.5px solid #a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No pass holders yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300, margin: "0 auto", width: "100%" }}>
            {sorted.map((entry, idx) => {
              const level  = getPassLevel(entry.xp ?? 0, PLAYER_PASS_LEVELS);
              const isMe   = entry.user_id === myId;
              const serial = entry.serial_number;
              const rankLabel = serial != null ? `#${serial}` : `#${idx + 1}`;
              const rankColor = "#ffffff";

              return (
                <div key={entry.id} style={{
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  background: level.gradient,
                  border: `1.5px solid ${isMe ? level.color + "99" : level.color + "55"}`,
                  boxShadow: isMe
                    ? `0 4px 24px ${level.color}44, 0 0 0 0.5px rgba(255,255,255,0.08)`
                    : `0 4px 24px ${level.color}22, 0 0 0 0.5px rgba(255,255,255,0.06)`,
                  aspectRatio: "3/4",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* shimmer top edge */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />

                  {/* level badge — top left */}
                  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>
                    {level.name.toUpperCase()}
                  </div>

                  {/* rank / serial — top right */}
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, fontSize: 8, fontWeight: 900, color: rankColor, letterSpacing: "0.06em" }}>
                    {rankLabel}
                  </div>

                  {/* player photo — fills remaining space */}
                  <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "rgba(0,0,0,0.2)" }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={pass.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
                    }
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#0a0a14"})` }} />
                  </div>

                  {/* footer */}
                  <div style={{ padding: "8px 10px 10px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {entry.username ? `@${entry.username}` : "Unknown"}
                      </div>
                      {isMe && <span style={{ fontSize: 8, fontWeight: 900, color: level.color, flexShrink: 0, marginLeft: 4 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
                    {/* xp bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.06em" }}>{level.name.toUpperCase()} · {level.multiplier}×</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{level.isMaxed ? "MAX" : `${entry.xp ?? 0}/${level.nextXp}`}</span>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${level.darkColor},${level.color})`, boxShadow: `0 0 6px ${level.color}80` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Pass Leaderboard ─────────────────────────────────────────────────────

type TeamLeaderboardEntry = {
  id: string;
  user_id: string;
  team_name: string;
  serial_number: number | null;
  xp: number;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

function TeamPassLeaderboard({ pass, onClose }: { pass: TeamPass; onClose: () => void }) {
  const [sort, setSort]           = useState<"first" | "level">("first");
  const [entries, setEntries]     = useState<TeamLeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(true);
  const [myId, setMyId]           = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    async function load() {
      setLoadingLb(true);
      try {
        const res = await fetch(`/api/passes/team-leaderboard?team_name=${encodeURIComponent(pass.team_name)}`);
        if (res.ok) setEntries(await res.json());
      } catch {}
      setLoadingLb(false);
    }
    load();
  }, [pass.team_name]);

  const sorted = [...entries].sort((a, b) =>
    sort === "first"
      ? (a.serial_number ?? 999999) - (b.serial_number ?? 999999)
      : (b.xp ?? 0) - (a.xp ?? 0)
  );

  const myRank = sorted.findIndex(e => e.user_id === myId) + 1;
  const total  = sorted.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 2 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: 0, marginRight: 16 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)" }}>Leaderboard</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 1 }}>{pass.team_name} · Team Pass</div>
        </div>
        <img src={teamLogo(pass.team_name)} alt={pass.team_name}
          style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border-3)", background: teamColor(pass.team_name), flexShrink: 0 }} />
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", padding: "16px 16px calc(100px + env(safe-area-inset-bottom))" }}>
        {/* Sort toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3, marginBottom: 14 }}>
          {(["first", "level"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              flex: 1, padding: "8px 0", borderRadius: 999, border: "none",
              background: sort === s ? "rgba(255,255,255,0.12)" : "transparent",
              color: sort === s ? "var(--text-1)" : "var(--text-3)",
              fontWeight: sort === s ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>
              {s === "first" ? "First Bought" : "Level"}
            </button>
          ))}
        </div>

        {/* Your position */}
        {myRank > 0 && (
          <div style={{ textAlign: "center", marginBottom: 14, fontSize: 13, color: "var(--text-3)", fontWeight: 700 }}>
            You are <span style={{ color: "var(--text-1)", fontWeight: 900 }}>#{myRank}</span> of <span style={{ color: "var(--text-1)", fontWeight: 900 }}>{total}</span>
          </div>
        )}

        {loadingLb ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid var(--border-2)", borderTop: "2.5px solid #a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No pass holders yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300, margin: "0 auto", width: "100%" }}>
            {sorted.map((entry, idx) => {
              const level  = getPassLevel(entry.xp ?? 0, TEAM_PASS_LEVELS);
              const isMe   = entry.user_id === myId;
              const serial = entry.serial_number;
              const rankLabel = serial != null ? `#${serial}` : `#${idx + 1}`;
              const rankColor = "#ffffff";
              const color = teamColor(entry.team_name);

              return (
                <div key={entry.id} style={{
                  borderRadius: 20, overflow: "hidden", position: "relative",
                  background: level.gradient,
                  border: `1.5px solid ${isMe ? level.color + "99" : level.color + "55"}`,
                  boxShadow: isMe ? `0 6px 28px ${level.color}44` : `0 4px 24px ${level.color}22`,
                  aspectRatio: "3/4",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* shimmer */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  {/* level badge */}
                  <div style={{ position: "absolute", top: 10, left: 10, zIndex: 4, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999 }}>
                    {level.name.toUpperCase()}
                  </div>
                  {/* rank */}
                  <div style={{ position: "absolute", top: 10, right: 10, zIndex: 4, fontSize: 8, fontWeight: 900, color: rankColor, letterSpacing: "0.06em" }}>
                    {rankLabel}
                  </div>
                  {/* logo area */}
                  <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <div style={{ position: "absolute", width: "70%", height: "70%", borderRadius: "50%", background: `${color}40`, filter: "blur(32px)" }} />
                    <div style={{ width: 110, height: 110, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 1 }}>
                      <img src={teamLogo(entry.team_name)} alt={entry.team_name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
                  </div>
                  {/* footer */}
                  <div style={{ padding: "10px 12px 14px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {entry.username ? `@${entry.username}` : "Unknown"}
                      </div>
                      {isMe && <span style={{ fontSize: 8, fontWeight: 900, color: level.color, flexShrink: 0, marginLeft: 4 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{entry.team_name} · Team Pass</div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.06em" }}>{level.name.toUpperCase()} · {level.multiplier}×</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{level.isMaxed ? "MAX" : `${entry.xp}/${level.nextXp}`}</span>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${level.darkColor},${level.color})`, boxShadow: `0 0 6px ${level.color}80` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PassesPage() {
  const [token, setToken]             = useState<string | null>(null);
  const [authed, setAuthed]           = useState<boolean | null>(null);
  const [data, setData]               = useState<PassesData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>("player");
  const [teamPickerOpen, setTeamPickerOpen]     = useState(false);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [earningsOpen, setEarningsOpen]         = useState(false);
  const [playerSearch, setPlayerSearch]         = useState("");
  const [pendingPlayer, setPendingPlayer]       = useState<{ pid: string; name: string; team: string; imgSrc: string; xp: number } | null>(null);
  const [purchaseErr, setPurchaseErr]           = useState<string | null>(null);
  const [selectedPass, setSelectedPass]         = useState<PlayerPass | null>(null);
  const [playerSortBy, setPlayerSortBy]         = useState<"recent" | "level">("recent");
  const [leaderboardPass, setLeaderboardPass]   = useState<PlayerPass | null>(null);
  const [selectedTeamPass, setSelectedTeamPass]       = useState<TeamPass | null>(null);
  const [leaderboardTeamPass, setLeaderboardTeamPass] = useState<TeamPass | null>(null);
  const autoClaimFired = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setAuthed(!!s.session);
      setToken(s.session?.access_token ?? null);
    });
  }, []);

  const fetchData = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/passes", { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (token) fetchData(token);
    else if (authed === false) setLoading(false);
  }, [token, authed, fetchData]);

  // Auto-claim pending rewards on first load
  useEffect(() => {
    if (!token || !data || autoClaimFired.current) return;
    if ((data.pendingRewards?.length ?? 0) === 0) return;
    autoClaimFired.current = true;
    fetch("/api/passes/claim", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((result) => {
        if (result.claimed > 0 && result.totalAura > 0) auraToastEmitter.emit(result.totalAura, "pass rewards");
        fetchData(token);
      })
      .catch(() => {});
  }, [data, token, fetchData]);

  async function removeTeamPass(teamName: string) {
    if (!token) return;
    setSelectedTeamPass(null);
    await fetch("/api/passes/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ team_name: teamName }),
    });
    fetchData(token);
  }

  async function handleSetTeam(teamName: string) {
    if (!token) return;
    setTeamPickerOpen(false);
    setPurchaseErr(null);
    const res = await fetch("/api/passes/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ team_name: teamName }),
    });
    if (res.ok) {
      fetchData(token);
    } else {
      const body = await res.json().catch(() => ({}));
      setPurchaseErr(body.error ?? "Purchase failed");
      setTimeout(() => setPurchaseErr(null), 4000);
    }
  }

  async function addPlayerPass(playerId: string) {
    if (!token) return;
    setPlayerPickerOpen(false);
    setPlayerSearch("");
    setPendingPlayer(null);
    setPurchaseErr(null);
    const res = await fetch("/api/passes/player", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ player_id: playerId }),
    });
    if (res.ok) {
      fetchData(token);
    } else {
      const body = await res.json().catch(() => ({}));
      setPurchaseErr(body.error ?? "Purchase failed");
      setTimeout(() => setPurchaseErr(null), 4000);
    }
  }

  function openGetPasses() {
    if (tab === "team") setTeamPickerOpen(true);
    else setPlayerPickerOpen(true);
  }

  const ownedIds = new Set((data?.playerPasses ?? []).map((p) => p.player_id));
  const filtered = playerSearch.trim().length < 2 ? [] :
    (playersRaw as any[]).filter((p) => String(p.name ?? p.player ?? "").toLowerCase().includes(playerSearch.toLowerCase())).slice(0, 30);

  const coins      = data?.coins ?? 0;
  const passcost   = tab === "player" ? PLAYER_PASS_COST : TEAM_PASS_COST;
  const canGetMore = tab === "player"
    ? (data?.playerPassCount ?? 0) < MAX_PLAYER_PASSES
    : (data?.teamPasses?.length ?? 0) < MAX_TEAM_PASSES;

  if (authed === false) {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}><span style={titleStyle}>Passes</span></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 32px", textAlign: "center", gap: 14 }}>
          <div style={{ fontSize: 44 }}>🎫</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "var(--text-1)" }}>Sign in to use Passes</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 260 }}>Earn Aura and Coins from your favourite team and players every round.</div>
          <Link href="/login" style={{ marginTop: 8, display: "inline-block", padding: "12px 28px", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: 999, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>Passes</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data && <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}><CoinImg size={16} />{fmtCoins(coins)}</span>}
          {data && (
            <button onClick={() => setEarningsOpen(true)} style={{ padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
              Earnings
            </button>
          )}
        </div>
      </div>

      {/* Tab toggle + Get Passes */}
      <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
        {/* Toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3, flex: 1 }}>
          {(["player", "team"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 999, border: "none",
              background: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
              color: tab === t ? "var(--text-1)" : "var(--text-3)",
              fontWeight: tab === t ? 800 : 600, fontSize: 13,
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {t === "player" ? "Players" : "Team"}
            </button>
          ))}
        </div>

        {/* Get Passes button */}
        <button suppressHydrationWarning onClick={canGetMore ? openGetPasses : undefined} style={{
            visibility: canGetMore ? "visible" : "hidden",
            padding: "10px 18px", borderRadius: 999,
            background: "linear-gradient(135deg,#854d0e,#ca8a04)",
            border: "none", color: "#fff", fontWeight: 900, fontSize: 13,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            Get Pass · <CoinImg size={12} /> {fmtCoins(passcost)}
          </button>
      </div>

      {/* Purchase error */}
      {purchaseErr && (
        <div style={{ margin: "10px 16px 0", padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 13, fontWeight: 700, color: "#f87171" }}>
          {purchaseErr === "Not enough coins"
            ? <span>Not enough coins — open packs to earn more <CoinImg size={13} /></span>
            : purchaseErr}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <div style={{ width: 28, height: 28, border: "2.5px solid var(--border-2)", borderTop: "2.5px solid #a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : tab === "team" ? (
        <div style={{ padding: "16px 16px 100px" }}>
          {(data?.teamPasses?.length ?? 0) === 0 ? (
            <EmptyCard tab="team" coins={coins} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: (data?.teamPasses?.length ?? 0) === 1 ? "1fr" : "1fr 1fr", gap: 10, maxWidth: (data?.teamPasses?.length ?? 0) === 1 ? 280 : undefined, margin: "0 auto" }}>
              {data!.teamPasses.map((pass) => (
                <div key={pass.id} onClick={() => setSelectedTeamPass(pass)} style={{ cursor: "pointer" }}>
                  <TeamCard pass={pass} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "16px 16px 100px" }}>
          {(data?.playerPasses.length ?? 0) === 0 ? (
            <EmptyCard tab="player" coins={coins} />
          ) : (
            <>
              {/* Sort controls */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 5, marginBottom: 10 }}>
                {(["recent", "level"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setPlayerSortBy(key)}
                    style={{
                      appearance: "none", border: "none", cursor: "pointer",
                      padding: "5px 12px", borderRadius: 999,
                      fontSize: 11, fontWeight: 800, fontFamily: "inherit",
                      background: playerSortBy === key ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                      color: playerSortBy === key ? "#fff" : "rgba(255,255,255,.38)",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {key === "recent" ? "Recent" : "Level"}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[...data!.playerPasses]
                  .sort((a, b) =>
                    playerSortBy === "level"
                      ? (b.xp ?? 0) - (a.xp ?? 0)
                      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                  .map((pass) => (
                    <div key={pass.id} onClick={() => setSelectedPass(pass)} style={{ cursor: "pointer" }}>
                      <PlayerCard pass={pass} />
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pass detail modal */}
      {selectedPass && (
        <Modal title={selectedPass.player_name} onClose={() => setSelectedPass(null)} centered>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Card preview */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: 180 }}>
                <PlayerCard pass={selectedPass} />
              </div>
            </div>
            {/* Stats row */}
            {(() => {
              const level = getPassLevel(selectedPass.xp ?? 0, PLAYER_PASS_LEVELS);
              return (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, background: `${level.color}12`, border: `1px solid ${level.color}30`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: level.color }}>{level.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>LEVEL</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)" }}>{selectedPass.xp ?? 0}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>XP</div>
                  </div>
                  {selectedPass.serial_number != null && (
                    <div style={{ flex: 1, background: `${level.color}12`, border: `1px solid ${level.color}30`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: level.color }}>#{selectedPass.serial_number}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>SERIAL</div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Leaderboard button */}
            <button
              onClick={() => { setLeaderboardPass(selectedPass); setSelectedPass(null); }}
              style={{ width: "100%", padding: "13px 0", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#312e81,#4f46e5)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              🏆 Leaderboard
            </button>
          </div>
        </Modal>
      )}

      {/* Leaderboard overlay */}
      {leaderboardPass && (
        <PassLeaderboard pass={leaderboardPass} onClose={() => setLeaderboardPass(null)} />
      )}

      {/* Team pass detail modal */}
      {selectedTeamPass && (
        <Modal title={selectedTeamPass.team_name} onClose={() => setSelectedTeamPass(null)} centered>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <TeamCard pass={selectedTeamPass} />
            {(() => {
              const level = getPassLevel(selectedTeamPass.xp ?? 0, TEAM_PASS_LEVELS);
              return (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, background: `${level.color}12`, border: `1px solid ${level.color}30`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: level.color }}>{level.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>LEVEL</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)" }}>{selectedTeamPass.xp ?? 0}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>XP</div>
                  </div>
                  {selectedTeamPass.serial_number != null && (
                    <div style={{ flex: 1, background: `${level.color}12`, border: `1px solid ${level.color}30`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: level.color }}>#{selectedTeamPass.serial_number}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 2 }}>SERIAL</div>
                    </div>
                  )}
                </div>
              );
            })()}
            <button
              onClick={() => { setLeaderboardTeamPass(selectedTeamPass); setSelectedTeamPass(null); }}
              style={{ width: "100%", padding: "13px 0", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#312e81,#4f46e5)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              🏆 Leaderboard
            </button>
            <button
              onClick={() => removeTeamPass(selectedTeamPass.team_name)}
              style={{ width: "100%", padding: "11px 0", borderRadius: 999, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Remove Pass
            </button>
          </div>
        </Modal>
      )}

      {/* Team leaderboard overlay */}
      {leaderboardTeamPass && (
        <TeamPassLeaderboard pass={leaderboardTeamPass} onClose={() => setLeaderboardTeamPass(null)} />
      )}

      {/* Earnings */}
      {earningsOpen && data && (
        <EarningsModal
          rewards={data.recentRewards}
          playerPasses={data.playerPasses}
          teamPasses={data.teamPasses}
          onClose={() => setEarningsOpen(false)}
        />
      )}

      {/* Team Picker */}
      {teamPickerOpen && (
        <Modal title={`Buy Team Pass · ${fmtCoins(TEAM_PASS_COST)} coins · ${data?.teamPasses?.length ?? 0}/${MAX_TEAM_PASSES}`} onClose={() => setTeamPickerOpen(false)} centered>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {AFL_TEAMS.map((team) => {
              const active = (data?.teamPasses ?? []).some(p => p.team_name === team);
              return (
                <button key={team} onClick={() => !active && handleSetTeam(team)} disabled={active} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, border: `1px solid ${active ? teamColor(team) + "70" : "var(--border-2)"}`, background: active ? `${teamColor(team)}18` : "rgba(255,255,255,0.03)", cursor: active ? "default" : "pointer", width: "100%", textAlign: "left", opacity: active ? 0.7 : 1 }}>
                  <img src={teamLogo(team)} alt={team} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "50%", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)", flex: 1 }}>{team}</span>
                  {active && <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 800 }}>Active ✓</span>}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Player Picker */}
      {playerPickerOpen && (
        <Modal
          centered
          title={pendingPlayer ? "Player Pass" : `Add Player Pass · ${fmtCoins(PLAYER_PASS_COST)} coins`}
          onClose={() => { setPlayerPickerOpen(false); setPlayerSearch(""); setPendingPlayer(null); }}
        >
          {pendingPlayer ? (
            /* ── Confirmation screen ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Card preview */}
              {(() => {
                const existingPass = data?.playerPasses?.find((p) => p.player_id === pendingPlayer.pid);
                const previewPass: PlayerPass = existingPass ?? {
                  id: "",
                  user_id: "",
                  player_id: pendingPlayer.pid,
                  player_name: pendingPlayer.name,
                  team_name: pendingPlayer.team,
                  active: true,
                  xp: pendingPlayer.xp,
                  serial_number: null,
                  created_at: "",
                };
                return (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ width: 160 }}>
                      <PlayerCard pass={previewPass} />
                    </div>
                  </div>
                );
              })()}

              {/* Pass info */}
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: "var(--text-1)" }}>{pendingPlayer.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>{pendingPlayer.team}</div>
                <div style={{ height: 1, background: "var(--border-1)" }} />
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
                  Earn <span style={{ color: "#a78bfa", fontWeight: 800 }}>Aura</span> &amp; <span style={{ color: "#fbbf24", fontWeight: 800 }}>Coins</span> based on {pendingPlayer.name.split(" ")[0]}'s Foopy Rating each game. The pass levels up as you earn XP, increasing your reward multiplier up to <span style={{ color: "#c084fc", fontWeight: 800 }}>7×</span>.
                </div>
                <div style={{ height: 1, background: "var(--border-1)" }} />
                {/* Multipliers preview */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PLAYER_PASS_LEVELS.map((lvl, i) => (
                    <div key={lvl.name} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: `${lvl.color}18`, border: `1px solid ${lvl.color}40` }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: lvl.color }}>{lvl.name}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>{[1,1.25,1.5,1.75,2,2.5,3,4,5,7][i]}×</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginBottom: 2 }}>COST</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24", display: "flex", alignItems: "center", gap: 5 }}>
                    <CoinImg size={18} />{fmtCoins(PLAYER_PASS_COST)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginBottom: 2 }}>YOUR BALANCE</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: coins >= PLAYER_PASS_COST ? "#fbbf24" : "#f87171", display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                    <CoinImg size={18} />{fmtCoins(coins)}
                  </div>
                </div>
              </div>

              {coins < PLAYER_PASS_COST && (
                <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, fontWeight: 700, color: "#f87171", textAlign: "center" }}>
                  Need <CoinImg size={13} /> {fmtCoins(PLAYER_PASS_COST - coins)} more — open packs to earn coins
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPendingPlayer(null)} style={{ flex: 1, padding: "13px 0", borderRadius: 999, border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.05)", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  ← Back
                </button>
                <button
                  onClick={() => coins >= PLAYER_PASS_COST && addPlayerPass(pendingPlayer.pid)}
                  disabled={coins < PLAYER_PASS_COST}
                  style={{ flex: 2, padding: "13px 0", borderRadius: 999, border: "none", background: coins >= PLAYER_PASS_COST ? "linear-gradient(135deg,#854d0e,#ca8a04)" : "rgba(255,255,255,0.08)", color: coins >= PLAYER_PASS_COST ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: 900, fontSize: 15, cursor: coins >= PLAYER_PASS_COST ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  Get Pass · <CoinImg size={14} /> {fmtCoins(PLAYER_PASS_COST)}
                </button>
              </div>
            </div>
          ) : (
            /* ── Search screen ── */
            <>
              <input type="text" placeholder="Search player name…" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} autoFocus
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--border-2)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 15, fontWeight: 600, marginBottom: 10, outline: "none", boxSizing: "border-box" }}
              />
              {playerSearch.trim().length < 2 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>Type at least 2 characters</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>No players found</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 400, overflowY: "auto" }}>
                  {filtered.map((p: any, i: number) => {
                    const pid   = String(p.id ?? "");
                    const pname = String(p.name ?? p.player ?? "");
                    const team  = String(p.club ?? p.team ?? "");
                    const owned  = ownedIds.has(pid);
                    const imgSrc = playerPassImgSrc(pname, team);
                    return (
                      <button key={`${pid}_${i}`} onClick={async () => {
                          if (owned) return;
                          // Fetch XP from user's existing cards for this player.
                          // Try matching by player_name (case-insensitive) — most reliable since
                          // user_cards.player_id format may differ from playersRaw id format.
                          const { data: byName } = await supabase
                            .from("user_cards")
                            .select("rating, duplicate_count")
                            .ilike("player_name", pname.trim());
                          // Fallback: also try by the cardIdForName format of the player id
                          const cardPlayerId = pname.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "");
                          const { data: byId } = await supabase
                            .from("user_cards")
                            .select("rating, duplicate_count")
                            .eq("player_id", cardPlayerId);
                          // Merge and deduplicate — pick whichever query returned rows
                          const cardRows = (byName?.length ? byName : byId) ?? [];
                          const xp = cardRows.reduce(
                            (sum: number, c: any) => sum + (Number(c.rating) || 0) * Math.max(Number(c.duplicate_count) || 1, 1),
                            0
                          );
                          setPendingPlayer({ pid, name: pname, team, imgSrc, xp });
                        }} disabled={owned} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-2)", background: owned ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)", cursor: owned ? "default" : "pointer", opacity: owned ? 0.45 : 1, width: "100%", textAlign: "left" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.07)" }}>
                          {imgSrc
                            ? <img src={imgSrc} alt={pname} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pname}</div>
                          <div style={{ fontSize: 12, color: "var(--text-3)" }}>{team}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0, color: owned ? "#a78bfa" : "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
                          {owned ? "Owned" : <><CoinImg size={12} />{fmtCoins(PLAYER_PASS_COST)}</>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Earnings Modal ────────────────────────────────────────────────────────────

function EarningsModal({ rewards, playerPasses, teamPasses, onClose }: {
  rewards: PassReward[];
  playerPasses: PlayerPass[];
  teamPasses: TeamPass[];
  onClose: () => void;
}) {
  const passName = (r: PassReward): string => {
    if (r.pass_type === "team") return teamPasses.find(p => p.id === r.pass_id)?.team_name ?? "Team Pass";
    return playerPasses.find((p) => p.id === r.pass_id)?.player_name ?? "Player Pass";
  };

  const totalAura  = rewards.reduce((s, r) => s + r.aura_reward, 0);
  const totalCoins = rewards.reduce((s, r) => s + r.coin_reward, 0);

  return (
    <Modal title="Pass Earnings" onClose={onClose} centered>
      {/* Totals */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#a78bfa" }}>{totalAura.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700, marginTop: 2 }}>AURA EARNED</div>
        </div>
        <div style={{ flex: 1, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <CoinImg size={16} />{fmtCoins(totalCoins)}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700, marginTop: 2 }}>COINS EARNED</div>
        </div>
      </div>

      {rewards.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No earnings yet this season</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rewards.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: r.pass_type === "team" ? "#fbbf24" : "#a78bfa" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{passName(r)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                  {new Date(r.claimed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#a78bfa" }}>+{r.aura_reward} Aura</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 1 }}>
                  +<CoinImg size={10} />{r.coin_reward}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, centered }: { title: string; onClose: () => void; children: ReactNode; centered?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: centered ? "center" : "flex-end", justifyContent: "center", padding: centered ? "0 16px" : 0 }}>
      <div style={{ background: "var(--surface-1)", borderRadius: centered ? 20 : "20px 20px 0 0", width: "100%", maxWidth: centered ? 480 : undefined, maxHeight: "85dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: "1px solid var(--border-1)" }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: "var(--text-1)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "12px 14px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "var(--bg)" };

const headerStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "56px 16px 12px", borderBottom: "1px solid var(--border-1)",
};

const titleStyle: CSSProperties = {
  fontSize: 26, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em",
};
