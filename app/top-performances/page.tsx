"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

type PerformanceEntry = {
  rank: number;
  name: string;
  team: string;
  rating: number;
  date: string;
  round: number | null;
  opponent: string | null;
  image: string;
  gameApiSportsId: string;
  squiggleGameId: string | null;
  goals: number;
  disposals: number;
  kicks: number;
  marks: number;
  tackles: number;
};

const TEAM_ABBR: Record<string, string> = {
  Adelaide:"ADE","Adelaide Crows":"ADE",Brisbane:"BRI","Brisbane Lions":"BRI",
  Carlton:"CAR",Collingwood:"COL",Essendon:"ESS",Fremantle:"FRE",
  Geelong:"GEE","Geelong Cats":"GEE","Gold Coast":"GC","Gold Coast Suns":"GC",
  GWS:"GWS","GWS Giants":"GWS","Greater Western Sydney":"GWS",
  Hawthorn:"HAW",Melbourne:"MEL","North Melbourne":"NM","Port Adelaide":"PA",
  Richmond:"RIC","St Kilda":"STK",Sydney:"SYD","Sydney Swans":"SYD",
  "West Coast":"WCE","West Coast Eagles":"WCE","Western Bulldogs":"WB",
};

function abbr(team: string | null): string {
  if (!team) return "";
  return TEAM_ABBR[team] ?? team.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

type Filter = "round" | "month" | "season" | "season_worst";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "round",         label: "This Round" },
  { key: "month",         label: "This Month" },
  { key: "season",        label: "This Season" },
  { key: "season_worst",  label: "Season Worst" },
];

function foopyColor(value: number): string {
  const v = Math.max(1, Math.min(10, value));
  if (v >= 10) return "linear-gradient(135deg, #ffd700, #ff8c00)";
  const anchors: [number, string][] = [
    [1, "#ef4444"], [2, "#ef4444"], [3, "#f97316"], [4, "#facc15"],
    [5, "#84cc16"], [6, "#22c55e"], [7, "#16a34a"], [8, "#166534"],
    [9, "#3b82f6"], [9.9, "#1e3a8a"],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [lo, loC] = anchors[i];
    const [hi, hiC] = anchors[i + 1];
    if (v >= lo && v <= hi) {
      const t = (v - lo) / (hi - lo);
      return interpolateColor(loC, hiC, t);
    }
  }
  return anchors[anchors.length - 1][1];
}

function interpolateColor(c1: string, c2: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function PlayerImage({ src, name, team }: { src: string; name: string; team: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (failed || !src) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFailed(true)}
    />
  );
}

function TopPerformancesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialFilter = (searchParams.get("filter") ?? "round") as Filter;
  const initialRound  = Number(searchParams.get("round") ?? 0);

  const [filter, setFilter]   = useState<Filter>(initialFilter);
  const [round, setRound]     = useState<number>(initialRound);
  const [entries, setEntries] = useState<PerformanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // Force a synchronous paint of the loading state before the fetch starts,
    // so the spinner is visible even for fast (sub-frame) responses.
    flushSync(() => {
      setLoading(true);
      setEntries([]);
    });
    const params = new URLSearchParams({ filter });
    if (filter === "round" && round > 0) params.set("round", String(round));
    fetch(`/api/top-performances?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        setEntries(json.entries ?? []);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== "AbortError") setLoading(false);
      });
    return () => controller.abort();
  }, [filter, round]);

  function changeFilter(f: Filter) {
    setFilter(f);
    const params = new URLSearchParams({ filter: f });
    if (f === "round" && round > 0) params.set("round", String(round));
    router.replace(`/top-performances?${params}`, { scroll: false });
  }

  const filterLabel = FILTERS.find(f => f.key === filter)?.label ?? "Top Performances";
  const subtitle = filter === "round" && round > 0 ? `Round ${round}` :
    filter === "month" ? "Last 30 days" :
    filter === "season" || filter === "season_worst" ? String(new Date().getFullYear()) : "";

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 60px" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Link href="/" style={{ padding: "8px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text-1)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            ← Back
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" }}>
              Foopy Ratings
            </h1>
            {subtitle && <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }} className="no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => changeFilter(f.key)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 999,
                border: filter === f.key ? "none" : "1px solid var(--border-2)",
                background: filter === f.key ? "#3b82f6" : "var(--surface-2)",
                color: filter === f.key ? "#fff" : "var(--text-2)",
                fontSize: 13, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ marginTop: 12 }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6", animation: "spin 0.75s linear infinite" }} />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
            <div style={{ fontWeight: 700 }}>No performances found</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter</div>
          </div>
        )}

        {!loading && entries.map((entry, idx) => {
          const ratingColor = foopyColor(entry.rating);
          const isFirst = idx === 0;
          const stats = [
            { val: entry.goals,     label: "G" },
            { val: entry.disposals, label: "D" },
            { val: entry.kicks,     label: "K" },
            { val: entry.marks,     label: "M" },
            { val: entry.tackles,   label: "T" },
          ];

          const href = entry.squiggleGameId ? `/match/${entry.squiggleGameId}` : null;
          const RowEl = href ? Link : "div";
          return (
            <RowEl key={`${entry.name}-${entry.gameApiSportsId}`} {...(href ? { href } : {})} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "11px 16px",
              borderTop: isFirst ? "1px solid var(--border-2)" : "none",
              borderBottom: "1px solid var(--border-2)",
              textDecoration: "none", color: "inherit",
              cursor: href ? "pointer" : "default",
            } as React.CSSProperties}>
              {/* Left: rank + photo + name/team */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, width: 160, flexShrink: 0, minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 900, flexShrink: 0, width: 18, textAlign: "center",
                  color: entry.rank === 1 ? "#ffd700" : entry.rank === 2 ? "#cbd5e1" : entry.rank === 3 ? "#cd7f32" : "var(--text-4)",
                }}>
                  {entry.rank}
                </span>
                <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface-3)" }}>
                  <PlayerImage src={entry.image} name={entry.name} team={entry.team} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(() => {
                      const parts = entry.name.trim().split(" ");
                      if (parts.length < 2) return entry.name;
                      return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
                    })()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-4)", marginTop: 1, whiteSpace: "nowrap" }}>
                    {entry.round != null ? `Rd ${entry.round}` : ""}
                    {entry.round != null && entry.opponent ? ` vs ${abbr(entry.opponent)}` : ""}
                  </div>
                </div>
              </div>

              {/* Stats: G D K M T */}
              <div style={{ display: "flex", gap: 10, flex: 1, justifyContent: "center" }}>
                {stats.map(({ val, label }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 22 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{val}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.05em", marginTop: 2 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Rating box */}
              <div onClick={e => e.stopPropagation()} style={{
                flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
                background: ratingColor, borderRadius: 8, padding: "5px 10px", minWidth: 48,
                boxShadow: `0 2px 8px ${ratingColor}66`,
              }}>
                <span style={{ fontSize: 17, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {entry.rating.toFixed(1)}
                </span>
                <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em", marginTop: 2 }}>FOOPY</span>
              </div>
            </RowEl>
          );
        })}
      </div>
    </main>
  );
}

export default function TopPerformancesPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6", animation: "spin 0.75s linear infinite" }} />
      </div>
    }>
      <TopPerformancesInner />
    </Suspense>
  );
}
