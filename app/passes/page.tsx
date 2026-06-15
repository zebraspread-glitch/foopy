"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Search, Ticket, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
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
  xpProgressLabel,
  playerPassIdentityKey,
  type TeamPass,
  type PlayerPass,
  type PassReward,
  type PassLevelInfo,
} from "@/app/lib/passes";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";
import playersRaw from "@/app/data/players.json";
import { PlayerPassCard, TeamPassCard, PASS_TEAM_LOGOS, PASS_TEAM_COLORS, playerPassImgSrc, patternBackground } from "@/app/components/PassCard";
import type { Cosmetic } from "@/app/lib/cosmetics";

// ── Helpers ───────────────────────────────────────────────────────────────────

const teamLogo  = (n: string) => PASS_TEAM_LOGOS[n]  ?? "/team-logos/default.png";
const teamColor = (n: string) => PASS_TEAM_COLORS[n] ?? "#6d28d9";

// ── Pattern Picker ────────────────────────────────────────────────────────────
// Lets the user equip one of their owned "Pass Background" patterns onto a
// single Player/Team Pass card. The swatches preview in the card's current level
// colours so the user sees exactly how the pattern will look.

function PatternPicker({ owned, current, level, onSelect }: {
  owned: Cosmetic[];
  current: string | null;
  level: PassLevelInfo;
  onSelect: (pattern: string | null) => void;
}) {
  if (owned.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 8 }}>PATTERN</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onSelect(null)}
          style={{
            width: 44, height: 44, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            background: "var(--surface-2)", border: current === null ? "2px solid #fff" : "1px solid rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "rgba(255,255,255,0.5)",
          }}
          title="None"
        >
          ✕
        </button>
        {owned.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.asset)}
            style={{
              width: 44, height: 44, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", padding: 0,
              background: patternBackground(c.asset, level),
              border: current === c.asset ? "2px solid #fff" : "1px solid rgba(255,255,255,0.12)",
            }}
            title={c.name}
          />
        ))}
      </div>
    </div>
  );
}


function fmtCoins(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
}

function shortRelativeTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days >= 365) return `${Math.floor(days / 365)}y`;
  if (days >= 30) return `${Math.floor(days / 30)}mo`;
  if (days >= 1) return `${days}d`;
  return "today";
}

function CoinImg({ size = 14 }: { size?: number }) {
  return <img suppressHydrationWarning src="/coin/coin.png" alt="coins" style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle", display: "inline-block" }} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "player" | "team";

type PendingPlayerPass = {
  pid: string;
  name: string;
  team: string;
  imgSrc: string;
  xp: number;
};

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
const TeamCard   = ({ pass, pattern }: { pass: TeamPass; pattern?: string | null }) => (
  <div style={{ display: "flex", justifyContent: "center" }}>
    <div style={{ width: "100%", maxWidth: 280 }}>
      <TeamPassCard pass={pass} pattern={pattern} />
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
  pattern: string | null;
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
    <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", flexShrink: 0, zIndex: 2 }}>
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

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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

              return (
                <div key={entry.id} style={{
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  background: patternBackground(entry.pattern, level),
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
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, fontSize: 8, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>
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
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{xpProgressLabel(level)}</span>
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
  pattern: string | null;
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
    <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", flexShrink: 0, zIndex: 2 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: 0, marginRight: 16 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)" }}>Leaderboard</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 1 }}>{pass.team_name} · Team Pass</div>
        </div>
        <img src={teamLogo(pass.team_name)} alt={pass.team_name}
          style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border-3)", background: teamColor(pass.team_name), flexShrink: 0 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
              const color = teamColor(entry.team_name);

              return (
                <div key={entry.id} style={{
                  borderRadius: 20, overflow: "hidden", position: "relative",
                  background: patternBackground(entry.pattern, level),
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
                  <div style={{ position: "absolute", top: 10, right: 10, zIndex: 4, fontSize: 8, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>
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
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{xpProgressLabel(level)}</span>
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
    </div>
  );
}

// ── Global Pass View ─────────────────────────────────────────────────────────

type GlobalSubTab  = "leaderboard" | "purchases";
type GlobalPassType = "player" | "team";
type PurchasePeriod = "1d" | "7d" | "all";

type GlobalPlayerEntry = { id: string; player_name: string; team_name: string; xp: number; serial_number: number | null; pattern: string | null; username: string | null; avatar_url: string | null; verified?: boolean };
type GlobalTeamEntry   = { id: string; team_name: string; xp: number; serial_number: number | null; pattern: string | null; username: string | null; avatar_url: string | null; verified?: boolean };
type MostBoughtPlayer  = { player_id: string; player_name: string; team_name: string; count: number };
type MostBoughtTeam    = { team_name: string; count: number };

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <div style={{ width: 26, height: 26, border: "2.5px solid var(--border-2)", borderTop: "2.5px solid #a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );
}

function GlobalPassView() {
  const [subTab,    setSubTab]    = useState<GlobalSubTab>("leaderboard");
  const [passType,  setPassType]  = useState<GlobalPassType>("player");
  const [period,    setPeriod]    = useState<PurchasePeriod>("1d");

  const [playerLb,     setPlayerLb]     = useState<GlobalPlayerEntry[]>([]);
  const [teamLb,       setTeamLb]       = useState<GlobalTeamEntry[]>([]);
  const [lbLoading,    setLbLoading]    = useState(false);
  const [playerPurch,  setPlayerPurch]  = useState<MostBoughtPlayer[]>([]);
  const [teamPurch,    setTeamPurch]    = useState<MostBoughtTeam[]>([]);
  const [purchLoading, setPurchLoading] = useState(false);

  const year = new Date().getFullYear();

  // ── Leaderboard ──
  useEffect(() => {
    if (subTab !== "leaderboard") return;
    setLbLoading(true);
    fetch(`/api/passes/global-leaderboard?type=${passType}&limit=50`)
      .then(r => r.json())
      .then(data => {
        if (passType === "player") setPlayerLb(data ?? []);
        else setTeamLb(data ?? []);
        setLbLoading(false);
      })
      .catch(() => setLbLoading(false));
  }, [subTab, passType]);

  // ── Purchases ──
  useEffect(() => {
    if (subTab !== "purchases") return;
    setPurchLoading(true);
    fetch(`/api/passes/global-purchases?type=${passType}&period=${period}`)
      .then(r => r.json())
      .then(data => {
        if (passType === "player") setPlayerPurch(data ?? []);
        else setTeamPurch(data ?? []);
        setPurchLoading(false);
      })
      .catch(() => setPurchLoading(false));
  }, [subTab, passType, period]);

  const toggleStyle = (active: boolean): CSSProperties => ({
    flex: 1, padding: "8px 0", borderRadius: 999, border: "none",
    background: active ? "rgba(255,255,255,0.13)" : "transparent",
    color: active ? "var(--text-1)" : "var(--text-3)",
    fontWeight: active ? 800 : 600, fontSize: 13,
    cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
  });

  const pillStyle = (active: boolean): CSSProperties => ({
    padding: "6px 14px", borderRadius: 999,
    border: active ? "1px solid rgba(167,139,250,0.5)" : "1px solid var(--border-2)",
    background: active ? "rgba(139,92,246,0.18)" : "var(--surface-2)",
    color: active ? "#c084fc" : "var(--text-3)",
    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div style={{ padding: "14px 16px 100px" }}>

      {/* Sub-tab: Leaderboard | Purchases */}
      <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3, marginBottom: 14 }}>
        {(["leaderboard", "purchases"] as GlobalSubTab[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={toggleStyle(subTab === t)}>
            {t === "leaderboard" ? `🏆 Leaderboard (${year})` : "🔥 Most Bought"}
          </button>
        ))}
      </div>

      {/* Pass type: Player | Team */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["player", "team"] as GlobalPassType[]).map(t => (
          <button key={t} onClick={() => setPassType(t)} style={pillStyle(passType === t)}>
            {t === "player" ? "Player Passes" : "Team Passes"}
          </button>
        ))}
        {subTab === "purchases" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
            {(["1d", "7d", "all"] as PurchasePeriod[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={pillStyle(period === p)}>
                {p === "all" ? "All" : p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Leaderboard ── */}
      {subTab === "leaderboard" && (
        lbLoading ? <Spinner /> : (
          <>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>
                Leaderboard<span style={{ fontWeight: 500, color: "var(--text-3)", fontSize: 13 }}>(season)</span>
              </span>
            </div>
            <div style={{ background: "var(--surface-1)", borderRadius: 16, border: "1px solid var(--border-1)", overflow: "hidden" }}>
              {(passType === "player" ? playerLb : teamLb).length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No passes yet</div>
              ) : passType === "player" ? (
                playerLb.map((e, i) => {
                  const level  = getPassLevel(e.xp, PLAYER_PASS_LEVELS);
                  const imgSrc = playerPassImgSrc(e.player_name, e.team_name);
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", paddingRight: 16, overflow: "hidden" }}>
                      {/* Left accent bar */}
                      <div style={{ width: 3, alignSelf: "stretch", background: level.color, flexShrink: 0 }} />
                      {/* Mini player pass card */}
                      <div style={{ width: 38, height: 50, borderRadius: 7, overflow: "hidden", flexShrink: 0, position: "relative", background: patternBackground(e.pattern, level), border: `1px solid ${level.color}55`, boxShadow: `0 2px 10px ${level.color}30` }}>
                        {/* shimmer top */}
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                        {imgSrc
                          ? <img src={imgSrc} alt={e.player_name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</div>}
                        {/* bottom fade */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 14, background: `linear-gradient(to top, rgba(0,0,0,0.5), transparent)`, zIndex: 2 }} />
                      </div>
                      {/* Name + owner */}
                      <div style={{ flex: 1, minWidth: 0, padding: "13px 0" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{e.player_name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>{e.username ? `@${e.username}` : "—"}{e.verified && <VerifiedBadge size={11} />}</div>
                      </div>
                      {/* XP + serial */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: level.color, letterSpacing: "-0.02em" }}>
                          {(e.xp ?? 0).toLocaleString()}
                        </div>
                        {e.serial_number != null && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginTop: 3, textAlign: "right" }}>
                            #{e.serial_number}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                teamLb.map((e, i) => {
                  const level = getPassLevel(e.xp, TEAM_PASS_LEVELS);
                  const color = teamColor(e.team_name);
                  const logo  = teamLogo(e.team_name);
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", paddingRight: 16, overflow: "hidden" }}>
                      <div style={{ width: 3, alignSelf: "stretch", background: color, flexShrink: 0 }} />
                      {/* Mini team pass card */}
                      <div style={{ width: 38, height: 50, borderRadius: 7, overflow: "hidden", flexShrink: 0, position: "relative", background: patternBackground(e.pattern, level), border: `1px solid ${level.color}55`, boxShadow: `0 2px 10px ${level.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {/* shimmer top */}
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                        {/* colour glow blob */}
                        <div style={{ position: "absolute", width: "80%", height: "70%", borderRadius: "50%", background: `${color}55`, filter: "blur(10px)", zIndex: 0 }} />
                        {/* logo */}
                        <img src={logo} alt={e.team_name} style={{ width: "72%", height: "72%", objectFit: "contain", position: "relative", zIndex: 1 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "13px 0" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{e.team_name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>{e.username ? `@${e.username}` : "—"}{e.verified && <VerifiedBadge size={11} />}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: level.color, letterSpacing: "-0.02em" }}>
                          {(e.xp ?? 0).toLocaleString()}
                        </div>
                        {e.serial_number != null && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginTop: 3, textAlign: "right" }}>
                            #{e.serial_number}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )
      )}

      {/* ── Purchases ── */}
      {subTab === "purchases" && (
        purchLoading ? <Spinner /> : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>
                Purchases<span style={{ fontWeight: 500, color: "var(--text-3)", fontSize: 13 }}>({period === "all" ? "all time" : period})</span>
              </span>
            </div>
            <div style={{ background: "var(--surface-1)", borderRadius: 16, border: "1px solid var(--border-1)", overflow: "hidden" }}>
              {(passType === "player" ? playerPurch : teamPurch).length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No purchases in this period</div>
              ) : passType === "player" ? (
                playerPurch.map((e, i) => {
                  const imgSrc = playerPassImgSrc(e.player_name, e.team_name);
                  return (
                    <div key={e.player_id} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", paddingRight: 16, overflow: "hidden" }}>
                      <div style={{ width: 3, alignSelf: "stretch", background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#d97706" : "var(--border-2)", flexShrink: 0 }} />
                      {/* Mini player pass card (purchases) */}
                      <div style={{ width: 38, height: 50, borderRadius: 7, overflow: "hidden", flexShrink: 0, position: "relative", background: "linear-gradient(155deg,#1a0a33,#2d1060)", border: "1px solid rgba(167,139,250,0.3)", boxShadow: "0 2px 8px rgba(109,40,217,0.25)" }}>
                        {imgSrc
                          ? <img src={imgSrc} alt={e.player_name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</div>}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 14, background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "13px 0" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{e.player_name}</div>
                        <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>{e.team_name}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{e.count.toLocaleString()}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>passes</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                teamPurch.map((e, i) => {
                  const color = teamColor(e.team_name);
                  const logo  = teamLogo(e.team_name);
                  return (
                    <div key={e.team_name} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: i > 0 ? "1px solid var(--border-1)" : "none", paddingRight: 16, overflow: "hidden" }}>
                      <div style={{ width: 3, alignSelf: "stretch", background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#d97706" : color, flexShrink: 0 }} />
                      {/* Mini team pass card (purchases) */}
                      <div style={{ width: 38, height: 50, borderRadius: 7, overflow: "hidden", flexShrink: 0, position: "relative", background: `linear-gradient(155deg,#1a0a33,#2d1060)`, border: `1px solid ${color}55`, boxShadow: `0 2px 8px ${color}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ position: "absolute", width: "80%", height: "70%", borderRadius: "50%", background: `${color}50`, filter: "blur(10px)", zIndex: 0 }} />
                        <img src={logo} alt={e.team_name} style={{ width: "72%", height: "72%", objectFit: "contain", position: "relative", zIndex: 1 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "13px 0" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{e.team_name}</div>
                        <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>Team Pass</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{e.count.toLocaleString()}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginTop: 3 }}>passes</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PassesPageInner() {
  const [token, setToken]             = useState<string | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [authed, setAuthed]           = useState<boolean | null>(null);
  const [data, setData]               = useState<PassesData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>("player");
  const [passesMode, setPassesMode]   = useState<"my" | "global">("my");
  const [teamPickerOpen, setTeamPickerOpen]     = useState(false);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [earningsOpen, setEarningsOpen]         = useState(false);
  const [playerSearch, setPlayerSearch]         = useState("");
  const [pendingPlayer, setPendingPlayer]       = useState<PendingPlayerPass | null>(null);
  const [pendingTeam, setPendingTeam]           = useState<string | null>(null);
  const [purchaseErr, setPurchaseErr]           = useState<string | null>(null);
  const [selectedPass, setSelectedPass]         = useState<PlayerPass | null>(null);
  const [playerSortBy, setPlayerSortBy]         = useState<"recent" | "level">("recent");
  const [leaderboardPass, setLeaderboardPass]   = useState<PlayerPass | null>(null);
  const [confirmStep, setConfirmStep]           = useState(false);
  const [purchaseAnim, setPurchaseAnim]         = useState(false);
  const [boughtPlayer, setBoughtPlayer]         = useState<{ pid: string; name: string; team: string; imgSrc: string; xp: number } | null>(null);
  const [selectedTeamPass, setSelectedTeamPass]       = useState<TeamPass | null>(null);
  const [leaderboardTeamPass, setLeaderboardTeamPass] = useState<TeamPass | null>(null);
  const [ownedPatterns, setOwnedPatterns] = useState<Cosmetic[]>([]);
  const autoClaimFired = useRef(false);
  const searchParams = useSearchParams();

  // Owned "Pass Background" patterns — selectable per-pass via the pattern picker.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: rows } = await supabase
        .from("user_cosmetics")
        .select("cosmetics(*)")
        .eq("user_id", userId);
      const patterns = (rows ?? [])
        .map((r: any) => r.cosmetics as Cosmetic | null)
        .filter((c): c is Cosmetic => !!c && c.slot === "card_back");
      setOwnedPatterns(patterns);
    })();
  }, [userId]);

  // Auto-open player pass modal when navigated from a player profile page
  // e.g. /passes?player=bailey_smith
  useEffect(() => {
    const playerSlug = searchParams.get("player");
    if (!playerSlug) return;
    const p = (playersRaw as any[]).find((x: any) => x.id === playerSlug);
    if (!p) return;
    const pid   = String(p.id ?? "");
    const pname = String(p.name ?? "");
    const team  = String(p.team ?? p.club ?? "");
    const imgSrc = playerPassImgSrc(pname, team);
    setPendingPlayer({ pid, name: pname, team, imgSrc, xp: 0 });
    setPlayerPickerOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-open team pass confirmation when navigated from a team profile page
  // e.g. /passes?team=Adelaide
  useEffect(() => {
    const teamParam = searchParams.get("team");
    if (!teamParam) return;
    const matched = AFL_TEAMS.find(
      (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "") === teamParam.toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (!matched) return;
    setPendingTeam(matched);
    setTeamPickerOpen(true);
    setTab("team");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setAuthed(!!s.session);
      setToken(s.session?.access_token ?? null);
      setUserId(s.session?.user?.id ?? null);
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

  // Apply (or clear, when pattern is null) a background pattern on a single pass.
  const applyPattern = useCallback(async (passType: "player" | "team", passId: string, pattern: string | null) => {
    if (!token) return;
    const res = await fetch("/api/passes/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pass_type: passType, pass_id: passId, pattern }),
    });
    if (!res.ok) return;
    if (passType === "player") {
      setData((d) => d && { ...d, playerPasses: d.playerPasses.map((p) => p.id === passId ? { ...p, pattern } : p) });
      setSelectedPass((p) => p && p.id === passId ? { ...p, pattern } : p);
    } else {
      setData((d) => d && { ...d, teamPasses: d.teamPasses.map((p) => p.id === passId ? { ...p, pattern } : p) });
      setSelectedTeamPass((p) => p && p.id === passId ? { ...p, pattern } : p);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchData(token);
    else if (authed !== null) setLoading(false);
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

  async function handleSetTeam(teamName: string) {
    if (!token) return;
    setTeamPickerOpen(false);
    setPendingTeam(null);
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
    setConfirmStep(false);
    setPurchaseErr(null);
    const snapshot = pendingPlayer;
    const res = await fetch("/api/passes/player", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ player_id: playerId }),
    });
    if (res.ok) {
      setBoughtPlayer(snapshot);
      setPurchaseAnim(true);
      fetchData(token);
      setTimeout(() => {
        setPurchaseAnim(false);
        setBoughtPlayer(null);
        setPlayerPickerOpen(false);
        setPlayerSearch("");
        setPendingPlayer(null);
      }, 2500);
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

  function closePlayerPicker() {
    setPlayerPickerOpen(false);
    setPlayerSearch("");
    setPendingPlayer(null);
    setConfirmStep(false);
    setPurchaseAnim(false);
    setBoughtPlayer(null);
  }

  function closeTeamPicker() {
    setTeamPickerOpen(false);
    setPendingTeam(null);
  }

  const ownedPlayerKeys = new Set((data?.playerPasses ?? []).map((p) => playerPassIdentityKey(p)));
  const pendingPlayerOwned = pendingPlayer
    ? ownedPlayerKeys.has(playerPassIdentityKey({ player_id: pendingPlayer.pid, player_name: pendingPlayer.name, team_name: pendingPlayer.team }))
    : false;
  const filtered = playerSearch.trim().length < 2 ? [] :
    (playersRaw as any[]).filter((p) => String(p.name ?? p.player ?? "").toLowerCase().includes(playerSearch.toLowerCase())).slice(0, 30);

  const coins      = data?.coins ?? 0;
  const passcost   = tab === "player" ? PLAYER_PASS_COST : TEAM_PASS_COST;
  const canGetMore = tab === "player"
    ? (data?.playerPassCount ?? 0) < MAX_PLAYER_PASSES
    : (data?.teamPasses?.length ?? 0) < MAX_TEAM_PASSES;
  const passBalance = data
    ? <span style={passHeaderBalanceStyle}><CoinImg size={16} />{fmtCoins(coins)}</span>
    : <div style={passHeaderSpinnerStyle} />;

  if (authed === false) {
    return (
      <div style={pageStyle}>
        <PageHeader title="Passes" subtitle="Player and team rewards" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 32px", textAlign: "center", gap: 14 }}>
          <div style={{ fontSize: 44 }}>🎫</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "var(--text-1)" }}>Sign in to use Passes</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 260 }}>Earn Aura and Coins from your favourite team and players every round.</div>
          <Link href="/login" style={{ marginTop: 8, display: "inline-block", padding: "12px 28px", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: 999, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Sign In</Link>
        </div>
      </div>
    );
  }

  if (playerPickerOpen) {
    return (
      <div style={pageStyle}>
        <div style={{ ...headerStyle, gap: 12 }}>
          <button onClick={closePlayerPicker} style={passPageBackButtonStyle} aria-label="Back to passes">
            <ArrowLeft size={18} strokeWidth={2.6} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 19, color: "var(--text-1)", lineHeight: 1.05 }}>
                {pendingPlayer ? "2026 Player Pass" : "Player Passes"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 750, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pendingPlayer ? `${pendingPlayer.name} · ${pendingPlayer.team}` : "Choose a player"}
              </div>
            </div>
          </div>
          {data
            ? <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><CoinImg size={16} />{fmtCoins(coins)}</div>
            : <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          }
        </div>
        <PlayerPassPickerPage
          pendingPlayer={pendingPlayer}
          data={data}
          coins={coins}
          pendingPlayerOwned={pendingPlayerOwned}
          playerSearch={playerSearch}
          setPlayerSearch={setPlayerSearch}
          setPendingPlayer={setPendingPlayer}
          addPlayerPass={addPlayerPass}
          filtered={filtered}
          ownedPlayerKeys={ownedPlayerKeys}
          userId={userId}
          onOpenLeaderboard={setLeaderboardPass}
        />
        {leaderboardPass && (
          <PassLeaderboard pass={leaderboardPass} onClose={() => setLeaderboardPass(null)} />
        )}
      </div>
    );
  }

  if (teamPickerOpen) {
    return (
      <div style={pageStyle}>
        <div style={{ ...headerStyle, gap: 12 }}>
          <button onClick={closeTeamPicker} style={passPageBackButtonStyle} aria-label="Back to passes">
            <ArrowLeft size={18} strokeWidth={2.6} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 19, color: "var(--text-1)", lineHeight: 1.05 }}>
                {pendingTeam ? "2026 Team Pass" : "Team Passes"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 750, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pendingTeam ?? "Choose a team"}
              </div>
            </div>
          </div>
          {data
            ? <div style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><CoinImg size={16} />{fmtCoins(coins)}</div>
            : <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          }
        </div>
        <TeamPassPickerPage
          pendingTeam={pendingTeam}
          setPendingTeam={setPendingTeam}
          data={data}
          coins={coins}
          token={token}
          onPurchased={() => token && fetchData(token)}
          onOpenLeaderboard={setLeaderboardTeamPass}
        />
        {leaderboardTeamPass && (
          <TeamPassLeaderboard pass={leaderboardTeamPass} onClose={() => setLeaderboardTeamPass(null)} />
        )}
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <PageHeader
        title="Passes"
        subtitle={passesMode === "global" ? "Global leaderboards" : "Player and team rewards"}
        right={
          data ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {passBalance}
              {passesMode === "my" && (
                <button onClick={() => setEarningsOpen(true)} style={{ padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                  Earnings
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3 }}>
          {(["my", "global"] as const).map(m => (
            <button key={m} onClick={() => setPassesMode(m)} style={{
              padding: "7px 16px", borderRadius: 999, border: "none",
              background: passesMode === m ? "rgba(255,255,255,0.13)" : "transparent",
              color: passesMode === m ? "var(--text-1)" : "var(--text-3)",
              fontWeight: passesMode === m ? 800 : 600, fontSize: 13,
              cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
            }}>
              {m === "my" ? "Passes" : "Global"}
            </button>
          ))}
        </div>
      </div>

      {/* Global view */}
      {passesMode === "global" && <GlobalPassView />}

      {/* My Passes: Tab toggle + Get Passes */}
      {passesMode === "my" && <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
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
            visibility: !loading && canGetMore ? "visible" : "hidden",
            padding: "10px 18px", borderRadius: 999,
            background: "linear-gradient(135deg,#854d0e,#ca8a04)",
            border: "none", color: "#fff", fontWeight: 900, fontSize: 13,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            Get Pass · <CoinImg size={12} /> {fmtCoins(passcost)}
          </button>
      </div>}

      {/* My Passes content */}
      {passesMode === "my" && <>
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
                  <TeamCard pass={pass} pattern={pass.pattern} />
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
                      <PlayerCard pass={pass} pattern={pass.pattern} />
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
      </>}

      {/* Pass detail modal */}
      {selectedPass && (
        <Modal title={selectedPass.player_name} onClose={() => setSelectedPass(null)} centered>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Card preview */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: 180 }}>
                <PlayerCard pass={selectedPass} pattern={selectedPass.pattern} />
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
            {/* Pattern picker */}
            <PatternPicker
              owned={ownedPatterns}
              current={selectedPass.pattern}
              level={getPassLevel(selectedPass.xp ?? 0, PLAYER_PASS_LEVELS)}
              onSelect={(pattern) => applyPattern("player", selectedPass.id, pattern)}
            />
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
            <TeamCard pass={selectedTeamPass} pattern={selectedTeamPass.pattern} />
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
            {/* Pattern picker */}
            <PatternPicker
              owned={ownedPatterns}
              current={selectedTeamPass.pattern}
              level={getPassLevel(selectedTeamPass.xp ?? 0, TEAM_PASS_LEVELS)}
              onSelect={(pattern) => applyPattern("team", selectedTeamPass.id, pattern)}
            />
            <button
              onClick={() => { setLeaderboardTeamPass(selectedTeamPass); setSelectedTeamPass(null); }}
              style={{ width: "100%", padding: "13px 0", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#312e81,#4f46e5)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              🏆 Leaderboard
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


      {/* Player Picker */}
      {playerPickerOpen && (
        <Modal
          centered
          title={pendingPlayer ? "2026 Player Pass" : `Add Player Pass · ${fmtCoins(PLAYER_PASS_COST)} coins`}
          onClose={closePlayerPicker}
        >
          {purchaseAnim && boughtPlayer ? (
            /* ── Success animation ── */
            <>
              <style>{`
                @keyframes passParticleFly {
                  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                  100% { opacity: 0; transform: translate(calc(-50% + var(--fly-x)), calc(-50% + var(--fly-y))) scale(0.15); }
                }
                @keyframes passCardBounce {
                  0%   { opacity: 0; transform: scale(0.35) translateY(40px); }
                  55%  { transform: scale(1.08) translateY(-8px); }
                  78%  { transform: scale(0.97) translateY(2px); }
                  100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes passSuccessText {
                  0%   { opacity: 0; transform: translateY(14px); }
                  100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes passCheckIn {
                  0%   { opacity: 0; transform: scale(0); }
                  65%  { transform: scale(1.22); }
                  100% { opacity: 1; transform: scale(1); }
                }
                @keyframes passGlow {
                  0%, 100% { box-shadow: 0 0 0 6px rgba(74,222,128,0.12), 0 8px 24px rgba(22,163,74,0.3); }
                  50%       { box-shadow: 0 0 0 14px rgba(74,222,128,0.06), 0 8px 32px rgba(22,163,74,0.5); }
                }
              `}</style>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "32px 16px", position: "relative", minHeight: 360 }}>
                {/* Confetti particles */}
                {Array.from({ length: 16 }).map((_, i) => {
                  const angle = (i / 16) * Math.PI * 2;
                  const dist = 85 + (i % 4) * 22;
                  const dx = Math.round(Math.cos(angle) * dist);
                  const dy = Math.round(Math.sin(angle) * dist - 28);
                  const colors = ["#fbbf24","#a78bfa","#60a5fa","#34d399","#f472b6","#fb923c","#e879f9"];
                  return (
                    <div key={i} style={{
                      position: "absolute", top: "36%", left: "50%",
                      width: i % 2 === 0 ? 9 : 6, height: i % 2 === 0 ? 9 : 6,
                      borderRadius: i % 3 === 0 ? "50%" : 3,
                      background: colors[i % colors.length],
                      pointerEvents: "none",
                      "--fly-x": `${dx}px`,
                      "--fly-y": `${dy}px`,
                      animation: `passParticleFly 1.1s ease-out ${i * 0.025}s both`,
                    } as React.CSSProperties} />
                  );
                })}
                {/* Checkmark */}
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  background: "linear-gradient(135deg, #15803d, #4ade80)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, zIndex: 1,
                  animation: "passCheckIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.05s both, passGlow 2s ease-in-out 0.6s infinite",
                }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                {/* Text */}
                <div style={{ textAlign: "center", animation: "passSuccessText 0.4s ease-out 0.25s both", zIndex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Pass Purchased!</div>
                  <div style={{ fontSize: 14, color: "var(--text-3)", marginTop: 5, fontWeight: 600 }}>
                    {boughtPlayer.name} · {boughtPlayer.team}
                  </div>
                </div>
                {/* Card */}
                <div style={{ width: "min(155px, 48vw)", animation: "passCardBounce 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.15s both", zIndex: 1 }}>
                  <PlayerPassCard pass={{ id: "", user_id: "", player_id: boughtPlayer.pid, player_name: boughtPlayer.name, team_name: boughtPlayer.team, active: true, xp: boughtPlayer.xp, serial_number: null, pattern: null, created_at: "" }} />
                </div>
              </div>
            </>
          ) : pendingPlayer ? (
            /* ── Confirmation screen ── */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 16, alignItems: "stretch" }}>
              {/* Card preview */}
              {(() => {
                const pendingPlayerKey = playerPassIdentityKey({
                  player_id: pendingPlayer.pid,
                  player_name: pendingPlayer.name,
                  team_name: pendingPlayer.team,
                });
                const existingPass = data?.playerPasses?.find((p) => playerPassIdentityKey(p) === pendingPlayerKey);
                const previewPass: PlayerPass = existingPass ?? {
                  id: "",
                  user_id: "",
                  player_id: pendingPlayer.pid,
                  player_name: pendingPlayer.name,
                  team_name: pendingPlayer.team,
                  active: true,
                  xp: pendingPlayer.xp,
                  serial_number: null,
                  pattern: null,
                  created_at: "",
                };
                return (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 330, borderRadius: 22, border: "1px solid rgba(255,255,255,0.09)", background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div style={{ width: "min(230px, 72vw)" }}>
                      <PlayerCard pass={previewPass} />
                    </div>
                  </div>
                );
              })()}

              {/* Pass info */}
              <div style={{ background: `linear-gradient(135deg, ${teamColor(pendingPlayer.team)}22, rgba(255,255,255,0.045))`, border: "1px solid rgba(255,255,255,0.09)", borderRadius: 22, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 12, minHeight: 330, boxSizing: "border-box", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.24)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24", flexShrink: 0 }}>
                    <Ticket size={20} strokeWidth={2.6} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 22, color: "var(--text-1)", lineHeight: 1.05 }}>{pendingPlayer.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 750, marginTop: 5 }}>{pendingPlayer.team}</div>
                  </div>
                </div>
                <div style={{ height: 1, background: "var(--border-1)" }} />
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
                  Earn <span style={{ color: "#a78bfa", fontWeight: 800 }}>Aura</span> &amp; <span style={{ color: "#fbbf24", fontWeight: 800 }}>Coins</span> based on {pendingPlayer.name.split(" ")[0]}'s Foopy Rating each game. The pass levels up as you earn XP, increasing your reward multiplier up to <span style={{ color: "#c084fc", fontWeight: 800 }}>7×</span>.
                </div>
                <div style={{ height: 1, background: "var(--border-1)" }} />
                {/* Multipliers preview */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PLAYER_PASS_LEVELS.map((lvl, i) => (
                    <div key={lvl.name} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 999, background: `${lvl.color}18`, border: `1px solid ${lvl.color}40` }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: lvl.color }}>{lvl.name}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>{[1,1.25,1.5,1.75,2,2.5,3,4,5,7][i]}×</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price row */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "rgba(255,255,255,0.045)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.09)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
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

              {!pendingPlayerOwned && coins < PLAYER_PASS_COST && (
                <div style={{ gridColumn: "1 / -1", padding: "12px 14px", borderRadius: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, fontWeight: 800, color: "#f87171", textAlign: "center" }}>
                  Need <CoinImg size={13} /> {fmtCoins(PLAYER_PASS_COST - coins)} more — open packs to earn coins
                </div>
              )}

              {/* Buttons — two-step confirmation */}
              {confirmStep ? (
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ padding: "13px 16px", borderRadius: 14, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>
                    Are you sure?
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setConfirmStep(false)} style={{ flex: 1, padding: "13px 0", borderRadius: 999, border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.05)", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button
                      onClick={() => addPlayerPass(pendingPlayer.pid)}
                      style={{ flex: 2, padding: "13px 0", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#92400e,#d97706,#fbbf24)", color: "#fff", fontWeight: 950, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 14px 34px rgba(217,119,6,0.3), inset 0 1px 0 rgba(255,255,255,0.2)" }}
                    >
                      <CheckCircle size={15} strokeWidth={2.8} /> Confirm Purchase
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                  <button onClick={() => setPendingPlayer(null)} style={{ flex: 1, padding: "13px 0", borderRadius: 999, border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.05)", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    ← Back
                  </button>
                  <button
                    onClick={() => !pendingPlayerOwned && coins >= PLAYER_PASS_COST && setConfirmStep(true)}
                    disabled={pendingPlayerOwned || coins < PLAYER_PASS_COST}
                    style={{ flex: 2, padding: "13px 0", borderRadius: 999, border: pendingPlayerOwned ? "1px solid rgba(255,255,255,0.12)" : "none", background: pendingPlayerOwned ? "rgba(255,255,255,0.08)" : coins >= PLAYER_PASS_COST ? "linear-gradient(135deg,#92400e,#d97706,#fbbf24)" : "rgba(255,255,255,0.08)", color: pendingPlayerOwned ? "var(--text-2)" : coins >= PLAYER_PASS_COST ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: 950, fontSize: 15, cursor: pendingPlayerOwned || coins < PLAYER_PASS_COST ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: !pendingPlayerOwned && coins >= PLAYER_PASS_COST ? "0 14px 34px rgba(217,119,6,0.24), inset 0 1px 0 rgba(255,255,255,0.2)" : "none" }}
                  >
                    {pendingPlayerOwned ? <><CheckCircle size={15} strokeWidth={2.8} />Owned</> : <>Get Pass · <CoinImg size={14} /> {fmtCoins(PLAYER_PASS_COST)}</>}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Search screen ── */
            <>
              <input type="text" placeholder="Search player name…" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} autoFocus
                style={{ width: "100%", padding: "14px 16px", borderRadius: 16, border: "1.5px solid var(--border-2)", background: "rgba(255,255,255,0.055)", color: "var(--text-1)", fontSize: 15, fontWeight: 700, marginBottom: 14, outline: "none", boxSizing: "border-box", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
              />
              {playerSearch.trim().length < 2 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>Type at least 2 characters</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>No players found</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map((p: any, i: number) => {
                    const pid   = String(p.id ?? "");
                    const pname = String(p.name ?? p.player ?? "");
                    const team  = String(p.club ?? p.team ?? "");
                    const owned  = ownedPlayerKeys.has(playerPassIdentityKey({ player_id: pid, player_name: pname, team_name: team }));
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
                            .eq("user_id", userId ?? "")
                            .ilike("player_name", pname.trim());
                          // Fallback: also try by the cardIdForName format of the player id
                          const cardPlayerId = pname.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "");
                          const { data: byId } = await supabase
                            .from("user_cards")
                            .select("rating, duplicate_count")
                            .eq("user_id", userId ?? "")
                            .eq("player_id", cardPlayerId);
                          // Merge and deduplicate — pick whichever query returned rows
                          const cardRows = (byName?.length ? byName : byId) ?? [];
                          const xp = cardRows.reduce(
                            (sum: number, c: any) => sum + (Number(c.rating) || 0) * Math.max(Number(c.duplicate_count) || 1, 1),
                            0
                          );
                          setPendingPlayer({ pid, name: pname, team, imgSrc, xp });
                        }} disabled={owned} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: "1px solid var(--border-2)", background: owned ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.055)", cursor: owned ? "default" : "pointer", opacity: owned ? 0.55 : 1, width: "100%", textAlign: "left", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
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
                          {owned ? <><CheckCircle size={12} strokeWidth={2.8} />Owned</> : <><CoinImg size={12} />{fmtCoins(PLAYER_PASS_COST)}</>}
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

function PlayerPassPickerPage({
  pendingPlayer,
  data,
  coins,
  pendingPlayerOwned,
  playerSearch,
  setPlayerSearch,
  setPendingPlayer,
  addPlayerPass,
  filtered,
  ownedPlayerKeys,
  userId,
  onOpenLeaderboard,
}: {
  pendingPlayer: PendingPlayerPass | null;
  data: PassesData | null;
  coins: number;
  pendingPlayerOwned: boolean;
  playerSearch: string;
  setPlayerSearch: (value: string) => void;
  setPendingPlayer: (value: PendingPlayerPass | null) => void;
  addPlayerPass: (playerId: string) => Promise<void>;
  filtered: any[];
  ownedPlayerKeys: Set<string>;
  userId: string | null;
  onOpenLeaderboard: (pass: PlayerPass) => void;
}) {
  const pendingPlayerId = pendingPlayer?.pid ?? "";
  const [holders, setHolders] = useState<LeaderboardEntry[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [localConfirmStep, setLocalConfirmStep] = useState(false);
  const [localPurchaseAnim, setLocalPurchaseAnim] = useState(false);
  const [localBoughtPlayer, setLocalBoughtPlayer] = useState<typeof pendingPlayer>(null);
  const [localOwned, setLocalOwned] = useState(false);

  function handleBuyPass(pid: string) {
    const snapshot = pendingPlayer;
    setLocalConfirmStep(false);
    setLocalOwned(true);
    setLocalBoughtPlayer(snapshot);
    setLocalPurchaseAnim(true);
    addPlayerPass(pid);
    setTimeout(() => {
      setLocalPurchaseAnim(false);
      setLocalBoughtPlayer(null);
      setPendingPlayer(null);
    }, 2500);
  }

  useEffect(() => {
    let active = true;
    if (!pendingPlayerId) {
      setHolders([]);
      setHoldersLoading(false);
      return () => { active = false; };
    }

    setHoldersLoading(true);
    fetch(`/api/passes/leaderboard?player_id=${encodeURIComponent(pendingPlayerId)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((rows) => {
        if (active) setHolders(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setHolders([]);
      })
      .finally(() => {
        if (active) setHoldersLoading(false);
      });

    return () => { active = false; };
  }, [pendingPlayerId]);

  if (!pendingPlayer) {
    return (
      <div style={{ padding: "16px 16px calc(104px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Search size={17} strokeWidth={2.5} style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search player name..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "14px 16px 14px 42px", borderRadius: 16, border: "1.5px solid var(--border-2)", background: "rgba(255,255,255,0.055)", color: "var(--text-1)", fontSize: 15, fontWeight: 750, outline: "none", boxSizing: "border-box", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
            />
          </div>

          {playerSearch.trim().length < 2 ? (
            <div style={playerPassEmptySearchStyle}>Type at least 2 characters</div>
          ) : filtered.length === 0 ? (
            <div style={playerPassEmptySearchStyle}>No players found</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((p: any, i: number) => {
                const pid   = String(p.id ?? "");
                const pname = String(p.name ?? p.player ?? "");
                const team  = String(p.club ?? p.team ?? "");
                const owned = ownedPlayerKeys.has(playerPassIdentityKey({ player_id: pid, player_name: pname, team_name: team }));
                const imgSrc = playerPassImgSrc(pname, team);
                return (
                  <button
                    key={`${pid}_${i}`}
                    onClick={async () => {
                      if (owned) return;
                      const { data: byName } = await supabase
                        .from("user_cards")
                        .select("rating, duplicate_count")
                        .eq("user_id", userId ?? "")
                        .ilike("player_name", pname.trim());
                      const cardPlayerId = pname.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "");
                      const { data: byId } = await supabase
                        .from("user_cards")
                        .select("rating, duplicate_count")
                        .eq("user_id", userId ?? "")
                        .eq("player_id", cardPlayerId);
                      const cardRows = (byName?.length ? byName : byId) ?? [];
                      const xp = cardRows.reduce(
                        (sum: number, c: any) => sum + (Number(c.rating) || 0) * Math.max(Number(c.duplicate_count) || 1, 1),
                        0
                      );
                      setPendingPlayer({ pid, name: pname, team, imgSrc, xp });
                    }}
                    disabled={owned}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: `1px solid ${owned ? "rgba(167,139,250,0.2)" : "var(--border-2)"}`, background: owned ? "rgba(167,139,250,0.055)" : "rgba(255,255,255,0.055)", cursor: owned ? "default" : "pointer", opacity: owned ? 0.62 : 1, width: "100%", textAlign: "left", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
                  >
                    <div style={{ width: 46, height: 46, borderRadius: 14, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={pname} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>P</div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pname}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 2 }}>{team}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 900, flexShrink: 0, color: owned ? "#a78bfa" : "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}>
                      {owned ? <><CheckCircle size={13} strokeWidth={2.8} />Owned</> : <><CoinImg size={12} />{fmtCoins(PLAYER_PASS_COST)}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const pendingPlayerKey = playerPassIdentityKey({
    player_id: pendingPlayer.pid,
    player_name: pendingPlayer.name,
    team_name: pendingPlayer.team,
  });
  const existingPass = data?.playerPasses?.find((p) => playerPassIdentityKey(p) === pendingPlayerKey);
  const previewPass: PlayerPass = existingPass ?? {
    id: "",
    user_id: "",
    player_id: pendingPlayer.pid,
    player_name: pendingPlayer.name,
    team_name: pendingPlayer.team,
    active: true,
    xp: pendingPlayer.xp,
    serial_number: null,
    pattern: null,
    created_at: "",
  };
  const teamAccent = teamColor(pendingPlayer.team);
  const effectiveOwned = pendingPlayerOwned || localOwned;
  const canBuy = !effectiveOwned && coins >= PLAYER_PASS_COST;
  const holderPreview = [...holders]
    .sort((a, b) => (a.serial_number ?? 999999) - (b.serial_number ?? 999999))
    .slice(0, 50);
  const passFeatures: Array<{ title: string; copy: string; icon: ReactNode; color: string }> = [
    {
      title: "Earn Aura and Coins",
      copy: `Rewards are based on ${pendingPlayer.name.split(" ")[0]}'s Foopy Rating each game.`,
      icon: <Zap size={18} strokeWidth={2.7} />,
      color: "#0ea5e9",
    },
    {
      title: "Level up the pass",
      copy: "Earn XP to climb tiers and boost the reward multiplier.",
      icon: <TrendingUp size={18} strokeWidth={2.7} />,
      color: "#22c55e",
    },
    {
      title: "Collect holder serials",
      copy: "Early holders keep their serial on the pass leaderboard.",
      icon: <Trophy size={18} strokeWidth={2.7} />,
      color: "#f59e0b",
    },
    {
      title: "Compete with holders",
      copy: "Compare XP against everyone holding this player pass.",
      icon: <Users size={18} strokeWidth={2.7} />,
      color: "#a78bfa",
    },
  ];

  if (localPurchaseAnim && localBoughtPlayer) {
    return (
      <div style={{ padding: "18px 14px calc(112px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", position: "relative" }}>
        <style>{`
          @keyframes detailParticleFly {
            0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(calc(-50% + var(--fly-x)), calc(-50% + var(--fly-y))) scale(0.15); }
          }
          @keyframes detailCardBounce {
            0%   { opacity: 0; transform: scale(0.35) translateY(40px); }
            55%  { transform: scale(1.08) translateY(-8px); }
            78%  { transform: scale(0.97) translateY(2px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes detailSuccessText {
            0%   { opacity: 0; transform: translateY(14px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes detailCheckIn {
            0%   { opacity: 0; transform: scale(0); }
            65%  { transform: scale(1.22); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes detailGlow {
            0%, 100% { box-shadow: 0 0 0 6px rgba(74,222,128,0.12), 0 8px 24px rgba(22,163,74,0.3); }
            50%       { box-shadow: 0 0 0 14px rgba(74,222,128,0.06), 0 8px 32px rgba(22,163,74,0.5); }
          }
        `}</style>
        {/* Confetti */}
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2;
          const dist = 85 + (i % 4) * 22;
          const dx = Math.round(Math.cos(angle) * dist);
          const dy = Math.round(Math.sin(angle) * dist - 28);
          const colors = ["#fbbf24","#a78bfa","#60a5fa","#34d399","#f472b6","#fb923c","#e879f9"];
          return (
            <div key={i} style={{
              position: "fixed", top: "40%", left: "50%",
              width: i % 2 === 0 ? 9 : 6, height: i % 2 === 0 ? 9 : 6,
              borderRadius: i % 3 === 0 ? "50%" : 3,
              background: colors[i % colors.length],
              pointerEvents: "none", zIndex: 10,
              "--fly-x": `${dx}px`, "--fly-y": `${dy}px`,
              animation: `detailParticleFly 1.1s ease-out ${i * 0.025}s both`,
            } as React.CSSProperties} />
          );
        })}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #15803d, #4ade80)", display: "flex", alignItems: "center", justifyContent: "center", animation: "detailCheckIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.05s both, detailGlow 2s ease-in-out 0.6s infinite" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ textAlign: "center", animation: "detailSuccessText 0.4s ease-out 0.25s both" }}>
            <div style={{ fontSize: 26, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Pass Purchased!</div>
            <div style={{ fontSize: 15, color: "var(--text-3)", marginTop: 6, fontWeight: 600 }}>
              {localBoughtPlayer.name} · {localBoughtPlayer.team}
            </div>
          </div>
          <div style={{ width: "min(175px, 54vw)", animation: "detailCardBounce 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.15s both" }}>
            <PlayerPassCard pass={{ id: "", user_id: "", player_id: localBoughtPlayer.pid, player_name: localBoughtPlayer.name, team_name: localBoughtPlayer.team, active: true, xp: localBoughtPlayer.xp, serial_number: null, pattern: null, created_at: "" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "18px 14px calc(112px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 24 }}>
        <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: "min(238px, 72vw)", boxShadow: `0 18px 42px ${teamAccent}28` }}>
            <PlayerCard pass={previewPass} />
          </div>

          <div style={{ marginTop: 22, fontSize: 42, lineHeight: 1, fontWeight: 950, color: "var(--text-1)", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <CoinImg size={30} /> {fmtCoins(PLAYER_PASS_COST)}
          </div>

          {localConfirmStep ? (
            /* ── Confirm step ── */
            <div style={{ marginTop: 12, width: "min(300px, 88vw)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>
                Are you sure?
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setLocalConfirmStep(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 999, border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.06)", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={() => handleBuyPass(pendingPlayer.pid)} style={{ flex: 2, padding: "12px 0", borderRadius: 999, border: "none", background: `linear-gradient(135deg, ${teamAccent}, #f59e0b, #fbbf24)`, color: "#fff", fontWeight: 950, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", boxShadow: `0 12px 28px ${teamAccent}28, inset 0 1px 0 rgba(255,255,255,0.2)` }}>
                  <CheckCircle size={16} strokeWidth={2.8} /> Confirm Purchase
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => canBuy && setLocalConfirmStep(true)}
              disabled={!canBuy}
              style={{
                marginTop: 12,
                width: "min(240px, 78vw)",
                padding: "13px 20px",
                borderRadius: 999,
                border: effectiveOwned ? "1px solid rgba(255,255,255,0.12)" : "none",
                background: effectiveOwned ? "rgba(255,255,255,0.08)" : canBuy ? `linear-gradient(135deg, ${teamAccent}, #f59e0b, #fbbf24)` : "rgba(255,255,255,0.08)",
                color: effectiveOwned ? "var(--text-2)" : canBuy ? "#fff" : "rgba(255,255,255,0.32)",
                fontSize: 18,
                fontWeight: 950,
                fontFamily: "inherit",
                cursor: canBuy ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: canBuy ? `0 14px 34px ${teamAccent}30, inset 0 1px 0 rgba(255,255,255,0.24)` : "none",
              }}
            >
              {effectiveOwned ? <><CheckCircle size={18} strokeWidth={2.8} />Owned</> : "Get Pass"}
            </button>
          )}

          {data === null ? (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            </div>
          ) : (
            <>
              <div style={{ marginTop: 10, fontSize: 14, color: coins >= PLAYER_PASS_COST ? "var(--text-3)" : "#f87171", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <CoinImg size={15} />{fmtCoins(coins)} balance
              </div>
              {!effectiveOwned && coins < PLAYER_PASS_COST && (
                <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 999, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, fontWeight: 850, color: "#f87171" }}>
                  Need <CoinImg size={12} /> {fmtCoins(PLAYER_PASS_COST - coins)} more coins
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <h2 style={{ margin: "0 0 16px", textAlign: "center", fontSize: 26, lineHeight: 1.05, fontWeight: 950, color: "var(--text-1)" }}>
            2026 Pass Features
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {passFeatures.map((feature) => (
              <div key={feature.title} style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${feature.color}22`, color: feature.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${feature.color}22` }}>
                  {feature.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 950, color: "var(--text-1)" }}>{feature.title}</div>
                  <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.35, fontWeight: 650, color: "rgba(255,255,255,0.72)" }}>{feature.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
              Holders <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>{holdersLoading ? "" : holders.length}</span>
            </div>
            <button onClick={() => onOpenLeaderboard(previewPass)} style={{ border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.07)", color: "var(--text-1)", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", padding: "6px 14px", borderRadius: 999, flexShrink: 0 }}>
              Leaderboard
            </button>
          </div>

          {holdersLoading ? (
            <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: 13, fontWeight: 800, textAlign: "center" }}>Loading...</div>
          ) : holderPreview.length === 0 ? (
            <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: 13, fontWeight: 800, textAlign: "center" }}>No holders yet — be first!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {holderPreview.map((entry, idx) => {
                const rank = entry.serial_number ?? idx + 1;
                const when = shortRelativeTime(entry.created_at);
                const name = entry.username ? `@${entry.username}` : "Unknown";
                const rankColor = rank === 1 ? "#fbbf24" : rank === 2 ? "#94a3b8" : rank === 3 ? "#cd7c32" : "var(--text-4)";
                return (
                  <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 900, color: rankColor, flexShrink: 0 }}>#{rank}</div>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", fontWeight: 950, fontSize: 13, flexShrink: 0 }}>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        name.slice(1, 2).toUpperCase() || "?"
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{name}</span>
                      {when && <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{when} ago</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

// ── Team Pass Picker Page ─────────────────────────────────────────────────────

function TeamPassPickerPage({
  pendingTeam,
  setPendingTeam,
  data,
  coins,
  token,
  onPurchased,
  onOpenLeaderboard,
}: {
  pendingTeam: string | null;
  setPendingTeam: (value: string | null) => void;
  data: PassesData | null;
  coins: number;
  token: string | null;
  onPurchased: () => void;
  onOpenLeaderboard: (pass: TeamPass) => void;
}) {
  const [holders, setHolders]             = useState<TeamLeaderboardEntry[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [confirmStep, setConfirmStep]     = useState(false);
  const [buying, setBuying]               = useState(false);
  const [purchaseAnim, setPurchaseAnim]   = useState(false);
  const [boughtTeam, setBoughtTeam]       = useState<string | null>(null);
  const [purchaseErr, setPurchaseErr]     = useState<string | null>(null);
  const [localOwned, setLocalOwned]       = useState(false);

  useEffect(() => { setConfirmStep(false); setPurchaseErr(null); setLocalOwned(false); }, [pendingTeam]);

  useEffect(() => {
    let active = true;
    if (!pendingTeam) { setHolders([]); setHoldersLoading(false); return () => { active = false; }; }
    setHoldersLoading(true);
    fetch(`/api/passes/team-leaderboard?team_name=${encodeURIComponent(pendingTeam)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((rows) => { if (active) setHolders(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setHolders([]); })
      .finally(() => { if (active) setHoldersLoading(false); });
    return () => { active = false; };
  }, [pendingTeam]);

  async function handleBuy() {
    if (!token || !pendingTeam) return;
    setBuying(true);
    setConfirmStep(false);
    setPurchaseErr(null);
    try {
      const res = await fetch("/api/passes/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team_name: pendingTeam }),
      });
      if (res.ok) {
        setLocalOwned(true);
        setBoughtTeam(pendingTeam);
        setPurchaseAnim(true);
        onPurchased();
        setTimeout(() => { setPurchaseAnim(false); setBoughtTeam(null); }, 2500);
      } else {
        const body = await res.json().catch(() => ({}));
        setPurchaseErr(body.error ?? "Purchase failed");
      }
    } finally {
      setBuying(false);
    }
  }

  // ── Team list ──
  if (!pendingTeam) {
    return (
      <div style={{ padding: "16px 16px calc(104px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {AFL_TEAMS.map((team) => {
            const active = (data?.teamPasses ?? []).some(p => p.team_name === team);
            const color  = teamColor(team);
            return (
              <button key={team} onClick={() => !active && setPendingTeam(team)} disabled={active} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, border: `1px solid ${active ? color + "70" : "var(--border-2)"}`, background: active ? `${color}18` : "rgba(255,255,255,0.055)", cursor: active ? "default" : "pointer", width: "100%", textAlign: "left", opacity: active ? 0.7 : 1, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: `${color}22`, border: `1px solid ${color}44` }}>
                  <img src={teamLogo(team)} alt={team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", flex: 1 }}>{team}</span>
                {active && <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={13} strokeWidth={2.8} />Owned</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const alreadyOwned = (data?.teamPasses ?? []).some(p => p.team_name === pendingTeam) || localOwned;
  const atMaxPasses  = !alreadyOwned && (data?.teamPasses?.length ?? 0) >= MAX_TEAM_PASSES;
  const canBuy       = !alreadyOwned && !atMaxPasses && coins >= TEAM_PASS_COST;
  const color        = teamColor(pendingTeam);

  const previewPass: TeamPass = (data?.teamPasses ?? []).find(p => p.team_name === pendingTeam) ?? {
    id: "", user_id: "", team_name: pendingTeam, active: true, xp: 0, serial_number: null, pattern: null, created_at: "",
  };

  const holderPreview = [...holders]
    .sort((a, b) => (a.serial_number ?? 999999) - (b.serial_number ?? 999999))
    .slice(0, 50);

  const passFeatures: Array<{ title: string; copy: string; icon: ReactNode; color: string }> = [
    { title: "Earn Aura and Coins",    copy: `Earn rewards every time ${pendingTeam} wins a game.`,                           icon: <Zap size={18} strokeWidth={2.7} />,       color: "#0ea5e9" },
    { title: "Level up the pass",      copy: "Earn XP to climb tiers and boost the reward multiplier.",                       icon: <TrendingUp size={18} strokeWidth={2.7} />, color: "#22c55e" },
    { title: "Collect holder serials", copy: "Early holders keep their serial on the pass leaderboard.",                      icon: <Trophy size={18} strokeWidth={2.7} />,     color: "#f59e0b" },
    { title: "Compete with holders",   copy: `Compare XP against everyone holding the ${pendingTeam} pass.`,                  icon: <Users size={18} strokeWidth={2.7} />,      color: "#a78bfa" },
  ];

  // ── Success animation ──
  if (purchaseAnim && boughtTeam) {
    return (
      <div style={{ padding: "18px 14px calc(112px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", position: "relative" }}>
        <style>{`
          @keyframes teamParticleFly  { 0%{opacity:1;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(calc(-50% + var(--fly-x)),calc(-50% + var(--fly-y))) scale(0.15)} }
          @keyframes teamCardBounce   { 0%{opacity:0;transform:scale(0.35) translateY(40px)} 55%{transform:scale(1.08) translateY(-8px)} 78%{transform:scale(0.97) translateY(2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
          @keyframes teamSuccessText  { 0%{opacity:0;transform:translateY(14px)} 100%{opacity:1;transform:translateY(0)} }
          @keyframes teamCheckIn      { 0%{opacity:0;transform:scale(0)} 65%{transform:scale(1.22)} 100%{opacity:1;transform:scale(1)} }
          @keyframes teamGlow         { 0%,100%{box-shadow:0 0 0 6px rgba(74,222,128,.12),0 8px 24px rgba(22,163,74,.3)} 50%{box-shadow:0 0 0 14px rgba(74,222,128,.06),0 8px 32px rgba(22,163,74,.5)} }
        `}</style>
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2;
          const dist  = 85 + (i % 4) * 22;
          const cols  = ["#fbbf24","#a78bfa","#60a5fa","#34d399","#f472b6","#fb923c","#e879f9"];
          return (
            <div key={i} style={{ position: "fixed", top: "40%", left: "50%", width: i % 2 === 0 ? 9 : 6, height: i % 2 === 0 ? 9 : 6, borderRadius: i % 3 === 0 ? "50%" : 3, background: cols[i % cols.length], pointerEvents: "none", zIndex: 10, "--fly-x": `${Math.round(Math.cos(angle) * dist)}px`, "--fly-y": `${Math.round(Math.sin(angle) * dist - 28)}px`, animation: `teamParticleFly 1.1s ease-out ${i * 0.025}s both` } as React.CSSProperties} />
          );
        })}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#15803d,#4ade80)", display: "flex", alignItems: "center", justifyContent: "center", animation: "teamCheckIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.05s both,teamGlow 2s ease-in-out 0.6s infinite" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div style={{ textAlign: "center", animation: "teamSuccessText 0.4s ease-out 0.25s both" }}>
            <div style={{ fontSize: 26, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Pass Purchased!</div>
            <div style={{ fontSize: 15, color: "var(--text-3)", marginTop: 6, fontWeight: 600 }}>{boughtTeam} · Team Pass</div>
          </div>
          <div style={{ width: "min(175px, 54vw)", animation: "teamCardBounce 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.15s both" }}>
            <TeamPassCard pass={previewPass} />
          </div>
        </div>
      </div>
    );
  }

  // ── Team pass detail page ──
  return (
    <div style={{ padding: "18px 14px calc(112px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 24 }}>

        {/* Card + buy button */}
        <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: "min(238px, 72vw)", boxShadow: `0 18px 42px ${color}28` }}>
            <TeamPassCard pass={previewPass} />
          </div>

          <div style={{ marginTop: 22, fontSize: 42, lineHeight: 1, fontWeight: 950, color: "var(--text-1)", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <CoinImg size={30} /> {fmtCoins(TEAM_PASS_COST)}
          </div>

          {confirmStep ? (
            <div style={{ marginTop: 12, width: "min(300px, 88vw)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>
                Are you sure?
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmStep(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 999, border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.06)", color: "var(--text-2)", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={handleBuy} disabled={buying} style={{ flex: 2, padding: "12px 0", borderRadius: 999, border: "none", background: `linear-gradient(135deg,${color},#f59e0b,#fbbf24)`, color: "#fff", fontWeight: 950, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit", boxShadow: `0 12px 28px ${color}28,inset 0 1px 0 rgba(255,255,255,0.2)`, opacity: buying ? 0.6 : 1 }}>
                  <CheckCircle size={16} strokeWidth={2.8} /> {buying ? "Buying…" : "Confirm Purchase"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => canBuy && setConfirmStep(true)}
              disabled={!canBuy}
              style={{ marginTop: 12, width: "min(240px, 78vw)", padding: "13px 20px", borderRadius: 999, border: alreadyOwned ? "1px solid rgba(255,255,255,0.12)" : "none", background: alreadyOwned ? "rgba(255,255,255,0.08)" : canBuy ? `linear-gradient(135deg,${color},#f59e0b,#fbbf24)` : "rgba(255,255,255,0.08)", color: alreadyOwned ? "var(--text-2)" : canBuy ? "#fff" : "rgba(255,255,255,0.32)", fontSize: 18, fontWeight: 950, fontFamily: "inherit", cursor: canBuy ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: canBuy ? `0 14px 34px ${color}30,inset 0 1px 0 rgba(255,255,255,0.24)` : "none" }}
            >
              {alreadyOwned ? <><CheckCircle size={18} strokeWidth={2.8} />Owned</> : "Get Pass"}
            </button>
          )}

          {purchaseErr && (
            <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 999, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, fontWeight: 850, color: "#f87171" }}>{purchaseErr}</div>
          )}

          {data === null ? (
            <div style={{ marginTop: 10 }}><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /></div>
          ) : (
            <>
              <div style={{ marginTop: 10, fontSize: 14, color: coins >= TEAM_PASS_COST ? "var(--text-3)" : "#f87171", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <CoinImg size={15} />{fmtCoins(coins)} balance
              </div>
              {!alreadyOwned && coins < TEAM_PASS_COST && (
                <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 999, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, fontWeight: 850, color: "#f87171" }}>
                  Need <CoinImg size={12} /> {fmtCoins(TEAM_PASS_COST - coins)} more coins
                </div>
              )}
              {atMaxPasses && (
                <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 999, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, fontWeight: 850, color: "#f87171" }}>
                  Maximum {MAX_TEAM_PASSES} team passes reached
                </div>
              )}
            </>
          )}
        </section>

        {/* Features */}
        <section>
          <h2 style={{ margin: "0 0 16px", textAlign: "center", fontSize: 26, lineHeight: 1.05, fontWeight: 950, color: "var(--text-1)" }}>2026 Pass Features</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {passFeatures.map((f) => (
              <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${f.color}22`, color: f.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${f.color}22` }}>{f.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 950, color: "var(--text-1)" }}>{f.title}</div>
                  <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.35, fontWeight: 650, color: "rgba(255,255,255,0.72)" }}>{f.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Holders */}
        <section style={{ paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
              Holders <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>{holdersLoading ? "" : holders.length}</span>
            </div>
            <button onClick={() => onOpenLeaderboard(previewPass)} style={{ border: "1px solid var(--border-2)", background: "rgba(255,255,255,0.07)", color: "var(--text-1)", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", padding: "6px 14px", borderRadius: 999, flexShrink: 0 }}>
              Leaderboard
            </button>
          </div>
          {holdersLoading ? (
            <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: 13, fontWeight: 800, textAlign: "center" }}>Loading...</div>
          ) : holderPreview.length === 0 ? (
            <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: 13, fontWeight: 800, textAlign: "center" }}>No holders yet — be first!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {holderPreview.map((entry, idx) => {
                const rank = entry.serial_number ?? idx + 1;
                const when = shortRelativeTime(entry.created_at);
                const name = entry.username ? `@${entry.username}` : "Unknown";
                const rankColor = rank === 1 ? "#fbbf24" : rank === 2 ? "#94a3b8" : rank === 3 ? "#cd7c32" : "var(--text-4)";
                return (
                  <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 900, color: rankColor, flexShrink: 0 }}>#{rank}</div>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", fontWeight: 950, fontSize: 13, flexShrink: 0 }}>
                      {entry.avatar_url ? <img src={entry.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : name.slice(1, 2).toUpperCase() || "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{name}</span>
                      {when && <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{when} ago</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

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

export default function PassesPage() {
  return (
    <Suspense>
      <PassesPageInner />
    </Suspense>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "var(--bg)" };

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  height: "calc(56px + env(safe-area-inset-top))",
  marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
  padding: "env(safe-area-inset-top) 16px 0",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--bottom-nav-border)",
};

const passHeaderBalanceStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#fbbf24",
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
};

const passHeaderSpinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  border: "2px solid rgba(255,255,255,.2)",
  borderTopColor: "#fbbf24",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
  flexShrink: 0,
};

const passPageBackButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid var(--border-2)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const passPageIconStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 13,
  background: "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(255,255,255,0.06))",
  border: "1px solid rgba(245,158,11,0.25)",
  color: "#fbbf24",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const playerPassEmptySearchStyle: CSSProperties = {
  textAlign: "center",
  padding: "42px 0",
  color: "var(--text-3)",
  fontSize: 13,
  fontWeight: 750,
};
