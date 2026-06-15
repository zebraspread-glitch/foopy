"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import rawStats from "@/app/data/player-season-stats.json";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";
import { StatsTableSkeleton } from "@/app/components/Skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerStat = {
  id: string; name: string; team: string; apiSportsId: number;
  photoUrl?: string | null; jerseyNumber?: number | null; position?: string | null;
  games: number; goals: number; goalAssists: number; behinds: number;
  disposals: number; kicks: number; handballs: number; marks: number;
  tackles: number; hitouts: number; clearances: number; goalAvg: number;
  totalDisposals: number; totalKicks: number; totalHandballs: number;
  totalMarks: number; totalTackles: number; totalHitouts: number;
  totalClearances: number; freesFor: number; freesAgainst: number;
  fetchedAt?: string;
};

type StatKey =
  | "disposals" | "goals" | "kicks" | "marks"
  | "tackles" | "clearances" | "hitouts" | "handballs" | "goalAssists";

// ── Lookups ───────────────────────────────────────────────────────────────────

const CARD_IMG: Record<string, string> = {};
const POSITION_LOOKUP: Record<string, string> = {};
for (const cp of CARD_PLAYERS) {
  CARD_IMG[cp.id] = `${PLAYER_IMG_BASE}/${cp.folder}/${cp.id}.png`;
  POSITION_LOOKUP[cp.id] = cp.position;
}

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", Brisbane: "lions", Carlton: "blues",
  Collingwood: "magpies", Essendon: "bombers", Fremantle: "dockers",
  Geelong: "cats", "Gold Coast": "suns", GWS: "giants",
  Hawthorn: "hawks", Melbourne: "demons", "North Melbourne": "kangaroos",
  "Port Adelaide": "power", Richmond: "tigers", "St Kilda": "saints",
  Sydney: "swans", "West Coast": "eagles", "Western Bulldogs": "bulldogs",
};

const CARD_ID_OVERRIDES: Record<string, string> = {
  thomaslynch: "tomlynch", matthewrowell: "mattrowell", connornash: "conornash",
  lachlanschultz: "lachieschultz", joshuarachele: "joshrachele", oliverwines: "olliewines",
  lachlanjones: "lachiejones", samuelwicks: "samwicks", callummbrown: "callumbrown",
  lachlanash: "lachieash", jacksonmacrae: "jackmacrae", mitchellgeorgiades: "mitchgeorgiades",
  bradleyclose: "bradclose", joshuagibcus: "joshgibcus", roberthansenjr: "roberthansen",
  lachlansullivan: "lachiesullivan", kaylegerreyn: "kaylegerryn", bodieryan: "brodieryan",
};

function localImg(statsId: string, team: string): string | null {
  const raw = statsId.replace(/_/g, "");
  const cardId = CARD_ID_OVERRIDES[raw] ?? raw;
  if (CARD_IMG[cardId]) return CARD_IMG[cardId];
  const folder = TEAM_FOLDER[team];
  return folder ? `${PLAYER_IMG_BASE}/${folder}/${cardId}.png` : null;
}

const TEAM_LOGO: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", Brisbane: "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png", Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png", "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png", Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png", Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png", "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_COLOR: Record<string, string> = {
  Adelaide: "#c8102e", Brisbane: "#7a003c", Carlton: "#0b3b75",
  Collingwood: "#777", Essendon: "#cc1020", Fremantle: "#4b1979",
  Geelong: "#003b73", "Gold Coast": "#e8281a", GWS: "#f15a22",
  Hawthorn: "#6b3310", Melbourne: "#031b4e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#007b8a", Richmond: "#c8a800",
  "St Kilda": "#cc1122", Sydney: "#cc1122", "West Coast": "#003087",
  "Western Bulldogs": "#1a5fd4",
};

const ALL_TEAMS = [
  "Adelaide","Brisbane","Carlton","Collingwood","Essendon","Fremantle",
  "Geelong","Gold Coast","GWS","Hawthorn","Melbourne","North Melbourne",
  "Port Adelaide","Richmond","St Kilda","Sydney","West Coast","Western Bulldogs",
];

const CATEGORIES: { key: StatKey; label: string; unit: "avg" | "tot"; sub: string }[] = [
  { key: "disposals",   label: "Disposals",  unit: "avg", sub: "per game" },
  { key: "goals",       label: "Goals",      unit: "tot", sub: "this season" },
  { key: "kicks",       label: "Kicks",      unit: "avg", sub: "per game" },
  { key: "marks",       label: "Marks",      unit: "avg", sub: "per game" },
  { key: "tackles",     label: "Tackles",    unit: "avg", sub: "per game" },
  { key: "clearances",  label: "Clearances", unit: "avg", sub: "per game" },
  { key: "hitouts",     label: "Hitouts",    unit: "avg", sub: "per game" },
  { key: "handballs",   label: "Handballs",  unit: "avg", sub: "per game" },
  { key: "goalAssists", label: "Assists",    unit: "tot", sub: "this season" },
];

const RANK_COLOR = ["#f5c842", "#b0b8c1", "#cd7f4a"];

const AVG_TO_TOTAL: Partial<Record<StatKey, keyof PlayerStat>> = {
  disposals: "totalDisposals", kicks: "totalKicks", marks: "totalMarks",
  tackles: "totalTackles", clearances: "totalClearances",
  hitouts: "totalHitouts", handballs: "totalHandballs",
};

function getDisplayVal(player: PlayerStat, cat: StatKey, catUnit: "avg" | "tot", mode: "avg" | "total"): number {
  if (mode === "total") {
    const totalKey = AVG_TO_TOTAL[cat];
    return totalKey != null ? (player[totalKey] as number) : (player[cat] as number);
  }
  if (catUnit === "tot") return player.games > 0 ? (player[cat] as number) / player.games : 0;
  return player[cat] as number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: number, unit: "avg" | "tot") {
  return unit === "avg" ? val.toFixed(1) : String(val);
}

function fmtCompare(val: number, key: StatKey) {
  const cat = CATEGORIES.find(c => c.key === key)!;
  return cat.unit === "avg" ? val.toFixed(1) : Math.round(val).toString();
}

function shortName(name: string) {
  const parts = name.split(" ");
  if (parts.length <= 1) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function playerSubtitle(player: PlayerStat): string {
  const cardId = player.id.replace(/_/g, "");
  const pos = player.position ?? POSITION_LOOKUP[cardId] ?? null;
  const num = player.jerseyNumber ?? null;
  if (pos && num != null) return `${pos} · #${num}`;
  if (pos) return pos;
  if (num != null) return `${player.team} · #${num}`;
  return player.team;
}

function paginate(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | "…")[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(0);
  if (current > 3) pages.push("…");
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) add(i);
  if (current < total - 4) pages.push("…");
  add(total - 1);
  return pages;
}

// ── PlayerAvatar ──────────────────────────────────────────────────────────────

function PlayerAvatar({
  statsId, photoUrl, name, team, size, radius = "50%",
}: {
  statsId: string; photoUrl?: string | null; name: string;
  team: string; size: number; radius?: string;
}) {
  const color = TEAM_COLOR[team] ?? "#1e293b";
  const localSrc = localImg(statsId, team);
  const [apiErr, setApiErr] = useState(false);
  const [localErr, setLocalErr] = useState(false);
  useEffect(() => { setApiErr(false); setLocalErr(false); }, [statsId]);

  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: radius,
    objectFit: "cover", objectPosition: "top center", display: "block",
  };
  if (photoUrl && !apiErr)
    return <img src={photoUrl} alt={name} onError={() => setApiErr(true)} style={style} />;
  if (localSrc && !localErr)
    return <img src={localSrc} alt={name} onError={() => setLocalErr(true)} style={style} />;

  const ini = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${color}cc 0%, ${color}44 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.3, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em",
    }}>
      {ini}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const router = useRouter();
  const [cat, setCat]           = useState<StatKey>("disposals");
  const [team, setTeam]         = useState("All");
  const [mode, setMode]         = useState<"avg" | "total">("avg");
  const [showPicker, setShowPicker] = useState(false);
  const [page, setPage]         = useState(0);
  const [mounted, setMounted]   = useState(false);
  const [liveStats, setLiveStats] = useState<PlayerStat[] | null>(null);
  const PAGE_SIZE = 25;

  useEffect(() => { setMounted(true); }, []);

  // Fetch fresh season stats from the dynamic endpoint on mount
  useEffect(() => {
    fetch("/api/player-season-stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setLiveStats(data); })
      .catch(() => {});
  }, []);

  // Use live API data when available, fall back to static JSON while loading
  const players  = (liveStats ?? rawStats) as PlayerStat[];
  const catMeta  = CATEGORIES.find(c => c.key === cat)!;
  const displayUnit: "avg" | "tot" = mode === "total" ? "tot" : "avg";

  const sorted = useMemo(() => {
    let list = players.filter(p => p.games > 0);
    if (team !== "All") list = list.filter(p => p.team === team);
    return [...list].sort((a, b) => getDisplayVal(b, cat, catMeta.unit, mode) - getDisplayVal(a, cat, catMeta.unit, mode));
  }, [players, cat, team, mode]);

  useEffect(() => { setPage(0); }, [cat, team, mode]);

  const updatedAt = useMemo(() => {
    const dates = players.map(p => p.fetchedAt).filter(Boolean) as string[];
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map(d => +new Date(d))));
  }, [players]);

  const isEmpty    = players.length === 0;
  const [p1, p2, p3] = sorted;
  const topVal     = p1 ? getDisplayVal(p1, cat, catMeta.unit, mode) : 1;
  const allRest    = sorted.slice(3);
  const totalPages = Math.ceil(allRest.length / PAGE_SIZE);
  const rest       = allRest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function goPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <style>{`
        .s-tab   { -webkit-tap-highlight-color: transparent; transition: color .15s; }
        .s-tab:active { opacity: .55; }
        .s-row   { transition: background .12s; }
        .s-row:active { background: var(--border-1) !important; }
        .s-btn   { -webkit-tap-highlight-color: transparent; }
        .s-btn:active { opacity: .65; }
        .s-pg    { -webkit-tap-highlight-color: transparent; transition: background .12s, color .12s; }
        .s-pg:active { opacity: .7; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <main style={{
        minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
      }}>

        {/* ── Header ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "var(--bottom-nav-bg)", backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--border-1)",
          padding: "env(safe-area-inset-top) 16px 0",
          height: "calc(52px + env(safe-area-inset-top))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "baseline", gap: 8, pointerEvents: "none", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-1)" }}>
              Player Stats
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              AFL 2026
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            {/* Team filter */}
            <button
              className="s-btn"
              onClick={() => setShowPicker(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: team !== "All" ? `${TEAM_COLOR[team]}20` : "var(--border-1)",
                border: team !== "All" ? `1px solid ${TEAM_COLOR[team]}50` : "1px solid var(--border-2)",
                borderRadius: 10, padding: "6px 10px 6px 8px",
                color: team !== "All" ? "var(--text-1)" : "var(--text-3)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {team !== "All" && TEAM_LOGO[team]
                ? <img src={TEAM_LOGO[team]} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
              }
              {team === "All" ? "All Teams" : team}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {/* Compare link */}
            <button
              className="s-btn"
              onClick={() => router.push("/compare")}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)",
                borderRadius: 10, padding: "6px 10px",
                color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Compare
            </button>
          </div>
        </header>

        {/* ── Tabs ── */}
        <div style={{
          overflowX: "auto", scrollbarWidth: "none", display: "flex",
          background: "var(--bottom-nav-bg)",
          borderBottom: "1px solid var(--border-1)",
          position: "sticky", top: `calc(52px + env(safe-area-inset-top))`, zIndex: 49,
        }}>
          {CATEGORIES.map(c => {
            const active = cat === c.key;
            return (
              <button key={c.key} className="s-tab" onClick={() => setCat(c.key)} style={{
                flexShrink: 0, padding: "12px 15px 10px",
                background: "none", border: "none",
                borderBottom: active ? "2px solid var(--text-1)" : "2px solid transparent",
                color: active ? "var(--text-1)" : "var(--text-3)",
                fontSize: 13, fontWeight: active ? 700 : 500,
                cursor: "pointer", whiteSpace: "nowrap", letterSpacing: active ? "-0.02em" : "0",
              }}>
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <>
            {!mounted && (
                <StatsTableSkeleton rows={10} />
              )}
              {mounted && isEmpty && (
                <div style={{ padding: "80px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>No data yet</div>
                  <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, marginBottom: 20 }}>Run the fetch script to pull 2026 stats</div>
                  <code style={{ display: "inline-block", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#22c55e" }}>
                    npm run fetch:stats
                  </code>
                </div>
              )}
              {mounted && !isEmpty && sorted.length === 0 && (
                <div style={{ padding: "80px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No players for this team</div>
              )}
              {mounted && !isEmpty && sorted.length > 0 && (
                <>
                  {/* Podium top 3 */}
                  <div style={{ padding: "16px 12px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingLeft: 2 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        Top 3 · {catMeta.label}
                      </div>
                      <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: 8, padding: 2 }}>
                        {(["avg", "total"] as const).map(m => (
                          <button key={m} className="s-btn" onClick={() => setMode(m)} style={{
                            padding: "4px 11px", borderRadius: 6,
                            background: mode === m ? "var(--border-3)" : "transparent",
                            border: "none", color: mode === m ? "var(--text-1)" : "var(--text-3)",
                            fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
                          }}>
                            {m === "avg" ? "Avg" : "Total"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      {[p1, p2, p3].map((p, colIdx) => {
                        if (!p) return <div key={colIdx} style={{ flex: 1 }} />;
                        const rank = colIdx + 1;
                        const val  = getDisplayVal(p, cat, catMeta.unit, mode);
                        const color = TEAM_COLOR[p.team] ?? "#1e293b";
                        const logo  = TEAM_LOGO[p.team];
                        const rc    = RANK_COLOR[rank - 1];
                        const isFirst = rank === 1;
                        const photoH  = isFirst ? 180 : 140;
                        return (
                          <div key={p.apiSportsId} onClick={() => router.push(`/player/${p.id}`)} style={{
                            flex: isFirst ? 1.1 : 1, borderRadius: 16, overflow: "hidden",
                            background: "var(--surface-1)", cursor: "pointer",
                            border: isFirst ? `1px solid ${rc}40` : "1px solid var(--border-1)",
                            display: "flex", flexDirection: "column",
                            boxShadow: isFirst ? `0 8px 32px ${color}22` : "none",
                          }}>
                            <div style={{ height: photoH, overflow: "hidden", position: "relative", background: `linear-gradient(180deg, ${color}28 0%, ${color}10 100%)`, flexShrink: 0 }}>
                              <PlayerAvatar statsId={p.id} photoUrl={p.photoUrl} name={p.name} team={p.team} size={220} radius="0" />
                              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 55%, var(--surface-1) 100%)" }} />
                              <div style={{ position: "absolute", top: 8, left: 8, fontSize: 9, fontWeight: 800, color: isFirst ? "var(--bg)" : "var(--text-1)", background: isFirst ? rc : "rgba(0,0,0,0.55)", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.05em" }}>
                                #{rank}
                              </div>
                              {logo && <img src={logo} alt="" style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, objectFit: "contain", opacity: 0.4 }} />}
                            </div>
                            <div style={{ padding: "8px 10px 12px" }}>
                              <div style={{ fontSize: isFirst ? 30 : 24, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.05em", lineHeight: 1, marginBottom: 5 }}>
                                {fmt(val, displayUnit)}
                              </div>
                              <div style={{ fontSize: isFirst ? 12 : 11, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.01em", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {shortName(p.name)}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>{playerSubtitle(p)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Leaderboard */}
                  {allRest.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px 8px" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.09em" }}>RANKINGS</span>
                        <span style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600 }}>{mode === "avg" ? "AVG / GAME" : "SEASON TOTAL"}</span>
                      </div>
                      {rest.map((player, idx) => {
                        const rank  = page * PAGE_SIZE + idx + 4;
                        const val   = getDisplayVal(player, cat, catMeta.unit, mode);
                        const color = TEAM_COLOR[player.team] ?? "#334155";
                        const logo  = TEAM_LOGO[player.team];
                        const pct   = topVal > 0 ? Math.max(4, (val / topVal) * 100) : 0;
                        return (
                          <div key={player.apiSportsId} className="s-row" onClick={() => router.push(`/player/${player.id}`)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 18px", borderTop: "1px solid var(--border-1)", cursor: "pointer" }}>
                            <div style={{ width: 24, flexShrink: 0, textAlign: "right", fontSize: 11, fontWeight: 700, color: rank <= 10 ? "var(--text-3)" : "var(--text-4)" }}>{rank}</div>
                            <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "50%", overflow: "hidden", background: `${color}18` }}>
                              <PlayerAvatar statsId={player.id} photoUrl={player.photoUrl} name={player.name} team={player.team} size={42} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                                {logo && <img src={logo} alt="" style={{ width: 10, height: 10, objectFit: "contain", opacity: 0.4 }} />}
                                <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 500 }}>{playerSubtitle(player)}</span>
                              </div>
                              <div style={{ height: 2, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: `${color}99` }} />
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, minWidth: 40, textAlign: "right", fontSize: 19, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.04em", lineHeight: 1 }}>
                              {fmt(val, displayUnit)}
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "20px 18px 16px", flexWrap: "wrap" }}>
                          <button className="s-pg" onClick={() => goPage(Math.max(0, page - 1))} disabled={page === 0} style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: page === 0 ? "var(--text-4)" : "var(--text-2)", cursor: page === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                          </button>
                          {paginate(page, totalPages).map((pg, i) =>
                            pg === "…" ? (
                              <span key={`e${i}`} style={{ color: "var(--text-3)", fontSize: 13, padding: "0 2px" }}>…</span>
                            ) : (
                              <button key={pg} className="s-pg" onClick={() => goPage(pg as number)} style={{ width: 34, height: 34, borderRadius: 10, background: pg === page ? "var(--text-1)" : "var(--border-1)", border: pg === page ? "none" : "1px solid var(--border-2)", color: pg === page ? "var(--bg)" : "var(--text-2)", fontWeight: pg === page ? 800 : 500, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {(pg as number) + 1}
                              </button>
                            )
                          )}
                          <button className="s-pg" onClick={() => goPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: page >= totalPages - 1 ? "var(--text-4)" : "var(--text-2)", cursor: page >= totalPages - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                          </button>
                        </div>
                      )}

                      {updatedAt && (
                        <div style={{ textAlign: "center", padding: "4px 18px 20px", fontSize: 10, color: "var(--text-4)", fontWeight: 600, letterSpacing: "0.04em" }}>
                          Updated {updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
          </>
        </div>

        {/* ── Team picker popup ── */}
        {showPicker && (
          <>
            <div onClick={() => setShowPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 101, width: "min(340px, 88vw)", maxHeight: "78dvh", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px 13px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Filter by Team</span>
                <button onClick={() => setShowPicker(false)} style={{ background: "var(--surface-3)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {["All", ...ALL_TEAMS].map(t => {
                  const active = team === t;
                  const tc = t !== "All" ? TEAM_COLOR[t] : null;
                  return (
                    <button key={t} className="s-btn" onClick={() => { setTeam(t); setShowPicker(false); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 18px", background: active ? "var(--border-1)" : "none", border: "none", borderBottom: "1px solid var(--border-1)", color: active ? "var(--text-1)" : "var(--text-2)", fontSize: 14, fontWeight: active ? 700 : 400, cursor: "pointer", textAlign: "left" }}>
                      {t !== "All" && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: tc ? `${tc}18` : "var(--surface-3)", border: `1px solid ${tc}33` }}>
                          {TEAM_LOGO[t] && <img src={TEAM_LOGO[t]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                      )}
                      {t}
                      {active && (
                        <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

      </main>
    </>
  );
}
