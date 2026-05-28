"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { getPassLevel, PLAYER_PASS_LEVELS, type PlayerPass } from "@/app/lib/passes";

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows",
  Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues", Collingwood: "magpies", Essendon: "bombers",
  Fremantle: "dockers", GWS: "giants", "GWS Giants": "giants",
  Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns",
  Hawthorn: "hawks", Melbourne: "demons",
  "North Melbourne": "kangaroos", "Port Adelaide": "power",
  Richmond: "tigers", "St Kilda": "saints",
  Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
};

function playerImgSrc(playerName: string, teamName: string): string {
  const folder = TEAM_FOLDER[teamName] ?? teamName.toLowerCase().replace(/[^a-z]/g, "");
  const slug   = playerName.toLowerCase().replace(/[^a-z]/g, "");
  if (!folder || !slug) return "";
  return `/players/${folder}/${slug}.png`;
}

type Entry = {
  id: string; user_id: string; serial_number: number | null;
  xp: number; created_at: string; username: string | null; avatar_url: string | null;
};

export default function PassLeaderboard({ pass, onClose }: { pass: PlayerPass; onClose: () => void }) {
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
  const imgSrc = playerImgSrc(pass.player_name, pass.team_name);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 20px 14px", borderBottom: "1px solid var(--border-2)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 20 }}>
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
              const level     = getPassLevel(entry.xp ?? 0, PLAYER_PASS_LEVELS);
              const isMe      = entry.user_id === myId;
              const serial    = entry.serial_number;
              const rankLabel = serial != null ? `#${serial}` : `#${idx + 1}`;
              return (
                <div key={entry.id} onClick={() => entry.username && router.push(`/album/${entry.username}`)} style={{
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  background: level.gradient,
                  border: `1.5px solid ${isMe ? level.color + "99" : level.color + "55"}`,
                  boxShadow: isMe ? `0 4px 24px ${level.color}44` : `0 4px 24px ${level.color}22`,
                  aspectRatio: "3/4", display: "flex", flexDirection: "column",
                  cursor: entry.username ? "pointer" : "default",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
                  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>{level.name.toUpperCase()}</div>
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, fontSize: 8, fontWeight: 900, color: "#fff", letterSpacing: "0.06em" }}>{rankLabel}</div>
                  <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "rgba(0,0,0,0.2)" }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={pass.player_name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
                    }
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(to bottom,transparent,${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#0a0a14"})` }} />
                  </div>
                  <div style={{ padding: "8px 10px 10px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {entry.username ? `@${entry.username}` : "Unknown"}
                      </div>
                      {isMe && <span style={{ fontSize: 8, fontWeight: 900, color: level.color, flexShrink: 0, marginLeft: 4 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
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
