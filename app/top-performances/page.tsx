"use client";

import { useEffect, useState } from "react";
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
};

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
    setLoading(true);
    setEntries([]);
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
    filter === "month" ? new Date().toLocaleString("en-AU", { month: "long", year: "numeric" }) :
    filter === "season" ? String(new Date().getFullYear()) : "";

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
      <div style={{ marginTop: 16, padding: "0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
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

        {!loading && entries.map((entry) => {
          const bg = foopyColor(entry.rating);
          const isBg = bg.startsWith("linear");
          const dateStr = entry.date
            ? new Date(entry.date + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
            : "";

          return (
            <div key={`${entry.name}-${entry.gameApiSportsId}`} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px",
              borderRadius: 14,
              background: "var(--surface-2)",
              border: "1px solid var(--border-2)",
            }}>
              {/* Rank */}
              <div style={{ width: 26, textAlign: "center", flexShrink: 0 }}>
                <span style={{
                  fontSize: entry.rank <= 3 ? 15 : 13,
                  fontWeight: 900,
                  color: entry.rank === 1 ? "#ffd700" : entry.rank === 2 ? "#cbd5e1" : entry.rank === 3 ? "#cd7f32" : "var(--text-3)",
                }}>
                  {entry.rank}
                </span>
              </div>

              {/* Player photo */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                background: "var(--surface-3)", border: "2px solid var(--border-2)",
              }}>
                <PlayerImage src={entry.image} name={entry.name} team={entry.team} />
              </div>

              {/* Name / meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{entry.team}</span>
                  {entry.opponent && (
                    <>
                      <span style={{ fontSize: 10, color: "var(--text-4)" }}>vs</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{entry.opponent}</span>
                    </>
                  )}
                  {entry.round != null && (
                    <span style={{ fontSize: 10, color: "var(--text-4)", background: "var(--surface-3)", padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
                      R{entry.round}
                    </span>
                  )}
                  {dateStr && (
                    <span style={{ fontSize: 10, color: "var(--text-4)" }}>{dateStr}</span>
                  )}
                </div>
              </div>

              {/* Rating badge */}
              <div style={{
                flexShrink: 0,
                minWidth: 44,
                padding: "5px 10px",
                borderRadius: 8,
                background: isBg ? bg : bg,
                textAlign: "center",
                boxShadow: `0 2px 8px ${isBg ? "rgba(255,180,0,0.35)" : bg + "55"}`,
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
                  {entry.rating.toFixed(1)}
                </span>
              </div>
            </div>
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
