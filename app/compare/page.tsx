"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import rawStats from "@/app/data/player-season-stats.json";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";
import { foopyRating, foopyColor } from "@/app/lib/foopyRating";
import PageHeader from "@/app/components/PageHeader";

type PlayerStat = {
  id: string; name: string; team: string; apiSportsId: number;
  photoUrl?: string | null; jerseyNumber?: number | null; position?: string | null;
  games: number; goals: number; goalAssists: number; behinds: number;
  disposals: number; kicks: number; handballs: number; marks: number;
  tackles: number; hitouts: number; clearances: number; goalAvg: number;
  totalDisposals: number; totalKicks: number; totalHandballs: number;
  totalMarks: number; totalTackles: number; totalHitouts: number;
  totalClearances: number; freesFor: number; freesAgainst: number;
};

type StatKey =
  | "disposals" | "goals" | "kicks" | "marks"
  | "tackles" | "clearances" | "hitouts" | "handballs" | "goalAssists";

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

const CATEGORIES: { key: StatKey; label: string; unit: "avg" | "tot" }[] = [
  { key: "disposals",   label: "Disposals",  unit: "avg" },
  { key: "goals",       label: "Goals",      unit: "tot" },
  { key: "kicks",       label: "Kicks",      unit: "avg" },
  { key: "marks",       label: "Marks",      unit: "avg" },
  { key: "tackles",     label: "Tackles",    unit: "avg" },
  { key: "clearances",  label: "Clearances", unit: "avg" },
  { key: "hitouts",     label: "Hitouts",    unit: "avg" },
  { key: "handballs",   label: "Handballs",  unit: "avg" },
  { key: "goalAssists", label: "Assists",    unit: "tot" },
];

const COMPARE_STATS: { key: StatKey; label: string }[] = [
  { key: "disposals",   label: "Disposals"  },
  { key: "kicks",       label: "Kicks"      },
  { key: "handballs",   label: "Handballs"  },
  { key: "marks",       label: "Marks"      },
  { key: "tackles",     label: "Tackles"    },
  { key: "clearances",  label: "Clearances" },
  { key: "goals",       label: "Goals"      },
  { key: "goalAssists", label: "Assists"    },
  { key: "hitouts",     label: "Hitouts"    },
];

const AVG_TO_TOTAL: Partial<Record<StatKey, keyof PlayerStat>> = {
  disposals: "totalDisposals", kicks: "totalKicks", marks: "totalMarks",
  tackles: "totalTackles", clearances: "totalClearances",
  hitouts: "totalHitouts", handballs: "totalHandballs",
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

function avgFoopy(p: PlayerStat): number | null {
  if (p.games === 0) return null;
  const g = p.games;
  return foopyRating({
    goals: p.goals / g,
    goalAssists: p.goalAssists / g,
    behinds: p.behinds / g,
    kicks: p.kicks,
    handballs: p.handballs,
    marks: p.marks,
    tackles: p.tackles,
    hitouts: p.hitouts,
    disposals: p.disposals,
    clearances: p.clearances,
    freesFor: p.freesFor / g,
    freesAgainst: p.freesAgainst / g,
  });
}

function getDisplayVal(player: PlayerStat, cat: StatKey, catUnit: "avg" | "tot", mode: "avg" | "total"): number {
  if (mode === "total") {
    const totalKey = AVG_TO_TOTAL[cat];
    return totalKey != null ? (player[totalKey] as number) : (player[cat] as number);
  }
  if (catUnit === "tot") return player.games > 0 ? (player[cat] as number) / player.games : 0;
  return player[cat] as number;
}

function getCompareVal(player: PlayerStat, key: StatKey, mode: "avg" | "total"): number {
  const cat = CATEGORIES.find(c => c.key === key)!;
  return getDisplayVal(player, key, cat.unit, mode);
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

// ── CardPhoto ─────────────────────────────────────────────────────────────────

function CardPhoto({ statsId, photoUrl, name, team }: {
  statsId: string; photoUrl?: string | null; name: string; team: string;
}) {
  const color = TEAM_COLOR[team] ?? "#1e293b";
  const localSrc = localImg(statsId, team);
  const [apiErr, setApiErr] = useState(false);
  const [localErr, setLocalErr] = useState(false);
  useEffect(() => { setApiErr(false); setLocalErr(false); }, [statsId]);

  const imgStyle: React.CSSProperties = {
    width: "100%", height: "100%", objectFit: "cover",
    objectPosition: "top center", display: "block",
  };
  if (photoUrl && !apiErr)
    return <img src={photoUrl} alt={name} onError={() => setApiErr(true)} style={imgStyle} />;
  if (localSrc && !localErr)
    return <img src={localSrc} alt={name} onError={() => setLocalErr(true)} style={imgStyle} />;
  const ini = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: "100%", height: "100%", flexShrink: 0,
      background: `linear-gradient(160deg, ${color}88 0%, ${color}22 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 52, fontWeight: 900, color: "var(--border-3)", letterSpacing: "-0.04em",
    }}>
      {ini}
    </div>
  );
}

// ── PlayerAvatar (small, for picker list) ─────────────────────────────────────

function PlayerAvatar({ statsId, photoUrl, name, team, size }: {
  statsId: string; photoUrl?: string | null; name: string; team: string; size: number;
}) {
  const color = TEAM_COLOR[team] ?? "#1e293b";
  const localSrc = localImg(statsId, team);
  const [apiErr, setApiErr] = useState(false);
  const [localErr, setLocalErr] = useState(false);
  useEffect(() => { setApiErr(false); setLocalErr(false); }, [statsId]);

  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%",
    objectFit: "cover", objectPosition: "top center", display: "block",
  };
  if (photoUrl && !apiErr)
    return <img src={photoUrl} alt={name} onError={() => setApiErr(true)} style={style} />;
  if (localSrc && !localErr)
    return <img src={localSrc} alt={name} onError={() => setLocalErr(true)} style={style} />;
  const ini = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${color}cc 0%, ${color}44 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.3, fontWeight: 900, color: "var(--text-1)",
    }}>
      {ini}
    </div>
  );
}

// ── ComparePlayerSlot ─────────────────────────────────────────────────────────

function ComparePlayerSlot({ player, label, onPick, onClear }: {
  player: PlayerStat | null; label: string; onPick: () => void; onClear: () => void;
}) {
  const color = player ? (TEAM_COLOR[player.team] ?? "#1e293b") : "#1e293b";

  if (!player) {
    return (
      <button onClick={onPick} style={{
        flex: 1, height: 200, borderRadius: 18, border: "2px dashed var(--border-2)",
        background: "var(--surface-2)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", color: "var(--text-3)",
      }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px dashed var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Pick Player {label}</div>
      </button>
    );
  }

  return (
    <div style={{
      flex: 1, height: 200, borderRadius: 18, overflow: "hidden", position: "relative",
      background: `linear-gradient(160deg, ${color}66 0%, ${color}22 60%, #0d0d0d 100%)`,
      cursor: "pointer",
      boxShadow: `0 8px 32px ${color}30`,
    }} onClick={onPick}>
      {/* Full-bleed photo */}
      <div style={{ position: "absolute", inset: 0 }}>
        <CardPhoto statsId={player.id} photoUrl={player.photoUrl} name={player.name} team={player.team} />
      </div>

      {/* Bottom gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.4) 45%, rgba(0,0,0,.05) 100%)",
      }} />

      {/* Top-left team logo */}
      {TEAM_LOGO[player.team] && (
        <img
          src={TEAM_LOGO[player.team]}
          alt={player.team}
          style={{
            position: "absolute", top: 10, left: 10,
            width: 28, height: 28, borderRadius: "50%",
            objectFit: "cover", background: "rgba(0,0,0,.6)",
          }}
        />
      )}

      {/* Top-right clear button */}
      <button
        onClick={e => { e.stopPropagation(); onClear(); }}
        style={{
          position: "absolute", top: 10, right: 10,
          width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
          background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,.6)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>

      {/* Bottom info */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {shortName(player.name)}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 600, marginTop: 3 }}>
          {playerSubtitle(player)}
        </div>
      </div>
    </div>
  );
}

// ── CompareStatRow ────────────────────────────────────────────────────────────

function CompareStatRow({ label, valA, valB, leagueMax, colorA, colorB }: {
  label: string; valA: number; valB: number; leagueMax: number; colorA: string; colorB: string;
}) {
  const scale = Math.max(leagueMax, 0.001);
  const pctA = Math.min((valA / scale) * 100, 100);
  const pctB = Math.min((valB / scale) * 100, 100);
  const winA = valA >= valB;
  const winB = valB >= valA;
  const fmtVal = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      borderBottom: "1px solid var(--border-1)",
      padding: "9px 0",
    }}>
      {/* Left — Player A: number then bar extending right toward center */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.04em", color: winA ? "#fff" : "#2e2e2e", lineHeight: 1, flexShrink: 0 }}>
          {fmtVal(valA)}
        </div>
        <div style={{ flex: 1, height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", minWidth: 40 }}>
          <div style={{
            height: "100%", width: `${pctA}%`,
            background: winA ? colorA : `${colorA}50`,
            borderRadius: 99, marginLeft: "auto",
            transition: "width .5s ease",
          }} />
        </div>
      </div>

      {/* Center label */}
      <div style={{ padding: "0 14px", textAlign: "center", flexShrink: 0, minWidth: 80 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>{label}</div>
      </div>

      {/* Right — Player B: bar extending left from center then number */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", minWidth: 40 }}>
          <div style={{
            height: "100%", width: `${pctB}%`,
            background: winB ? colorB : `${colorB}50`,
            borderRadius: 99,
            transition: "width .5s ease",
          }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.04em", color: winB ? "#fff" : "#2e2e2e", lineHeight: 1, flexShrink: 0 }}>
          {fmtVal(valB)}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();
  const players = (rawStats as PlayerStat[]).filter(p => p.games > 0);

  const [compareA, setCompareA] = useState<PlayerStat | null>(null);
  const [compareB, setCompareB] = useState<PlayerStat | null>(null);
  const [compareSlot, setCompareSlot] = useState<"A" | "B" | null>(null);
  const [mode, setMode] = useState<"avg" | "total">("avg");
  const [compareSearch, setCompareSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (compareSlot && searchRef.current) setTimeout(() => searchRef.current?.focus(), 50);
    if (!compareSlot) { setCompareSearch(""); setDebouncedSearch(""); }
  }, [compareSlot]);

  function handleSearch(val: string) {
    setCompareSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 120);
  }

  // Deduplicated sorted master list (stable — only built once)
  const allPlayers = useMemo(() => {
    const seen = new Set<string>();
    return [...players]
      .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const comparePlayers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = q
      ? allPlayers.filter(p => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      : allPlayers;
    return filtered.slice(0, 60);
  }, [allPlayers, debouncedSearch]);

  const colorA = compareA ? (TEAM_COLOR[compareA.team] ?? "#3b82f6") : "#3b82f6";
  const colorB = compareB ? (TEAM_COLOR[compareB.team] ?? "#ef4444") : "#ef4444";

  const leagueMax = useMemo(() => {
    const result: Record<string, number> = {};
    for (const s of COMPARE_STATS) {
      result[s.key] = Math.max(...allPlayers.map(p => getCompareVal(p, s.key, mode)), 0.001);
    }
    return result;
  }, [allPlayers, mode]);

  return (
    <>
      <style>{`
        .c-btn { -webkit-tap-highlight-color: transparent; }
        .c-btn:active { opacity: .65; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <main style={{
        minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
      }}>

        {/* Header */}
        <PageHeader
          title="Compare"
          onBack={() => router.push("/stats")}
          align="left"
          right={
            <div style={{ display: "inline-flex", background: "var(--surface-3)", borderRadius: 9, padding: 2 }}>
              {(["avg", "total"] as const).map(m => (
                <button key={m} className="c-btn" onClick={() => setMode(m)} style={{
                  padding: "4px 11px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: mode === m ? "var(--border-3)" : "transparent",
                  color: mode === m ? "#fff" : "#3a3a3a",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  {m === "avg" ? "Avg" : "Total"}
                </button>
              ))}
            </div>
          }
        />

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 12px" }}>

          {/* Player slots */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <ComparePlayerSlot
              player={compareA} label="A"
              onPick={() => setCompareSlot("A")}
              onClear={() => setCompareA(null)}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-4)", letterSpacing: "0.05em" }}>VS</div>
            </div>
            <ComparePlayerSlot
              player={compareB} label="B"
              onPick={() => setCompareSlot("B")}
              onClear={() => setCompareB(null)}
            />
          </div>


          {/* Stat rows */}
          {compareA && compareB && (
            <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--border-1)", background: "var(--surface-1)", padding: "0 16px" }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "12px 0 6px", borderBottom: "1px solid var(--border-1)" }}>
                <div style={{ textAlign: "right", fontSize: 11, fontWeight: 800, color: colorA, paddingRight: 10 }}>{shortName(compareA.name)}</div>
                <div style={{ width: 90 }} />
                <div style={{ textAlign: "left", fontSize: 11, fontWeight: 800, color: colorB, paddingLeft: 10 }}>{shortName(compareB.name)}</div>
              </div>
              {COMPARE_STATS.map(s => (
                <CompareStatRow
                  key={s.key}
                  label={s.label}
                  valA={getCompareVal(compareA, s.key, mode)}
                  valB={getCompareVal(compareB, s.key, mode)}
                  leagueMax={leagueMax[s.key]}
                  colorA={colorA}
                  colorB={colorB}
                />
              ))}
              {/* Games played row */}
              {(() => {
                const aMore = compareA.games >= compareB.games;
                const bMore = compareB.games >= compareA.games;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border-1)" }}>
                    <div style={{ textAlign: "right", fontSize: 18, fontWeight: 900, color: aMore ? "#fff" : "#2e2e2e", paddingRight: 10 }}>{compareA.games}</div>
                    <div style={{ width: 90, textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-1)" }}>Games</div>
                    <div style={{ textAlign: "left", fontSize: 18, fontWeight: 900, color: bMore ? "#fff" : "#2e2e2e", paddingLeft: 10 }}>{compareB.games}</div>
                  </div>
                );
              })()}
              {/* Avg Foopy row */}
              {(() => {
                const fA = avgFoopy(compareA);
                const fB = avgFoopy(compareB);
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border-1)" }}>
                    <div style={{ textAlign: "right", paddingRight: 10 }}>
                      {fA !== null
                        ? <span style={{ display: "inline-block", background: foopyColor(fA), borderRadius: 8, padding: "4px 10px", fontSize: 16, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em" }}>{fA.toFixed(1)}</span>
                        : <span style={{ fontSize: 13, color: "var(--text-4)" }}>—</span>}
                    </div>
                    <div style={{ width: 90, textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-4)" }}>Avg Foopy</div>
                    <div style={{ textAlign: "left", paddingLeft: 10 }}>
                      {fB !== null
                        ? <span style={{ display: "inline-block", background: foopyColor(fB), borderRadius: 8, padding: "4px 10px", fontSize: 16, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em" }}>{fB.toFixed(1)}</span>
                        : <span style={{ fontSize: 13, color: "var(--text-4)" }}>—</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Prompt when slots empty */}
          {(!compareA || !compareB) && (
            <div style={{ textAlign: "center", padding: "32px 24px", color: "var(--text-4)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                {!compareA && !compareB ? "Pick two players to compare" : "Pick one more player"}
              </div>
              <div style={{ fontSize: 11 }}>Tap a slot above to search</div>
            </div>
          )}
        </div>

        {/* Compare player picker modal */}
        {compareSlot && (
          <>
            <div onClick={() => setCompareSlot(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 101, width: "min(380px, 92vw)", maxHeight: "82dvh", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.85)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Pick Player {compareSlot}</span>
                <button onClick={() => setCompareSlot(null)} style={{ background: "var(--surface-3)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ padding: "10px 16px 8px", flexShrink: 0 }}>
                <div style={{ position: "relative" }}>
                  <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    ref={searchRef}
                    value={compareSearch}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search by name or team…"
                    style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 12, padding: "9px 12px 9px 32px", color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {comparePlayers.length === 0 && (
                  <div style={{ padding: "32px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>No players found</div>
                )}
                {comparePlayers.map(p => {
                  const color = TEAM_COLOR[p.team] ?? "#1e293b";
                  const logo  = TEAM_LOGO[p.team];
                  const ini   = p.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <button key={p.id} className="c-btn" onClick={() => {
                      if (compareSlot === "A") setCompareA(p);
                      else setCompareB(p);
                      setCompareSlot(null);
                    }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: "none", border: "none", borderBottom: "1px solid var(--border-1)", cursor: "pointer", textAlign: "left" }}>
                      {/* Static avatar — no hooks, no image loading */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${color}99 0%, ${color}33 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "var(--text-1)" }}>
                        {ini}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8e8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          {logo && <img src={logo} alt="" style={{ width: 10, height: 10, objectFit: "contain", opacity: 0.5 }} />}
                          <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>{playerSubtitle(p)}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)" }}>{p.games}GP</div>
                    </button>
                  );
                })}
                {debouncedSearch.trim() === "" && allPlayers.length > 60 && (
                  <div style={{ padding: "12px 16px", textAlign: "center", fontSize: 11, color: "var(--text-4)" }}>
                    Type to search all {allPlayers.length} players
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
