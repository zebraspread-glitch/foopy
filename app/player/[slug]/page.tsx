import path from "path";
import fs from "fs";
import { BackButton, PlayerHeroImage } from "./PlayerClient";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerInfo  = { id: string; name: string; team: string; apiSportsId?: number | null };
type SeasonStats = {
  id: string; position?: string; jerseyNumber?: number; games?: number;
  goals?: number; goalAssists?: number; behinds?: number;
  disposals?: number; kicks?: number; handballs?: number;
  marks?: number; tackles?: number; hitouts?: number; clearances?: number;
  goalAvg?: number; freesFor?: number; freesAgainst?: number;
  totalKicks?: number; totalHandballs?: number; totalMarks?: number;
  totalTackles?: number; totalHitouts?: number; totalClearances?: number;
};
type GamePerf = {
  gameId: number; date: string; foopy: number; goals: number;
  disposals: number; kicks: number; marks: number; tackles: number; hitouts: number;
  opponentTeam: string; round: number | string | null;
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

const TEAM_ID_MAP: Record<number, string> = {
  1: "Adelaide", 2: "Brisbane Lions", 3: "Carlton", 4: "Collingwood",
  5: "Essendon", 6: "Fremantle", 7: "Geelong", 8: "Hawthorn",
  9: "Melbourne", 10: "North Melbourne", 11: "Port Adelaide", 12: "Richmond",
  13: "St Kilda", 14: "Sydney", 15: "West Coast", 16: "Western Bulldogs",
  17: "Gold Coast", 18: "GWS",
};

function getLogoSrc(team: string): string {
  const map: Record<string, string> = {
    Adelaide: "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
    Brisbane: "/team-logos/lions.png", Carlton: "/team-logos/blues.png",
    Collingwood: "/team-logos/magpies.png", Essendon: "/team-logos/bombers.png",
    Fremantle: "/team-logos/dockers.png", Geelong: "/team-logos/cats.png",
    "Geelong Cats": "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
    GWS: "/team-logos/giants.png", "GWS Giants": "/team-logos/giants.png",
    "Greater Western Sydney": "/team-logos/giants.png",
    Hawthorn: "/team-logos/hawks.png", Melbourne: "/team-logos/demons.png",
    "North Melbourne": "/team-logos/kangaroos.png", "Port Adelaide": "/team-logos/power.png",
    Richmond: "/team-logos/tigers.png", "St Kilda": "/team-logos/saints.png",
    Sydney: "/team-logos/swans.png", "West Coast": "/team-logos/eagles.png",
    "Western Bulldogs": "/team-logos/bulldogs.png",
  };
  return map[team] ?? "/team-logos/crows.png";
}

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns", gwsgiants: "giants",
  gws: "giants", hawthorn: "hawks", melbourne: "demons",
  northmelbourne: "kangaroos", portadelaide: "power", richmond: "tigers",
  stkilda: "saints", sydney: "swans", westcoast: "eagles", westernbulldogs: "bulldogs",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Brisbane: "#a50034",
  Carlton: "#031a35", Collingwood: "#111111", Essendon: "#cc0000",
  Fremantle: "#4b1979", "Geelong Cats": "#003b73", Geelong: "#003b73",
  "Gold Coast": "#c0392b", "GWS Giants": "#e05a1a", GWS: "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#1a1a1a", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

function slugTeam(t: string) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function teamColor(t: string) { return TEAM_COLORS[t] ?? "#1e293b"; }
function playerImgSrc(name: string, team: string) {
  const slug   = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const folder = CLUB_FOLDER[slugTeam(team)] ?? slugTeam(team);
  return `/players/${folder}/${slug}.png`;
}

function mixColor(a: string, b: string, amount: number) {
  const ah = a.replace("#", ""), bh = b.replace("#", "");
  const ar = parseInt(ah.substring(0, 2), 16), ag = parseInt(ah.substring(2, 4), 16), ab = parseInt(ah.substring(4, 6), 16);
  const br = parseInt(bh.substring(0, 2), 16), bg = parseInt(bh.substring(2, 4), 16), bb = parseInt(bh.substring(4, 6), 16);
  return `rgb(${Math.round(ar + amount * (br - ar))}, ${Math.round(ag + amount * (bg - ag))}, ${Math.round(ab + amount * (bb - ab))})`;
}

function foopyColor(f: number): string {
  const v = Math.max(1, Math.min(10, f));
  if (v >= 10) return "linear-gradient(135deg, #ffd700, #ff8c00)";
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Page (Server Component) ───────────────────────────────────────────────────

export default async function PlayerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dataDir = path.join(process.cwd(), "app", "data");

  const players:    PlayerInfo[]    = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const seasonData: SeasonStats[]   = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const gameStats:  Record<string, {
    gameId: number; date: string;
    teams: { players: { player: { id: number }; goals: { total: number; assists: number };
      behinds: number; disposals: number; kicks: number; handballs: number;
      marks: number; tackles: number; hitouts: number; clearances: number;
      free_kicks: { for: number; against: number } }[] }[];
  }> = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  const player = players.find(p => p.id === slug) ?? null;

  if (!player) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}><BackButton /></div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 12 }}>
          <div style={{ fontSize: 48 }}>🏈</div>
          <p style={{ color: "#64748b", fontWeight: 800, fontSize: 16 }}>Player not found</p>
        </div>
      </main>
    );
  }

  const season = seasonData.find(p => p.id === slug) ?? null;

  // Fetch Squiggle for round numbers
  const squiggleMap = new Map<number, { round: number | string; hteam: string; ateam: string }>();
  try {
    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${new Date().getFullYear()}`,
      { headers: { "User-Agent": "Foopy AFL App (foopy.app)" }, next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const json = await res.json();
      for (const g of json.games ?? []) {
        squiggleMap.set(Number(g.id), { round: g.round, hteam: g.hteam, ateam: g.ateam });
      }
    }
  } catch {}

  const recentGames: GamePerf[] = [];
  if (player.apiSportsId) {
    const id = player.apiSportsId;
    const sorted = Object.values(gameStats)
      .filter(g => g.teams?.some(t => t.players?.some(p => p.player?.id === id)))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const g of sorted) {
      for (const t of g.teams ?? []) {
        const ps = t.players?.find(p => p.player?.id === id);
        if (!ps) continue;

        // Opponent = the other team in this game
        const opponentTeamEntry = g.teams.find(ot => ot !== t);
        const opponentTeamId = opponentTeamEntry?.team?.id as number | undefined;
        const opponentTeam = opponentTeamId ? (TEAM_ID_MAP[opponentTeamId] ?? "") : "";

        const sq = squiggleMap.get(g.gameId);

        recentGames.push({
          gameId:       g.gameId,
          date:         g.date,
          goals:        num(ps.goals?.total),
          disposals:    num(ps.disposals),
          kicks:        num(ps.kicks),
          marks:        num(ps.marks),
          tackles:      num(ps.tackles),
          hitouts:      num(ps.hitouts),
          opponentTeam,
          round:        sq?.round ?? null,
          foopy: foopyRating({
            goals: num(ps.goals?.total), goalAssists: num(ps.goals?.assists),
            behinds: num(ps.behinds), kicks: num(ps.kicks), handballs: num(ps.handballs),
            marks: num(ps.marks), tackles: num(ps.tackles), hitouts: num(ps.hitouts),
            disposals: num(ps.disposals), clearances: num(ps.clearances),
            freesFor: num(ps.free_kicks?.for), freesAgainst: num(ps.free_kicks?.against),
          }),
        });
        break;
      }
    }
  }

  const color    = teamColor(player.team);
  const imgSrc   = playerImgSrc(player.name, player.team);
  const games    = season?.games ?? 0;
  const avgFoopy = recentGames.length
    ? (recentGames.reduce((s, g) => s + g.foopy, 0) / recentGames.length)
    : null;

  const statGrid = [
    { label: "Goals",      value: season?.goalAvg?.toFixed(1)    ?? (games ? ((season?.goals  ?? 0) / games).toFixed(1) : "—") },
    { label: "Disposals",  value: season?.disposals?.toFixed(1)  ?? "—" },
    { label: "Kicks",      value: season?.kicks?.toFixed(1)       ?? "—" },
    { label: "Marks",      value: season?.marks?.toFixed(1)       ?? "—" },
    { label: "Tackles",    value: season?.tackles?.toFixed(1)     ?? "—" },
    { label: "Hitouts",    value: season?.hitouts?.toFixed(1)     ?? "—" },
    { label: "Clearances", value: season?.clearances?.toFixed(1)  ?? "—" },
    { label: "Games",      value: games > 0 ? String(games) : "—" },
  ];

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
              <PlayerHeroImage src={imgSrc} name={player.name} color={color} />
              <div style={{ paddingBottom: 4 }}>
                <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1.1 }}>{player.name}</h1>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8" }}>{player.team}</span>
                  {season?.position && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 999, padding: "2px 8px" }}>{season.position}</span>
                  )}
                  {season?.jerseyNumber && (
                    <span style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>#{season.jerseyNumber}</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── Foopy rating ── */}
        {avgFoopy !== null && (
          <section style={{ ...cardStyle, display: "flex", gap: 0, padding: 0, overflow: "hidden" }}>
            {/* Left — avg rating */}
            <div style={{ flexShrink: 0, width: 90, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 0", borderRight: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Avg Foopy</div>
              <div style={{ fontSize: 40, fontWeight: 950, letterSpacing: "-0.05em", lineHeight: 1, color: foopyColor(avgFoopy) }}>{avgFoopy.toFixed(1)}</div>
            </div>
            {/* Right — bar chart */}
            <div style={{ flex: 1, padding: "16px 14px 12px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Last 10 games</div>
              <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
                {[...recentGames].slice(0, 10).reverse().map((g, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{g.foopy.toFixed(1)}</span>
                    <div style={{ width: "70%", borderRadius: 4, background: foopyColor(g.foopy), height: Math.max(14, (g.foopy / 10) * 52) }} />
                    <div style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,.08)", flexShrink: 0 }}>
                      {g.opponentTeam && <img src={getLogoSrc(g.opponentTeam)} alt={g.opponentTeam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Season averages ── */}
        {season && games > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabel}>Season averages</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,.06)", borderRadius: 12, overflow: "hidden" }}>
              {statGrid.map(({ label, value }) => (
                <div key={label} style={{ background: "#080808", padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 950, letterSpacing: "-0.03em", color: "#f8fafc" }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#475569", marginTop: 2, letterSpacing: "0.04em" }}>{label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent performances ── */}
        {recentGames.length > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabel}>Season performances</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentGames.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ minWidth: 52, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 4 }}>
                    {g.round !== null
                      ? <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", whiteSpace: "nowrap" }}>Rd {g.round}</div>
                      : <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>{formatDate(g.date)}</div>
                    }
                    {g.opponentTeam && (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,.08)", flexShrink: 0 }}>
                        <img src={getLogoSrc(g.opponentTeam)} alt={g.opponentTeam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ width: 1, height: 40, background: "rgba(255,255,255,.08)", flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    {g.goals > 0 && <StatChip label="G"  value={g.goals} />}
                    <StatChip label="D"  value={g.disposals} />
                    <StatChip label="K"  value={g.kicks} />
                    <StatChip label="M"  value={g.marks} />
                    <StatChip label="T"  value={g.tackles} />
                    {g.hitouts > 0 && <StatChip label="HO" value={g.hitouts} />}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 42, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", color: foopyColor(g.foopy) }}>{g.foopy.toFixed(1)}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: "0.06em" }}>FOOPY</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!season && recentGames.length === 0 && (
          <section style={cardStyle}>
            <p style={{ textAlign: "center", color: "#334155", fontWeight: 700, fontSize: 14, padding: "24px 0", margin: 0 }}>
              No stats available for this player yet.
            </p>
          </section>
        )}

      </div>
    </main>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 24 }}>
      <span style={{ fontSize: 13, fontWeight: 900, color: "#e2e8f0" }}>{value}</span>
      <span style={{ fontSize: 9, fontWeight: 800, color: "#475569", letterSpacing: "0.04em" }}>{label}</span>
    </div>
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
