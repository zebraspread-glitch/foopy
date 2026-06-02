"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
import { getPassLevel, xpProgressLabel, TEAM_PASS_LEVELS, type TeamPass } from "@/app/lib/passes";

const TEAM_LOGOS: Record<string, string> = {
  "Adelaide Crows": "/team-logos/crows.png", Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png", Brisbane: "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  "Geelong Cats": "/team-logos/cats.png", Geelong: "/team-logos/cats.png",
  "Gold Coast Suns": "/team-logos/suns.png", "Gold Coast": "/team-logos/suns.png",
  "GWS Giants": "/team-logos/giants.png", GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
  "Sydney Swans": "/team-logos/swans.png", Sydney: "/team-logos/swans.png",
  "West Coast Eagles": "/team-logos/eagles.png", "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_COLORS: Record<string, string> = {
  "Adelaide Crows": "#002b5c", Adelaide: "#002b5c",
  "Brisbane Lions": "#a50034", Brisbane: "#a50034",
  Carlton: "#031a35", Collingwood: "#1a1a1a", Essendon: "#ef4444",
  Fremantle: "#7c3aed", "Geelong Cats": "#1e3a8a", Geelong: "#1e3a8a",
  "Gold Coast Suns": "#ef4444", "Gold Coast": "#ef4444",
  "GWS Giants": "#f97316", GWS: "#f97316",
  Hawthorn: "#78350f", Melbourne: "#1e40af",
  "North Melbourne": "#1e3a8a", "Port Adelaide": "#1e293b",
  Richmond: "#f59e0b", "St Kilda": "#dc2626",
  "Sydney Swans": "#dc2626", Sydney: "#dc2626",
  "West Coast Eagles": "#1d4ed8", "West Coast": "#1d4ed8",
  "Western Bulldogs": "#1e40af",
};

const teamLogo  = (n: string) => TEAM_LOGOS[n]  ?? "/team-logos/default.png";
const teamColor = (n: string) => TEAM_COLORS[n] ?? "#6d28d9";

type Entry = {
  id: string; user_id: string; team_name: string; serial_number: number | null;
  xp: number; created_at: string; username: string | null; avatar_url: string | null; verified?: boolean;
};

export default function TeamPassLeaderboard({ pass, onClose }: { pass: TeamPass; onClose: () => void }) {
  const router = useRouter();
  const [sort, setSort]           = useState<"first" | "level">("first");
  const [entries, setEntries]     = useState<Entry[]>([]);
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
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 20 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: 0, marginRight: 16 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)" }}>Leaderboard</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 1 }}>{pass.team_name} · Team Pass</div>
        </div>
        <img src={teamLogo(pass.team_name)} alt={pass.team_name}
          style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border-3)", background: teamColor(pass.team_name), flexShrink: 0 }} />
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", padding: "16px 16px calc(100px + env(safe-area-inset-bottom))" }}>
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
              const level     = getPassLevel(entry.xp ?? 0, TEAM_PASS_LEVELS);
              const isMe      = entry.user_id === myId;
              const serial    = entry.serial_number;
              const rankLabel = serial != null ? `#${serial}` : `#${idx + 1}`;
              const color     = teamColor(entry.team_name);
              return (
                <div key={entry.id} onClick={() => entry.username && router.push(`/album/${entry.username}`)} style={{
                  borderRadius: 20, overflow: "hidden", position: "relative",
                  background: level.gradient,
                  border: `1.5px solid ${isMe ? level.color + "99" : level.color + "55"}`,
                  boxShadow: isMe ? `0 6px 28px ${level.color}44` : `0 4px 24px ${level.color}22`,
                  aspectRatio: "3/4", display: "flex", flexDirection: "column",
                  cursor: entry.username ? "pointer" : "default",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  <div style={{ position: "absolute", top: 10, left: 10, zIndex: 4, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999 }}>{level.name.toUpperCase()}</div>
                  <div style={{ position: "absolute", top: 10, right: 10, zIndex: 4, fontSize: 8, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>{rankLabel}</div>
                  <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <div style={{ position: "absolute", width: "70%", height: "70%", borderRadius: "50%", background: `${color}40`, filter: "blur(32px)" }} />
                    <div style={{ width: 110, height: 110, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 1 }}>
                      <img src={teamLogo(entry.team_name)} alt={entry.team_name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
                  </div>
                  <div style={{ padding: "10px 12px 14px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 1, gap: 4 }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "#fff", display: "flex", alignItems: "center", gap: 3, overflow: "hidden", flex: 1, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.username ? `@${entry.username}` : "Unknown"}</span>
                        {entry.verified && <VerifiedBadge size={11} />}
                      </div>
                      {isMe && <span style={{ fontSize: 8, fontWeight: 900, color: level.color, flexShrink: 0 }}>YOU</span>}
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
  );
}
