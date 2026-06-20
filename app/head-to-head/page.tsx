"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import PageHeader from "@/app/components/PageHeader";
import { getLogo, getAbbr } from "@/app/match/[id]/utils";
import { venueDisplayName } from "@/app/data/venues";

type WinnerSide = "home" | "away" | null;

type Meeting = {
  id: number;
  year: number;
  roundname: string;
  hteam: string;
  ateam: string;
  hscore: number;
  ascore: number;
  venue: string;
  date: string;
  winner: string | null;
  isFinal: boolean;
  isGrandFinal: boolean;
  winnerSide: WinnerSide;
};

type Payload = {
  meetings: Meeting[];
  summary: {
    total: number;
    home: { name: string; key: string; wins: number };
    away: { name: string; key: string; wins: number };
    draws: number;
  } | null;
};

type LeagueRecords = {
  longestCurrent: { team: string; opponent: string; len: number; since: number }[];
  longestEver: { team: string; opponent: string; len: number; fromYear: number; toYear: number }[];
  highestWinPct: { team: string; opponent: string; pct: number; wins: number; losses: number; total: number }[];
  mostWins: { team: string; opponent: string; wins: number; losses: number }[];
  mostDraws: { teamA: string; teamB: string; draws: number }[];
  closest: { teamA: string; teamB: string; winsA: number; winsB: number; total: number }[];
  mostPlayed: { teamA: string; teamB: string; total: number }[];
  minMeetings: number;
};

type RecordItem = { value: string; sub: string; team: string; opponent: string; onPick: () => void };

// Current AFL clubs (names getLogo/getAbbr and the API all understand).
const TEAMS = [
  "Adelaide", "Brisbane Lions", "Carlton", "Collingwood", "Essendon",
  "Fremantle", "Geelong", "Gold Coast", "Greater Western Sydney", "Hawthorn",
  "Melbourne", "North Melbourne", "Port Adelaide", "Richmond", "St Kilda",
  "Sydney", "West Coast", "Western Bulldogs",
];

function roundLabel(m: Meeting) {
  if (m.isGrandFinal) return "Grand Final";
  const rn = m.roundname ?? "";
  if (/^opening round$/i.test(rn)) return "OR";
  const rm = rn.match(/^Round\s+(\d+)$/i);
  if (rm) return `R${rm[1]}`;
  // Squiggle names finals in the plural ("Preliminary Finals"); show singular.
  return rn.replace(/\bFinals\b/i, "Final") || (m.isFinal ? "Final" : "");
}

// ── Derived stats ───────────────────────────────────────────────────────────
type Streak = { side: Exclude<WinnerSide, null>; len: number; fromYear: number; toYear: number };

function computeStats(meetings: Meeting[]) {
  // API returns newest-first; walk oldest-first for the all-time streak.
  const chrono = [...meetings].reverse();

  let best: Streak | null = null;
  let runSide: WinnerSide = null;
  let runLen = 0;
  let runFrom = 0;
  for (const m of chrono) {
    if (m.winnerSide == null) { runSide = null; runLen = 0; continue; }
    if (m.winnerSide === runSide) { runLen++; } else { runSide = m.winnerSide; runLen = 1; runFrom = m.year; }
    if (!best || runLen > best.len) best = { side: m.winnerSide, len: runLen, fromYear: runFrom, toYear: m.year };
  }

  // Current streak — from the most recent meeting backwards.
  let curSide: WinnerSide = null;
  let curLen = 0;
  let curFrom = 0;
  for (const m of meetings) {
    if (m.winnerSide == null) break;
    if (curLen === 0) { curSide = m.winnerSide; curLen = 1; curFrom = m.year; }
    else if (m.winnerSide === curSide) { curLen++; curFrom = m.year; }
    else break;
  }
  const current: Streak | null = curSide ? { side: curSide, len: curLen, fromYear: curFrom, toYear: meetings[0].year } : null;

  let biggest: { side: Exclude<WinnerSide, null>; margin: number; year: number; m: Meeting } | null = null;
  let highest: { total: number; year: number; m: Meeting } | null = null;
  let marginSum = 0;
  for (const m of meetings) {
    const margin = Math.abs(m.hscore - m.ascore);
    marginSum += margin;
    if (m.winnerSide && (!biggest || margin > biggest.margin)) biggest = { side: m.winnerSide, margin, year: m.year, m };
    const total = m.hscore + m.ascore;
    if (!highest || total > highest.total) highest = { total, year: m.year, m };
  }

  const years = meetings.map((m) => m.year);
  const firstYear = years.length ? Math.min(...years) : 0;
  const lastYear = years.length ? Math.max(...years) : 0;
  const avgMargin = meetings.length ? Math.round(marginSum / meetings.length) : 0;

  return { best, current, biggest, highest, firstYear, lastYear, avgMargin };
}

// ── Components ───────────────────────────────────────────────────────────────
function Logo({ team, size = 26, dim }: { team: string; size?: number; dim?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", opacity: dim ? 0.55 : 1, flexShrink: 0 }}>
      <img src={getLogo(team)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    </div>
  );
}

function TeamSlot({ team, placeholder, active, onClick }: { team: string; placeholder: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        padding: "16px 8px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
        background: active ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {team ? (
        <>
          <Logo team={team} size={48} />
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{getAbbr(team)}</span>
        </>
      ) : (
        <>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "var(--text-3)" }}>+</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>{placeholder}</span>
        </>
      )}
    </button>
  );
}

function TeamPicker({ home, away, onPick }: { home: string; away: string; onPick: (slot: "home" | "away", team: string) => void }) {
  // Grid stays hidden until a slot is tapped. Picking a team closes it again.
  const [editing, setEditing] = useState<"home" | "away" | null>(null);
  const toggle = (slot: "home" | "away") => setEditing((cur) => (cur === slot ? null : slot));

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
        <TeamSlot team={home} placeholder="Team A" active={editing === "home"} onClick={() => toggle("home")} />
        <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text-3)", letterSpacing: "0.04em" }}>VS</span>
        <TeamSlot team={away} placeholder="Team B" active={editing === "away"} onClick={() => toggle("away")} />
      </div>

      {editing && (
        <div style={{ padding: "0 12px 14px" }} className="h2h-pickergrid">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 8px" }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Choose {editing === "home" ? "Team A" : "Team B"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close team picker"
              style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2, lineHeight: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
            {TEAMS.map((t) => {
              const taken = (editing === "home" ? away : home) === t;
              const selected = (editing === "home" ? home : away) === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={taken}
                  onClick={() => { onPick(editing, t); setEditing(null); }}
                  title={t}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 10,
                    background: selected ? "rgba(96,165,250,0.15)" : "transparent",
                    border: selected ? "1px solid rgba(96,165,250,0.4)" : "1px solid transparent",
                    cursor: taken ? "not-allowed" : "pointer", opacity: taken ? 0.25 : 1,
                  }}
                >
                  <Logo team={t} size={32} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, team }: { label: string; value: string; sub?: string; team?: string }) {
  return (
    <div style={tileStyle}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
        {team && <Logo team={team} size={22} />}
        <span style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</span>
      </div>
      {sub && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginTop: 3 }}>{sub}</span>}
    </div>
  );
}

function MeetingRow({ m, viewable, onOpen }: { m: Meeting; viewable: boolean; onOpen: () => void }) {
  const draw = m.winnerSide == null && m.hscore === m.ascore;
  const hWon = m.winnerSide != null && m.hscore > m.ascore;
  const aWon = m.winnerSide != null && m.ascore > m.hscore;
  const dim = "rgba(255,255,255,0.38)";
  const label = roundLabel(m);

  return (
    <button type="button" onClick={viewable ? onOpen : undefined} style={{ ...rowStyle, cursor: viewable ? "pointer" : "default" }} className={viewable ? "h2h-row" : undefined}>
      <div style={{ width: 72, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{m.year}</div>
        {label && (
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.03em", lineHeight: 1.15, textTransform: "uppercase", color: m.isGrandFinal ? "#fbbf24" : m.isFinal ? "#60a5fa" : "var(--text-3)" }}>
            {label}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0 }}>
        <Logo team={m.hteam} dim={!hWon && !draw} />
        <span style={{ width: 30, textAlign: "right", fontSize: 14, fontWeight: hWon ? 900 : 600, color: hWon ? "var(--text-1)" : dim, fontVariantNumeric: "tabular-nums" }}>{m.hscore}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)" }}>–</span>
        <span style={{ width: 30, textAlign: "left", fontSize: 14, fontWeight: aWon ? 900 : 600, color: aWon ? "var(--text-1)" : dim, fontVariantNumeric: "tabular-nums" }}>{m.ascore}</span>
        <Logo team={m.ateam} dim={!aWon && !draw} />
      </div>

      <div style={{ width: 96, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", whiteSpace: "nowrap", color: draw ? "var(--text-3)" : "var(--text-1)" }}>
            {draw ? "Draw" : `${getAbbr(m.winner ?? "")} by ${Math.abs(m.hscore - m.ascore)}`}
          </span>
          {!draw && m.winner && <Logo team={m.winner} size={16} />}
        </div>
        {m.venue && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
            {venueDisplayName(m.venue)}
          </span>
        )}
      </div>

      {viewable ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : (
        <span style={{ width: 14, flexShrink: 0 }} />
      )}
    </button>
  );
}

function SummaryTeam({ team, wins, alignEnd }: { team: string; wins: number; alignEnd?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: alignEnd ? "flex-end" : "flex-start" }}>
      {alignEnd && <span style={winNumStyle}>{wins}</span>}
      <Logo team={team} size={36} />
      {!alignEnd && <span style={winNumStyle}>{wins}</span>}
    </div>
  );
}

function DualLogo({ team, opponent, size = 34 }: { team: string; opponent: string; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ position: "relative", zIndex: 2 }}><Logo team={team} size={size} /></div>
      <div style={{ marginLeft: -size * 0.24, position: "relative", zIndex: 1 }}><Logo team={opponent} size={size} dim /></div>
    </div>
  );
}

function RecordCard({ label, items }: { label: string; items: RecordItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const head = items[0];

  return (
    <div style={recordCardWrapStyle}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={recordCardStyle} className="h2h-row" aria-expanded={open}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <DualLogo team={head.team} opponent={head.opponent} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em", marginTop: 2 }}>{head.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{head.sub}</div>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.18s ease" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {open && (
        <div className="h2h-pickergrid" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {items.map((it, i) => (
            <button key={i} type="button" onClick={it.onPick} className="h2h-row" style={recordRowStyle}>
              <span style={{ width: 18, flexShrink: 0, fontSize: 12, fontWeight: 900, color: i < 3 ? ["#ffd700", "#c0c0c0", "#cd7f32"][i] : "var(--text-3)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <DualLogo team={it.team} opponent={it.opponent} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.01em" }}>{it.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function HeadToHeadContent() {
  const router = useRouter();
  const params = useSearchParams();
  const home = params.get("home") ?? "";
  const away = params.get("away") ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<LeagueRecords | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/head-to-head/records", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setRecords(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!home || !away) { setData(null); return; }
    let active = true;
    setLoading(true);
    fetch(`/api/head-to-head?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [home, away]);

  const setTeams = (h: string, a: string) => {
    const q = new URLSearchParams();
    if (h) q.set("home", h);
    if (a) q.set("away", a);
    router.replace(`/head-to-head${q.toString() ? `?${q}` : ""}`);
  };
  const onPick = (slot: "home" | "away", team: string) => {
    if (slot === "home") setTeams(team, away === team ? "" : away);
    else setTeams(home === team ? "" : home, team);
  };

  const meetings = data?.meetings ?? [];
  const summary = data?.summary;
  const stats = useMemo(() => computeStats(meetings), [meetings]);
  const currentYear = new Date().getFullYear();
  const resolve = (side: Exclude<WinnerSide, null>) => (side === "home" ? home : away);
  const bothChosen = Boolean(home && away);

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .h2h-row { transition: background 0.12s; }
        .h2h-row:active { background: rgba(255,255,255,0.04); }
        @media (hover: hover) { .h2h-row:hover { background: rgba(255,255,255,0.03); } }
        .h2h-pickergrid { animation: h2hPickerIn 0.18s ease-out; transform-origin: top center; }
        @keyframes h2hPickerIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <PageHeader title="Head to Head" subtitle={bothChosen ? `${getAbbr(home)} v ${getAbbr(away)}` : undefined} />

      <div style={listStyle}>
        <TeamPicker home={home} away={away} onPick={onPick} />

        {!bothChosen && (
          <>
            <div style={{ ...emptyStyle, padding: "16px 16px 6px" }}>Pick two teams to see their all-time head-to-head.</div>
            {records && (
              <>
                <div style={sectionLabelStyle}>League records</div>
                <RecordCard
                  label="Longest ever streak"
                  items={records.longestEver.map((r) => ({
                    value: `${r.len} wins in a row`,
                    sub: `${r.team} over ${r.opponent} · ${r.fromYear}–${r.toYear}`,
                    team: r.team, opponent: r.opponent,
                    onPick: () => setTeams(r.team, r.opponent),
                  }))}
                />
                <RecordCard
                  label="Longest active streak"
                  items={records.longestCurrent.map((r) => ({
                    value: `${r.len} wins in a row`,
                    sub: `${r.team} over ${r.opponent} · since ${r.since}`,
                    team: r.team, opponent: r.opponent,
                    onPick: () => setTeams(r.team, r.opponent),
                  }))}
                />
                <RecordCard
                  label={`Best win rate (min ${records.minMeetings})`}
                  items={records.highestWinPct.map((r) => ({
                    value: `${r.pct}%`,
                    sub: `${r.team} vs ${r.opponent} · ${r.wins}–${r.losses}`,
                    team: r.team, opponent: r.opponent,
                    onPick: () => setTeams(r.team, r.opponent),
                  }))}
                />
                <RecordCard
                  label="Most wins over one team"
                  items={records.mostWins.map((r) => ({
                    value: `${r.wins} wins`,
                    sub: `${r.team} over ${r.opponent} · ${r.wins}–${r.losses}`,
                    team: r.team, opponent: r.opponent,
                    onPick: () => setTeams(r.team, r.opponent),
                  }))}
                />
                <RecordCard
                  label="Closest rivalry"
                  items={records.closest.map((r) => ({
                    value: `${r.winsA}–${r.winsB}`,
                    sub: `${r.teamA} v ${r.teamB} · ${r.total} meetings`,
                    team: r.teamA, opponent: r.teamB,
                    onPick: () => setTeams(r.teamA, r.teamB),
                  }))}
                />
                <RecordCard
                  label="Most draws"
                  items={records.mostDraws.map((r) => ({
                    value: `${r.draws} draws`,
                    sub: `${r.teamA} v ${r.teamB}`,
                    team: r.teamA, opponent: r.teamB,
                    onPick: () => setTeams(r.teamA, r.teamB),
                  }))}
                />
                <RecordCard
                  label="Most played rivalry"
                  items={records.mostPlayed.map((r) => ({
                    value: `${r.total} meetings`,
                    sub: `${r.teamA} v ${r.teamB}`,
                    team: r.teamA, opponent: r.teamB,
                    onPick: () => setTeams(r.teamA, r.teamB),
                  }))}
                />
              </>
            )}
          </>
        )}

        {bothChosen && loading && !data && <div style={emptyStyle}>Loading…</div>}

        {bothChosen && data && meetings.length === 0 && (
          <div style={emptyStyle}>No recorded meetings between these teams.</div>
        )}

        {bothChosen && summary && meetings.length > 0 && (
          <>
            <div style={summaryCardStyle}>
              <SummaryTeam team={home} wins={summary.home.wins} />
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{summary.total} meeting{summary.total === 1 ? "" : "s"}</div>
                {summary.draws > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{summary.draws} draw{summary.draws === 1 ? "" : "s"}</div>}
              </div>
              <SummaryTeam team={away} wins={summary.away.wins} alignEnd />
            </div>

            {/* Cool stats */}
            <div style={statsGridStyle}>
              {stats.current ? (
                <StatTile
                  label="Current streak"
                  value={`${stats.current.len} in a row`}
                  team={resolve(stats.current.side)}
                  sub={`${getAbbr(resolve(stats.current.side))} — since ${stats.current.fromYear}`}
                />
              ) : (
                <StatTile label="Current streak" value="None" sub="Last result was a draw" />
              )}

              {stats.best && (
                <StatTile
                  label="Longest ever streak"
                  value={`${stats.best.len} in a row`}
                  team={resolve(stats.best.side)}
                  sub={`${getAbbr(resolve(stats.best.side))} · ${stats.best.fromYear}–${stats.best.toYear}`}
                />
              )}

              {stats.biggest && (
                <StatTile
                  label="Biggest win"
                  value={`by ${stats.biggest.margin}`}
                  team={resolve(stats.biggest.side)}
                  sub={`${getAbbr(resolve(stats.biggest.side))} · ${stats.biggest.year}`}
                />
              )}

              {stats.highest && (
                <StatTile
                  label="Highest scoring"
                  value={`${stats.highest.total} pts`}
                  sub={`${getAbbr(stats.highest.m.hteam)} ${stats.highest.m.hscore} – ${stats.highest.m.ascore} ${getAbbr(stats.highest.m.ateam)} · ${stats.highest.year}`}
                />
              )}

              <StatTile label="Average margin" value={`${stats.avgMargin} pts`} />

              <StatTile label="First meeting" value={`${stats.firstYear}`} sub={`${stats.lastYear - stats.firstYear + 1} seasons of rivalry`} />
            </div>

            {/* Full meetings list */}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", padding: "4px 4px 0" }}>
              Every meeting
            </div>
            <div style={listCardStyle}>
              {meetings.map((m, i) => (
                <div key={m.id} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                  <MeetingRow m={m} viewable={m.year === currentYear} onOpen={() => router.push(`/match/${m.id}`)} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function HeadToHeadPage() {
  return (
    <Suspense fallback={<main style={pageStyle} />}>
      <HeadToHeadContent />
    </Suspense>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "14px 14px 0",
  maxWidth: 600,
  margin: "0 auto",
};

const cardStyle: CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 18,
  overflow: "hidden",
};

const summaryCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 18,
  padding: "16px 18px",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 10,
};

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 16,
  padding: "13px 14px",
  minHeight: 78,
};

const listCardStyle: CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 18,
  overflow: "hidden",
  padding: "2px 16px",
};

const rowStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "12px 0",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

const winNumStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: "var(--text-1)",
  fontVariantNumeric: "tabular-nums",
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  padding: "40px 16px",
  color: "var(--text-3)",
  fontSize: 14,
  fontWeight: 600,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  padding: "4px 4px 0",
};

const recordCardWrapStyle: CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 16,
  overflow: "hidden",
};

const recordCardStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

const recordRowStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.04)",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};
