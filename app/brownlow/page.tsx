"use client";

import { useEffect, useMemo, useState } from "react";
import { foopyColor } from "@/app/lib/foopyRating";
import { getLogo } from "@/app/match/[id]/utils";
import PageHeader from "@/app/components/PageHeader";

type Poll = { round: number | null; opponent: string; votes: number; rating: number };
type Entry = {
  rank: number;
  name: string;
  team: string;
  image: string;
  votes: number;
  threes: number;
  twos: number;
  ones: number;
  gamesPolled: number;
  polls: Poll[];
};

const TEAM_ABBR: Record<string, string> = {
  Adelaide: "ADE", "Adelaide Crows": "ADE", Brisbane: "BRI", "Brisbane Lions": "BRI",
  Carlton: "CAR", Collingwood: "COL", Essendon: "ESS", Fremantle: "FRE",
  Geelong: "GEE", "Geelong Cats": "GEE", "Gold Coast": "GC", "Gold Coast Suns": "GC",
  GWS: "GWS", "GWS Giants": "GWS", "Greater Western Sydney": "GWS",
  Hawthorn: "HAW", Melbourne: "MEL", "North Melbourne": "NM", "Port Adelaide": "PA",
  Richmond: "RIC", "St Kilda": "STK", Sydney: "SYD", "Sydney Swans": "SYD",
  "West Coast": "WCE", "West Coast Eagles": "WCE", "Western Bulldogs": "WB",
};
const abbr = (team: string | null) =>
  !team ? "" : TEAM_ABBR[team] ?? team.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 3);

function shortName(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function PlayerImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (failed || !src) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
        {initials}
      </div>
    );
  }
  return <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />;
}

const WINDOWS: { key: number; label: string }[] = [
  { key: 0, label: "Season" },
  { key: 3, label: "Last 3" },
  { key: 5, label: "Last 5" },
  { key: 10, label: "Last 10" },
];

export default function BrownlowPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<{ gamesCounted: number; lastRound: number }>({ gamesCounted: 0, lastRound: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [windowN, setWindowN] = useState(0); // 0 = whole season, else last N rounds
  const [team, setTeam] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch("/api/brownlow", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setEntries(json.leaderboard ?? []);
        setMeta({ gamesCounted: json.gamesCounted ?? 0, lastRound: json.lastRound ?? 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const teams = useMemo(
    () => Array.from(new Set(entries.map((e) => e.team).filter(Boolean))).sort(),
    [entries]
  );

  // Both filters are derived client-side from each player's per-round polls,
  // re-tallying votes over the selected round window and team.
  const view = useMemo<Entry[]>(() => {
    const maxRound = entries.reduce((m, e) => Math.max(m, ...e.polls.map((p) => p.round ?? 0)), 0);
    const minRound = windowN === 0 ? -Infinity : maxRound - windowN + 1;
    let list = entries.map((e) => {
      const polls = windowN === 0 ? e.polls : e.polls.filter((p) => (p.round ?? 0) >= minRound);
      return {
        ...e,
        polls,
        votes: polls.reduce((s, p) => s + p.votes, 0),
        threes: polls.filter((p) => p.votes === 3).length,
        twos: polls.filter((p) => p.votes === 2).length,
        ones: polls.filter((p) => p.votes === 1).length,
        gamesPolled: polls.length,
      };
    }).filter((e) => e.votes > 0);
    if (team !== "all") list = list.filter((e) => e.team === team);
    list.sort((a, b) => b.votes - a.votes || b.threes - a.threes || b.twos - a.twos);
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [entries, windowN, team]);

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 80px" }}>
      <PageHeader
        title="Foopy Brownlow"
        subtitle={meta.lastRound > 0 ? `${new Date().getFullYear()} · through Round ${meta.lastRound}` : String(new Date().getFullYear())}
        backHref="/"
        align="left"
      />

      <div style={{ padding: "12px 16px 6px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", lineHeight: 1.5 }}>
        3–2–1 votes awarded each game to the three highest Foopy Ratings.
        {meta.gamesCounted > 0 && ` ${meta.gamesCounted} games counted.`}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 4px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowN(w.key)}
              style={{
                padding: "7px 13px", borderRadius: 999,
                border: windowN === w.key ? "none" : "1px solid var(--border-2)",
                background: windowN === w.key ? "#3b82f6" : "var(--surface-2)",
                color: windowN === w.key ? "#fff" : "var(--text-2)",
                fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          style={{
            marginLeft: "auto", padding: "7px 12px", borderRadius: 999,
            border: team === "all" ? "1px solid var(--border-2)" : "none",
            background: team === "all" ? "var(--surface-2)" : "#3b82f6",
            color: team === "all" ? "var(--text-2)" : "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            appearance: "none", WebkitAppearance: "none",
          }}
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6", animation: "spin 0.75s linear infinite" }} />
        </div>
      )}

      {!loading && view.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
          <div style={{ fontWeight: 700 }}>No votes yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter</div>
        </div>
      )}

      {!loading && view.map((e, idx) => {
        const key = `${e.name}::${e.team}`;
        const isOpen = open === key;
        const medal = e.rank === 1 ? "#ffd700" : e.rank === 2 ? "#cbd5e1" : e.rank === 3 ? "#cd7f32" : "var(--text-4)";
        return (
          <div key={key} style={{ borderBottom: "1px solid var(--border-2)", borderTop: idx === 0 ? "1px solid var(--border-2)" : "none" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : key)}
              aria-expanded={isOpen}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, width: 20, textAlign: "center", flexShrink: 0, color: medal }}>{e.rank}</span>
              <span style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: 38, height: 38 }}>
                <span style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: "var(--surface-3)", display: "block" }}>
                  <PlayerImage src={e.image} name={e.name} />
                </span>
                {getLogo(e.team) && (
                  <img src={getLogo(e.team)} alt="" style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "var(--bg)", border: "1.5px solid var(--bg)", objectFit: "contain", pointerEvents: "none" }} onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(e.name)}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-4)", marginTop: 1 }}>
                  {abbr(e.team)}
                </div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", background: "#3b82f6", borderRadius: 8, padding: "5px 11px", minWidth: 46 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em" }}>{e.votes}</span>
                <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em", marginTop: 2 }}>VOTES</span>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.18s ease" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {isOpen && (
              <div style={{ padding: "0 16px 12px 50px", display: "flex", flexDirection: "column", gap: 4 }}>
                {e.polls.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-4)", padding: "6px 0" }}>No polling games.</div>
                ) : (
                  e.polls.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "var(--surface-2)" }}>
                      <span style={{ width: 44, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{p.round == null ? "" : p.round === 0 ? "OR" : `Rd ${p.round}`}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs {abbr(p.opponent)}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: foopyColor(p.rating), borderRadius: 6, padding: "2px 7px", minWidth: 34, textAlign: "center" }}>{p.rating.toFixed(1)}</span>
                      <span style={{ width: 26, textAlign: "center", flexShrink: 0, fontSize: 14, fontWeight: 900, color: p.votes === 3 ? "#ffd700" : p.votes === 2 ? "#cbd5e1" : "#cd7f32" }}>+{p.votes}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}
