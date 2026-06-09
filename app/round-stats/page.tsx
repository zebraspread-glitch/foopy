"use client";

import { Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import matchStatsRaw from "../data/game-stats.json";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";
import playerStatsRaw from "../data/players.json";
import { API_SPORTS_MATCH_IDS } from "../data/apiSportsMatchIds";
import { getGames } from "../lib/gameCache";

type Game = { id: number; round: number; complete?: number };
type PlayerInfo = {
  name?: string; player?: string; club?: string; team?: string;
  image?: string; imagePath?: string; playerImage?: string;
  apiSportsId?: number; eventIds?: unknown; statsIds?: unknown;
};

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", "Adelaide Crows": "/team-logos/crows.png",
  Brisbane: "/team-logos/lions.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Geelong Cats": "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png", "Gold Coast Suns": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png", "GWS Giants": "/team-logos/giants.png",
  "Greater Western Sydney": "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png", "Sydney Swans": "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png", "West Coast Eagles": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_ABBR: Record<string, string> = {
  Adelaide: "ADE", "Adelaide Crows": "ADE",
  Brisbane: "BRI", "Brisbane Lions": "BRI",
  Carlton: "CAR", Collingwood: "COL",
  Essendon: "ESS", Fremantle: "FRE",
  Geelong: "GEE", "Geelong Cats": "GEE",
  "Gold Coast": "GC", "Gold Coast Suns": "GC",
  GWS: "GWS", "GWS Giants": "GWS", "Greater Western Sydney": "GWS",
  Hawthorn: "HAW", Melbourne: "MEL",
  "North Melbourne": "NM", "Port Adelaide": "PA",
  Richmond: "RIC", "St Kilda": "STK",
  Sydney: "SYD", "Sydney Swans": "SYD",
  "West Coast": "WCE", "West Coast Eagles": "WCE",
  "Western Bulldogs": "WB",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Adelaide Crows": "#002b5c",
  Brisbane: "#7a003c", "Brisbane Lions": "#7a003c",
  Carlton: "#031a35", Collingwood: "#555",
  Essendon: "#c8102e", Fremantle: "#4b1979",
  Geelong: "#003b73", "Geelong Cats": "#003b73",
  "Gold Coast": "#e8281a", "Gold Coast Suns": "#e8281a",
  GWS: "#f15a22", "GWS Giants": "#f15a22", "Greater Western Sydney": "#f15a22",
  Hawthorn: "#8b4a24", Melbourne: "#c8102e",
  "North Melbourne": "#0055a4", "Port Adelaide": "#00a9b7",
  Richmond: "#c8a800", "St Kilda": "#ed1b2f",
  Sydney: "#ed171f", "Sydney Swans": "#ed171f",
  "West Coast": "#003087", "West Coast Eagles": "#003087",
  "Western Bulldogs": "#2b6edc",
};

const STAT_TABS: { key: string; label: string; unit: string }[] = [
  { key: "disposals",  label: "Disposals",  unit: "d"  },
  { key: "goals",      label: "Goals",      unit: "g"  },
  { key: "kicks",      label: "Kicks",      unit: "k"  },
  { key: "marks",      label: "Marks",      unit: "m"  },
  { key: "tackles",    label: "Tackles",    unit: "tk" },
  { key: "clearances", label: "Clearances", unit: "cl" },
  { key: "hitouts",    label: "Hitouts",    unit: "ho" },
  { key: "handballs",  label: "Handballs",  unit: "hb" },
  { key: "goalAssists",label: "Assists",    unit: "a"  },
];

function slugName(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clubToFolder(club: string) {
  const map: Record<string, string> = {
    Adelaide: "crows", "Adelaide Crows": "crows",
    Brisbane: "lions", "Brisbane Lions": "lions",
    Carlton: "blues", Collingwood: "magpies",
    Essendon: "bombers", Fremantle: "dockers",
    Geelong: "cats", "Geelong Cats": "cats",
    "Gold Coast": "suns", "Gold Coast Suns": "suns",
    GWS: "giants", "GWS Giants": "giants", "Greater Western Sydney": "giants",
    Hawthorn: "hawks", Melbourne: "demons",
    "North Melbourne": "kangaroos", "Port Adelaide": "power",
    Richmond: "tigers", "St Kilda": "saints",
    Sydney: "swans", "Sydney Swans": "swans",
    "West Coast": "eagles", "West Coast Eagles": "eagles",
    "Western Bulldogs": "bulldogs",
  };
  return map[club] ?? slugName(club);
}

function getPlayerImage(p: PlayerInfo) {
  const club = p.club ?? p.team ?? "";
  const folder = clubToFolder(club);
  const img = p.image ?? p.imagePath ?? p.playerImage ?? `${slugName(p.name ?? p.player ?? "")}.png`;
  if (!folder || !img) return "";
  if (String(img).startsWith("/")) return String(img);
  if (/^https?:\/\//.test(String(img))) return String(img);
  return `${PLAYER_IMG_BASE}/${folder}/${img}`;
}

function idListIncludes(ids: unknown, target: number) {
  if (!Array.isArray(ids)) return false;
  return ids.map(Number).includes(target);
}

function getRawValue(rawPlayer: Record<string, unknown>, stat: string): number {
  const goals = rawPlayer.goals as Record<string, number> | undefined;
  if (stat === "disposals")   return (rawPlayer.disposals as number) ?? 0;
  if (stat === "goals")       return goals?.total ?? 0;
  if (stat === "kicks")       return (rawPlayer.kicks as number) ?? 0;
  if (stat === "marks")       return (rawPlayer.marks as number) ?? 0;
  if (stat === "tackles")     return (rawPlayer.tackles as number) ?? 0;
  if (stat === "clearances")  return (rawPlayer.clearances as number) ?? 0;
  if (stat === "hitouts")     return (rawPlayer.hitouts as number) ?? 0;
  if (stat === "handballs")   return (rawPlayer.handballs as number) ?? 0;
  if (stat === "goalAssists") return goals?.assists ?? 0;
  return 0;
}

function RoundStatsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tabsRef = useRef<HTMLDivElement>(null);

  const [stat, setStat] = useState(
    params.get("stat") ?? (typeof window !== "undefined" ? localStorage.getItem("foopy_default_stat") ?? "disposals" : "disposals")
  );
  const [round, setRound] = useState(Number(params.get("round") ?? 1));
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveGameStats, setLiveGameStats] = useState<Record<string, any>>(matchStatsRaw as any);

  useEffect(() => {
    getGames()
      .then((data) => setGames(data as Game[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/game-stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLiveGameStats(data); })
      .catch(() => {});
  }, []);

  // Sync URL so link is shareable
  useEffect(() => {
    router.replace(`/round-stats?stat=${stat}&round=${round}`, { scroll: false });
  }, [stat, round, router]);

  const availableRounds = useMemo(() => {
    const startedRounds = new Set(
      games.filter((g) => (g.complete ?? 0) > 0).map((g) => g.round)
    );
    return Array.from(startedRounds)
      .filter((r) => r >= 0 && r <= 24)
      .sort((a, b) => a - b);
  }, [games]);

  const apiSportsIds = useMemo(() => {
    const roundGames = games.filter((g) => Number(g.round) === round);
    return new Set(
      roundGames.map((g) => {
        const mapped = (API_SPORTS_MATCH_IDS as Record<string, string>)[String(g.id)];
        return mapped ?? String(g.id);
      })
    );
  }, [games, round]);

  const ranked = useMemo(() => {
    if (games.length === 0) return [];

    type RawEntry = {
      teams?: Array<{ players?: Array<Record<string, unknown>> }>;
    };

    const best = new Map<string, { name: string; team: string; image: string; value: number }>();
    const matchData = liveGameStats as Record<string, RawEntry>;
    const playerData = playerStatsRaw as PlayerInfo[];

    for (const [gameKey, gameEntry] of Object.entries(matchData)) {
      if (!apiSportsIds.has(String(gameKey))) continue;
      for (const teamEntry of gameEntry.teams ?? []) {
        for (const rawPlayer of teamEntry.players ?? []) {
          const apiPlayerId = (rawPlayer.player as { id?: number } | undefined)?.id;
          if (!apiPlayerId) continue;

          const found = playerData.find(
            (p) =>
              p.apiSportsId === apiPlayerId ||
              idListIncludes(p.eventIds, apiPlayerId) ||
              idListIncludes(p.statsIds, apiPlayerId)
          );
          if (!found) continue;

          const name = String(found.name || "").trim();
          if (!name) continue;

          const value = getRawValue(rawPlayer, stat);
          if (value <= 0) continue;

          const team = found.team ?? found.club ?? "";
          const image = getPlayerImage(found);
          const existing = best.get(name);
          if (!existing || value > existing.value)
            best.set(name, { name, team, image, value });
        }
      }
    }

    return Array.from(best.values()).sort((a, b) => b.value - a.value);
  }, [apiSportsIds, stat, games, liveGameStats]);

  const config = STAT_TABS.find((t) => t.key === stat) ?? STAT_TABS[0];
  const maxValue = ranked[0]?.value ?? 1;

  const headerHeight = "calc(52px + env(safe-area-inset-top))";
  const tabsHeight = "38px";
  const totalOffset = `calc(52px + env(safe-area-inset-top) + 38px)`;

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)" }}>

      {/* Top header */}
      <header style={{
        position: "fixed", top: 0, left: "50%", width: "100vw",
        transform: "translateX(-50%)", zIndex: 50,
        background: "var(--bottom-nav-bg)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderBottom: "0.5px solid var(--border-1)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Title row */}
        <div style={{
          height: headerHeight,
          display: "flex", alignItems: "center", gap: 14,
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: 16, paddingRight: 16,
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, color: "var(--text-1)", textDecoration: "none", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>Round Stats</span>
        </div>

        {/* Stat tabs + round dropdown in one row */}
        <div style={{
          display: "flex", alignItems: "center",
          borderBottom: "0.5px solid var(--border-1)",
          padding: "4px 14px 6px", gap: 4,
        }}>
          <div ref={tabsRef} className="no-scrollbar" style={{
            display: "flex", overflowX: "auto", gap: 4, flex: 1,
          }}>
            {STAT_TABS.map((tab) => {
              const active = tab.key === stat;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStat(tab.key)}
                  style={{
                    flex: "0 0 auto", border: "none", cursor: "pointer",
                    padding: "4px 12px", borderRadius: 999,
                    background: active ? "var(--text-1)" : "transparent",
                    color: active ? "var(--bg)" : "var(--text-3)",
                    fontSize: 13, fontWeight: active ? 800 : 600,
                    whiteSpace: "nowrap", transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {availableRounds.length > 0 && (
            <select
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              style={{
                flexShrink: 0, width: "auto", padding: "4px 24px 4px 9px",
                borderRadius: 8, border: "1px solid var(--border-1)",
                background: "var(--surface-1)", color: "var(--text-1)",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                appearance: "none", WebkitAppearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 7px center",
              }}
            >
              {availableRounds.map((r) => (
                <option key={r} value={r}>{r === 0 ? "Opening" : `Rd ${r}`}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div style={{ height: totalOffset }} />

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "12px 12px calc(90px + env(safe-area-inset-bottom))" }}>
        {loading && (
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, padding: "48px 0", textAlign: "center" }}>
            Loading…
          </div>
        )}

        {!loading && ranked.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, padding: "48px 0", textAlign: "center" }}>
            No data for Round {round}.
          </div>
        )}

        {!loading && ranked.map((player, i) => {
          const logo = TEAM_LOGOS[player.team] ?? "";
          const abbr = TEAM_ABBR[player.team] ?? player.team.slice(0, 3).toUpperCase();
          const pct = (player.value / maxValue) * 100;
          const isTop3 = i < 3;

          return (
            <div
              key={player.name}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 14,
                background: isTop3 ? "var(--surface-1)" : "transparent",
                border: isTop3 ? "1px solid var(--border-1)" : "1px solid transparent",
                marginBottom: 4,
              }}
            >
              <span style={{
                width: 24, textAlign: "right", flexShrink: 0,
                fontSize: 13, fontWeight: 900,
                color: isTop3 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
              }}>
                {i + 1}
              </span>

              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: TEAM_COLORS[player.team] ?? "#1e2438",
                  overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.1)",
                }}>
                  <img
                    src={player.image} alt={player.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                {logo && (
                  <img src={logo} alt="" style={{
                    position: "absolute", right: -3, bottom: -3,
                    width: 16, height: 16, borderRadius: "50%",
                    border: "1.5px solid var(--bg)", background: "var(--bg)", objectFit: "contain",
                  }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {player.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>{abbr}</span>
                  <div style={{ flex: 1, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: TEAM_COLORS[player.team] ?? "#3b82f6" }} />
                  </div>
                </div>
              </div>

              <span style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)", flexShrink: 0, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {player.value}
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, marginLeft: 2 }}>{config.unit}</span>
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

export default function RoundStatsPage() {
  return (
    <Suspense>
      <RoundStatsInner />
    </Suspense>
  );
}
