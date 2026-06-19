"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import PageHeader from "@/app/components/PageHeader";
import { getLogo, getAbbr } from "@/app/match/[id]/utils";
import { venueDisplayName } from "@/app/data/venues";

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

function teamKey(team: string) {
  return String(team || "").toLowerCase().replace(/[^a-z]/g, "");
}

function sameTeam(a: string, b: string) {
  // Loose match good enough for winner ↔ home/away comparison within one game.
  const ka = teamKey(a);
  const kb = teamKey(b);
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function roundLabel(m: Meeting) {
  if (m.isGrandFinal) return "Grand Final";
  const rn = m.roundname ?? "";
  const rm = rn.match(/^Round\s+(\d+)$/i);
  if (rm) return `R${rm[1]}`;
  return rn || (m.isFinal ? "Final" : "");
}

function MeetingRow({ m, viewable, onOpen }: { m: Meeting; viewable: boolean; onOpen: () => void }) {
  const draw = m.hscore === m.ascore;
  const hWon = !draw && m.winner != null && sameTeam(m.winner, m.hteam);
  const aWon = !draw && m.winner != null && sameTeam(m.winner, m.ateam);
  const dim = "rgba(255,255,255,0.38)";
  const label = roundLabel(m);

  return (
    <button type="button" onClick={viewable ? onOpen : undefined} disabled={!viewable} style={{ ...rowStyle, cursor: viewable ? "pointer" : "default" }} className={viewable ? "h2h-row" : undefined}>
      <div style={{ width: 70, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{m.year}</div>
        {label && (
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: m.isGrandFinal ? "#fbbf24" : m.isFinal ? "#60a5fa" : "var(--text-3)" }}>
            {label}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        <Logo team={m.hteam} dim={!hWon && !draw} />
        <span style={{ width: 26, textAlign: "right", fontSize: 14, fontWeight: hWon ? 900 : 600, color: hWon ? "var(--text-1)" : dim, fontVariantNumeric: "tabular-nums" }}>{m.hscore}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)" }}>–</span>
        <span style={{ width: 26, textAlign: "left", fontSize: 14, fontWeight: aWon ? 900 : 600, color: aWon ? "var(--text-1)" : dim, fontVariantNumeric: "tabular-nums" }}>{m.ascore}</span>
        <Logo team={m.ateam} dim={!aWon && !draw} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", whiteSpace: "nowrap", color: draw ? "var(--text-3)" : "#34d058" }}>
            {draw ? "Draw" : `${getAbbr(m.winner ?? "")} by ${Math.abs(m.hscore - m.ascore)}`}
          </span>
          {!draw && m.winner && (
            <div style={{ width: 16, height: 16, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
              <img src={getLogo(m.winner)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
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

function Logo({ team, dim }: { team: string; dim?: boolean }) {
  return (
    <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", opacity: dim ? 0.55 : 1 }}>
      <img src={getLogo(team)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    </div>
  );
}

function HeadToHeadContent() {
  const router = useRouter();
  const params = useSearchParams();
  const home = params.get("home") ?? "";
  const away = params.get("away") ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!home || !away) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    fetch(`/api/head-to-head?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [home, away]);

  const summary = data?.summary;
  // Only current-season games have an individual match page to open.
  const currentYear = new Date().getFullYear();

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        .h2h-row { transition: background 0.12s; }
        .h2h-row:active { background: rgba(255,255,255,0.04); }
        @media (hover: hover) { .h2h-row:hover { background: rgba(255,255,255,0.03); } }
      `}</style>

      <PageHeader title="Head to head" subtitle={home && away ? `${getAbbr(home)} v ${getAbbr(away)}` : undefined} />

      <div style={listStyle}>
        {summary && (
          <div style={summaryCardStyle}>
            <SummaryTeam team={home} wins={summary.home.wins} />
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{summary.total} meeting{summary.total === 1 ? "" : "s"}</div>
              {summary.draws > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{summary.draws} draw{summary.draws === 1 ? "" : "s"}</div>}
            </div>
            <SummaryTeam team={away} wins={summary.away.wins} alignEnd />
          </div>
        )}

        {loading && <div style={emptyStyle}>Loading…</div>}
        {!loading && (!data || data.meetings.length === 0) && (
          <div style={emptyStyle}>No recorded meetings between these teams.</div>
        )}

        {data && data.meetings.length > 0 && (
          <div style={listCardStyle}>
            {data.meetings.map((m, i) => (
              <div key={m.id} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                <MeetingRow m={m} viewable={m.year === currentYear} onOpen={() => router.push(`/match/${m.id}`)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryTeam({ team, wins, alignEnd }: { team: string; wins: number; alignEnd?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: alignEnd ? "flex-end" : "flex-start" }}>
      {alignEnd && <span style={winNumStyle}>{wins}</span>}
      <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <img src={getLogo(team)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      {!alignEnd && <span style={winNumStyle}>{wins}</span>}
    </div>
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

const summaryCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  borderRadius: 18,
  padding: "16px 18px",
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
