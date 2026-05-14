import path from "path";
import fs from "fs";
import Link from "next/link";
import { BackButton, TeamLogoImage } from "./TeamClient";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";

const API_SPORTS_TO_SQUIGGLE: Record<number, string> = Object.fromEntries(
  Object.entries(API_SPORTS_MATCH_IDS).map(([sq, api]) => [Number(api), sq])
);

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerInfo = { id: string; name: string; team: string; apiSportsId?: number | null; statsIds?: number[] };
type SeasonStats = { id: string; position?: string; jerseyNumber?: number; games?: number };
type TeamStatGame = {
  gameId: number; date: string;
  teams: { team: { id: number }; statistics: { disposals: { disposals: number }; stoppages: { hitouts: number; clearances: number }; marks: number; scoring: { goals: number; behinds: number }; defence: { tackles: number } } }[];
};

// ── Mappings ──────────────────────────────────────────────────────────────────

const TEAM_SLUG_MAP: Record<string, { name: string; id: number }> = {
  adelaide:        { name: "Adelaide",          id: 1  },
  brisbanelions:   { name: "Brisbane Lions",    id: 2  },
  carlton:         { name: "Carlton",           id: 3  },
  collingwood:     { name: "Collingwood",       id: 4  },
  essendon:        { name: "Essendon",          id: 5  },
  fremantle:       { name: "Fremantle",         id: 6  },
  geelong:         { name: "Geelong",           id: 7  },
  hawthorn:        { name: "Hawthorn",          id: 8  },
  melbourne:       { name: "Melbourne",         id: 9  },
  northmelbourne:  { name: "North Melbourne",   id: 10 },
  portadelaide:    { name: "Port Adelaide",     id: 11 },
  richmond:        { name: "Richmond",          id: 12 },
  stkilda:         { name: "St Kilda",          id: 13 },
  sydney:          { name: "Sydney",            id: 14 },
  westcoast:       { name: "West Coast",        id: 15 },
  westernbulldogs: { name: "Western Bulldogs",  id: 16 },
  goldcoast:       { name: "Gold Coast",        id: 17 },
  gws:             { name: "GWS",               id: 18 },
};

const TEAM_ID_MAP: Record<number, string> = {
  1: "Adelaide", 2: "Brisbane Lions", 3: "Carlton", 4: "Collingwood",
  5: "Essendon", 6: "Fremantle", 7: "Geelong", 8: "Hawthorn",
  9: "Melbourne", 10: "North Melbourne", 11: "Port Adelaide", 12: "Richmond",
  13: "St Kilda", 14: "Sydney", 15: "West Coast", 16: "Western Bulldogs",
  17: "Gold Coast", 18: "GWS",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#111111", Essendon: "#cc0000", Fremantle: "#4b1979",
  Geelong: "#003b73", "Gold Coast": "#c0392b", GWS: "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#1a1a1a", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const LOGO_MAP: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png", Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png", "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png", Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png", Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png", "Western Bulldogs": "/team-logos/bulldogs.png",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function foopyRating(p: {
  goals: number; goalAssists: number; behinds: number; kicks: number;
  handballs: number; marks: number; tackles: number; hitouts: number;
  disposals: number; clearances: number; freesFor: number; freesAgainst: number;
}): number {
  let score =
    p.goals * 5.5 + p.goalAssists * 1.5 + p.behinds * 1.2 +
    p.kicks * 0.75 + p.handballs * 0.55 + p.marks * 1.0 +
    p.tackles * 1.8 + p.hitouts * 0.35 + p.clearances * 0.5 +
    p.freesFor * 0.3 - p.freesAgainst * 0.4;
  if (p.goals >= 3)  score += 3;
  if (p.goals >= 5)  score += 5;
  if (p.goals >= 7)  score += 10;
  if (p.goals >= 10) score += 18;
  if (p.disposals >= 25) score += 3;
  if (p.disposals >= 30) score += 4;
  if (p.tackles >= 8)    score += 4;
  if (p.marks >= 10)     score += 3;
  if (p.hitouts >= 25)   score += 3;
  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 36)))).toFixed(2));
}

function mixColor(a: string, b: string, amount: number) {
  const ah = a.replace("#", ""), bh = b.replace("#", "");
  const ar = parseInt(ah.substring(0, 2), 16), ag = parseInt(ah.substring(2, 4), 16), ab = parseInt(ah.substring(4, 6), 16);
  const br = parseInt(bh.substring(0, 2), 16), bg = parseInt(bh.substring(2, 4), 16), bb = parseInt(bh.substring(4, 6), 16);
  return `rgb(${Math.round(ar + amount * (br - ar))}, ${Math.round(ag + amount * (bg - ag))}, ${Math.round(ab + amount * (bb - ab))})`;
}

function foopyColor(f: number): string {
  const v = Math.max(1, Math.min(10, f));
  if (v >= 10) return "#ffd700";
  const anchors: [number, string][] = [
    [1, "#ef4444"], [2, "#ef4444"], [3, "#f97316"], [4, "#facc15"],
    [5, "#84cc16"], [6, "#22c55e"], [7, "#16a34a"], [8, "#166534"],
    [9, "#3b82f6"], [9.9, "#1e3a8a"],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [lo, colorLo] = anchors[i];
    const [hi, colorHi] = anchors[i + 1];
    if (v <= hi) return mixColor(colorLo, colorHi, (v - lo) / (hi - lo));
  }
  return mixColor("#3b82f6", "#1e3a8a", (v - 9) / 0.9);
}

function aflScore(goals: number, behinds: number) { return goals * 6 + behinds; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = TEAM_SLUG_MAP[slug] ?? null;

  const dataDir = path.join(process.cwd(), "app", "data");

  if (!team) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}><BackButton /></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 12 }}>
          <div style={{ fontSize: 48 }}>🏈</div>
          <p style={{ color: "#64748b", fontWeight: 800, fontSize: 16 }}>Team not found</p>
        </div>
      </main>
    );
  }

  const { name: teamName, id: teamId } = team;
  const color = TEAM_COLORS[teamName] ?? "#1e293b";
  const logo  = LOGO_MAP[teamName] ?? "/team-logos/crows.png";

  const players:    PlayerInfo[]  = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const seasonData: SeasonStats[] = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const teamStatsRaw: Record<string, TeamStatGame> = JSON.parse(fs.readFileSync(path.join(dataDir, "team-stats.json"), "utf8"));
  const gameStats: Record<string, {
    gameId: number; date: string;
    teams: { team?: { id: number }; players: { player: { id: number }; goals: { total: number; assists: number }; behinds: number; disposals: number; kicks: number; handballs: number; marks: number; tackles: number; hitouts: number; clearances: number; free_kicks: { for: number; against: number } }[] }[];
  }> = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  // Build apiSportsId → foopy scores in one pass
  const foopyMap = new Map<number, number[]>();
  for (const g of Object.values(gameStats)) {
    for (const t of g.teams ?? []) {
      for (const ps of t.players ?? []) {
        const pid = ps.player?.id;
        if (!pid) continue;
        const f = foopyRating({
          goals: num(ps.goals?.total), goalAssists: num(ps.goals?.assists),
          behinds: num(ps.behinds), kicks: num(ps.kicks), handballs: num(ps.handballs),
          marks: num(ps.marks), tackles: num(ps.tackles), hitouts: num(ps.hitouts),
          disposals: num(ps.disposals), clearances: num(ps.clearances),
          freesFor: num(ps.free_kicks?.for), freesAgainst: num(ps.free_kicks?.against),
        });
        if (f > 0) {
          if (!foopyMap.has(pid)) foopyMap.set(pid, []);
          foopyMap.get(pid)!.push(f);
        }
      }
    }
  }

  // Roster with per-player avg foopy
  const roster = players
    .filter(p => p.team === teamName)
    .map(p => {
      const season = seasonData.find(s => s.id === p.id);
      const ids = new Set<number>();
      if (p.apiSportsId) ids.add(p.apiSportsId);
      for (const sid of p.statsIds ?? []) ids.add(sid);
      const scores: number[] = [];
      for (const id of ids) { for (const s of foopyMap.get(id) ?? []) scores.push(s); }
      const avgFoopy = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      return { player: p, season, avgFoopy };
    })
    .sort((a, b) => (b.avgFoopy ?? -1) - (a.avgFoopy ?? -1));

  // Team avg foopy across squad
  const ratedPlayers = roster.filter(r => r.avgFoopy !== null);
  const teamAvgFoopy = ratedPlayers.length
    ? ratedPlayers.reduce((s, r) => s + r.avgFoopy!, 0) / ratedPlayers.length
    : null;

  // Team games sorted newest first
  const teamGames = Object.values(teamStatsRaw)
    .filter(g => g.teams.some(t => t.team?.id === teamId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Season record + avg margin
  let wins = 0, draws = 0, losses = 0, totalMargin = 0;
  for (const g of teamGames) {
    const us   = g.teams.find(t => t.team?.id === teamId);
    const them = g.teams.find(t => t.team?.id !== teamId);
    if (!us || !them) continue;
    const ourScore   = aflScore(num(us.statistics?.scoring?.goals),   num(us.statistics?.scoring?.behinds));
    const theirScore = aflScore(num(them.statistics?.scoring?.goals), num(them.statistics?.scoring?.behinds));
    totalMargin += ourScore - theirScore;
    if (ourScore > theirScore)       wins++;
    else if (ourScore === theirScore) draws++;
    else                              losses++;
  }
  const played = wins + draws + losses;
  const winPct = played > 0 ? Math.round((wins / played) * 100) : null;
  const avgMargin = played > 0 ? (totalMargin / played).toFixed(1) : null;

  // Recent 8 games with result info for the bar chart
  const recentGames = teamGames.slice(0, 8).map(g => {
    const us   = g.teams.find(t => t.team?.id === teamId);
    const them = g.teams.find(t => t.team?.id !== teamId);
    const ourScore   = aflScore(num(us?.statistics?.scoring?.goals),   num(us?.statistics?.scoring?.behinds));
    const theirScore = aflScore(num(them?.statistics?.scoring?.goals), num(them?.statistics?.scoring?.behinds));
    const won  = ourScore > theirScore;
    const drew = ourScore === theirScore;
    const oppName = TEAM_ID_MAP[them?.team?.id ?? 0] ?? "";
    const squiggleId = API_SPORTS_TO_SQUIGGLE[g.gameId];
    return { g, ourScore, theirScore, won, drew, oppName, squiggleId };
  });
  const maxMargin = Math.max(...recentGames.map(r => Math.abs(r.ourScore - r.theirScore)), 1);

  // Fetch Squiggle for round numbers
  const squiggleMap = new Map<number, { round: number | string }>();
  try {
    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${new Date().getFullYear()}`,
      { headers: { "User-Agent": "Foopy AFL App (foopy.app)" }, next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const json = await res.json();
      for (const g of json.games ?? []) squiggleMap.set(Number(g.id), { round: g.round });
    }
  } catch {}

  return (
    <main style={pageStyle} className="page-enter">
      <div style={topBarStyle}><BackButton /></div>

      <div style={wrapStyle}>

        {/* ── Hero ── */}
        <section style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", background: "#080808" }}>
          <div style={{ height: 90, background: `linear-gradient(135deg,${color}cc,${color}44)`, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 40%,#080808)" }} />
          </div>
          <div style={{ padding: "0 20px 24px", marginTop: -56, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
              <TeamLogoImage src={logo} name={teamName} color={color} />
              <div style={{ paddingBottom: 4 }}>
                <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1.1 }}>{teamName}</h1>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {played > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8" }}>
                      {wins}W–{losses}L{draws > 0 ? `–${draws}D` : ""}
                    </span>
                  )}
                  {winPct !== null && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 999, padding: "2px 8px" }}>
                      {winPct}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Results bar chart ── */}
        {recentGames.length > 0 && (
          <section style={{ ...cardStyle, display: "flex", gap: 0, padding: 0, overflow: "hidden", borderLeft: `3px solid ${color}` }}>
            {/* Left — season record */}
            <div style={{
              flexShrink: 0, width: 96, display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "center", padding: "20px 0",
              borderRight: "1px solid rgba(255,255,255,.08)",
              background: `linear-gradient(160deg, ${color}28 0%, transparent 100%)`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Record</div>
              <div style={{
                fontSize: 34, fontWeight: 950, letterSpacing: "-0.05em", lineHeight: 1,
                color: wins > losses ? "#22c55e" : losses > wins ? "#ef4444" : "#facc15",
                textShadow: `0 0 24px ${wins > losses ? "#22c55e55" : losses > wins ? "#ef444455" : "#facc1555"}`,
              }}>
                {wins}–{losses}
              </div>
              {draws > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: "#facc15", marginTop: 5 }}>{draws}D</div>}
              {avgMargin !== null && (
                <div style={{ fontSize: 11, fontWeight: 800, color: Number(avgMargin) >= 0 ? "#22c55e99" : "#ef444499", marginTop: 8, letterSpacing: "0.01em" }}>
                  {Number(avgMargin) > 0 ? "+" : ""}{avgMargin} avg
                </div>
              )}
            </div>

            {/* Right — differential bar chart */}
            <div style={{ flex: 1, padding: "14px 12px 10px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Recent differentials</div>
              <div style={{ display: "flex", gap: 3, alignItems: "stretch", flex: 1 }}>
                {[...recentGames].reverse().map((r, i) => {
                  const margin   = r.ourScore - r.theirScore;
                  const barColor = r.won ? "#22c55e" : r.drew ? "#facc15" : "#ef4444";
                  const barGlow  = r.won ? "#22c55e" : r.drew ? "#facc15" : "#ef4444";
                  const MAX_H    = 48;
                  const barH     = margin === 0 ? 0 : Math.max(8, (Math.abs(margin) / maxMargin) * MAX_H);
                  const oppLogo  = LOGO_MAP[r.oppName] ?? "";
                  const sq       = r.squiggleId ? squiggleMap.get(Number(r.squiggleId)) : undefined;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      {/* Top half — positive bars */}
                      <div style={{ height: MAX_H, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                        {margin > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%" }}>
                            <span style={{ fontSize: 11, fontWeight: 900, color: barColor, lineHeight: 1, letterSpacing: "-0.02em" }}>+{margin}</span>
                            <div style={{ width: "88%", background: barColor, borderRadius: "4px 4px 0 0", height: barH, boxShadow: `0 -4px 12px ${barGlow}55` }} />
                          </div>
                        )}
                      </div>
                      {/* Baseline */}
                      <div style={{ width: "100%", height: 1.5, background: "rgba(255,255,255,.18)", flexShrink: 0 }} />
                      {/* Bottom half — negative bars */}
                      <div style={{ height: MAX_H, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
                        {margin < 0 && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%" }}>
                            <div style={{ width: "88%", background: barColor, borderRadius: "0 0 4px 4px", height: barH, boxShadow: `0 4px 12px ${barGlow}55` }} />
                            <span style={{ fontSize: 11, fontWeight: 900, color: barColor, lineHeight: 1, letterSpacing: "-0.02em" }}>{margin}</span>
                          </div>
                        )}
                        {margin === 0 && (
                          <div style={{ width: "88%", background: barColor, borderRadius: 2, height: 4 }} />
                        )}
                      </div>
                      {/* Opponent logo */}
                      <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.1)", flexShrink: 0, marginTop: 6 }}>
                        {oppLogo && <img src={oppLogo} alt={r.oppName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      {/* Round number */}
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", marginTop: 3, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                        {sq ? `R${sq.round}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Season stats ── */}
        {played > 0 && (
          <section style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={sectionLabel}>Season record</div>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#475569", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 999, padding: "3px 10px", letterSpacing: "0.04em" }}>
                {played} games
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[
                { label: "Wins", value: String(wins), accent: true },
                { label: "Win %", value: winPct !== null ? `${winPct}%` : "—", accent: false },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{
                  background: accent ? `${color}18` : "rgba(255,255,255,.04)",
                  border: `1px solid ${accent ? `${color}35` : "rgba(255,255,255,.07)"}`,
                  borderRadius: 16, padding: "16px 14px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: accent ? `${color}cc` : "#475569", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{label}</div>
                  <div style={{ fontSize: 32, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1, color: accent ? color : "#f8fafc" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Losses", value: String(losses) },
                { label: "Draws",  value: String(draws) },
                { label: "Avg Margin", value: avgMargin !== null ? `${Number(avgMargin) > 0 ? "+" : ""}${avgMargin}` : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "11px 10px", textAlign: "center" as const }}>
                  <div style={{ fontSize: 19, fontWeight: 950, letterSpacing: "-0.03em", color: "#e2e8f0", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#475569", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent results ── */}
        {recentGames.length > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabel}>Season results</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentGames.map((r, i) => {
                const sq = r.squiggleId ? squiggleMap.get(Number(r.squiggleId)) : undefined;
                const resultColor = r.won ? "#22c55e" : r.drew ? "#facc15" : "#ef4444";
                const resultLabel = r.won ? "W" : r.drew ? "D" : "L";
                const oppLogo = LOGO_MAP[r.oppName] ?? "";
                const margin = r.ourScore - r.theirScore;

                return (
                  <Link key={i} href={r.squiggleId ? `/match/${r.squiggleId}` : "#"} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", textDecoration: "none", color: "inherit" }}>
                    {/* Round / date */}
                    <div style={{ minWidth: 52, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 4 }}>
                      {sq
                        ? <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", whiteSpace: "nowrap" }}>Rd {sq.round}</div>
                        : <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>{formatDate(r.g.date)}</div>
                      }
                      {oppLogo && (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,.08)" }}>
                          <img src={oppLogo} alt={r.oppName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      )}
                    </div>
                    <div style={{ width: 1, height: 40, background: "rgba(255,255,255,.08)", flexShrink: 0 }} />
                    {/* Opponent name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>vs {r.oppName}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginTop: 2 }}>
                        {r.ourScore}–{r.theirScore}
                        <span style={{ marginLeft: 6, color: margin > 0 ? "#22c55e" : margin < 0 ? "#ef4444" : "#facc15" }}>
                          ({margin > 0 ? "+" : ""}{margin})
                        </span>
                      </div>
                    </div>
                    {/* W/L badge */}
                    <div style={{ flexShrink: 0, minWidth: 42, textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", color: resultColor }}>{resultLabel}</div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: "0.06em" }}>RESULT</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Squad ── */}
        <section style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={sectionLabel}>Squad</div>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#475569", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 999, padding: "3px 10px" }}>
              {roster.length} players
            </span>
          </div>

          {/* Team avg foopy header */}
          {teamAvgFoopy !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 10, borderRadius: 12, background: `${color}12`, border: `1px solid ${color}28` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", flex: 1 }}>Squad avg Foopy</div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: foopyColor(teamAvgFoopy) }}>{teamAvgFoopy.toFixed(1)}</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {roster.map(({ player, season, avgFoopy }) => (
              <Link key={player.id} href={`/player/${player.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", textDecoration: "none", color: "inherit" }}>
                <div style={{ width: 26, flexShrink: 0, textAlign: "center" }}>
                  {season?.jerseyNumber
                    ? <span style={{ fontSize: 12, fontWeight: 900, color: "#475569" }}>#{season.jerseyNumber}</span>
                    : <span style={{ fontSize: 12, color: "#334155" }}>—</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                  {season?.position && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: color, letterSpacing: "0.06em", marginTop: 1 }}>{season.position}</div>
                  )}
                </div>
                {avgFoopy !== null
                  ? <div style={{ flexShrink: 0, textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: "-0.04em", color: foopyColor(avgFoopy) }}>{avgFoopy.toFixed(1)}</div>
                      <div style={{ fontSize: 8, fontWeight: 800, color: "#334155", letterSpacing: "0.06em" }}>FOOPY</div>
                    </div>
                  : <div style={{ flexShrink: 0, fontSize: 12, color: "#334155", fontWeight: 700 }}>—</div>
                }
                <div style={{ flexShrink: 0, fontSize: 14, color: "#334155" }}>›</div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh", background: "#000", color: "#fff",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};
const topBarStyle: React.CSSProperties = {
  maxWidth: 680, margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 12px) 20px 10px",
};
const wrapStyle: React.CSSProperties = {
  maxWidth: 680, margin: "0 auto", padding: "0 12px",
  display: "flex", flexDirection: "column", gap: 12,
};
const cardStyle: React.CSSProperties = {
  background: "#080808", border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18, padding: "18px 16px 20px",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
};
