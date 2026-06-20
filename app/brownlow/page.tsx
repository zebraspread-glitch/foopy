"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { foopyColor } from "@/app/lib/foopyRating";
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

export default function BrownlowPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<{ gamesCounted: number; lastRound: number }>({ gamesCounted: 0, lastRound: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

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

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#3b82f6", animation: "spin 0.75s linear infinite" }} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
          <div style={{ fontWeight: 700 }}>No votes yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Check back once games are played</div>
        </div>
      )}

      {!loading && entries.map((e, idx) => {
        const isOpen = open === e.rank;
        const medal = e.rank === 1 ? "#ffd700" : e.rank === 2 ? "#cbd5e1" : e.rank === 3 ? "#cd7f32" : "var(--text-4)";
        return (
          <div key={`${e.name}-${e.rank}`} style={{ borderBottom: "1px solid var(--border-2)", borderTop: idx === 0 ? "1px solid var(--border-2)" : "none" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : e.rank)}
              aria-expanded={isOpen}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, width: 20, textAlign: "center", flexShrink: 0, color: medal }}>{e.rank}</span>
              <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface-3)" }}>
                <PlayerImage src={e.image} name={e.name} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(e.name)}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-4)", marginTop: 1 }}>
                  {abbr(e.team)} · {e.threes}×3 {e.twos}×2 {e.ones}×1
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
