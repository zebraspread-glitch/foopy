"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerInfo = {
  id: string; name: string; team: string; apiSportsId: number | null;
};

type SeasonStats = {
  position?: string; jerseyNumber?: number; games?: number;
  goals?: number; goalAssists?: number; behinds?: number;
  disposals?: number; kicks?: number; handballs?: number;
  marks?: number; tackles?: number; hitouts?: number; clearances?: number;
  goalAvg?: number;
};

type GamePerf = {
  gameId: number; date: string; foopy: number;
  goals: number; goalAssists: number; disposals: number;
  kicks: number; handballs: number; marks: number;
  tackles: number; hitouts: number; clearances: number;
};

type PlayerData = { player: PlayerInfo; season: SeasonStats | null; recentGames: GamePerf[] };

// ── Team helpers ──────────────────────────────────────────────────────────────

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns", gwsgiants: "giants",
  gws: "giants", hawthorn: "hawks", melbourne: "demons",
  northmelbourne: "kangaroos", portadelaide: "power", richmond: "tigers",
  stkilda: "saints", sydney: "swans", westcoast: "eagles",
  westernbulldogs: "bulldogs",
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

function slugTeam(team: string) {
  return team.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamFolder(team: string): string {
  return CLUB_FOLDER[slugTeam(team)] ?? slugTeam(team);
}

function playerImgSrc(name: string, team: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const folder = teamFolder(team);
  return `/players/${folder}/${slug}.png`;
}

function teamColor(team: string): string {
  return TEAM_COLORS[team] ?? "#1e293b";
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function avg(total: number | undefined, games: number | undefined): string {
  if (!total || !games) return "—";
  return (total / games).toFixed(1);
}

function foopyColor(f: number): string {
  if (f >= 8)  return "#4ade80";
  if (f >= 6)  return "#a3e635";
  if (f >= 4)  return "#facc15";
  if (f >= 2)  return "#fb923c";
  return "#f87171";
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const params  = useParams();
  const router  = useRouter();
  const slug    = String(params?.slug ?? "");

  const [data,    setData]    = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgErr,  setImgErr]  = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/player/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}>
          <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
        </div>
        <div style={wrapStyle}>
          <div className="skeleton" style={{ height: 200, borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 140, borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 18 }} />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={pageStyle}>
        <div style={topBarStyle}>
          <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 12 }}>
          <div style={{ fontSize: 48 }}>🏈</div>
          <p style={{ color: "#64748b", fontWeight: 800, fontSize: 16 }}>Player not found</p>
          <button onClick={() => router.back()} style={{ padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Go back</button>
        </div>
      </main>
    );
  }

  const { player, season, recentGames } = data;
  const color   = teamColor(player.team);
  const imgSrc  = playerImgSrc(player.name, player.team);
  const games   = season?.games ?? 0;
  const avgFoopy = recentGames.length
    ? (recentGames.reduce((s, g) => s + g.foopy, 0) / recentGames.length).toFixed(1)
    : null;

  const statGrid = [
    { label: "Goals",      value: season?.goalAvg?.toFixed(1) ?? avg(season?.goals, games) },
    { label: "Disposals",  value: season?.disposals?.toFixed(1) ?? avg(season?.disposals, games) },
    { label: "Kicks",      value: season?.kicks?.toFixed(1)     ?? avg(season?.kicks, games) },
    { label: "Marks",      value: season?.marks?.toFixed(1)     ?? avg(season?.marks, games) },
    { label: "Tackles",    value: season?.tackles?.toFixed(1)   ?? avg(season?.tackles, games) },
    { label: "Hitouts",    value: season?.hitouts?.toFixed(1)   ?? avg(season?.hitouts, games) },
    { label: "Clearances", value: season?.clearances?.toFixed(1) ?? avg(season?.clearances, games) },
    { label: "Games",      value: String(games || "—") },
  ];

  return (
    <main style={pageStyle} className="page-enter">
      <div style={topBarStyle}>
        <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
      </div>

      <div style={wrapStyle}>

        {/* ── Hero card ── */}
        <section style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", background: "#080808", position: "relative" }}>
          {/* Team colour band */}
          <div style={{ height: 90, background: `linear-gradient(135deg, ${color}cc, ${color}44)`, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, #080808)" }} />
          </div>

          <div style={{ padding: "0 20px 24px", marginTop: -56, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: color, border: "3px solid #080808", boxShadow: `0 0 0 2px rgba(255,255,255,.12)`, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!imgErr ? (
                  <img src={imgSrc} alt={player.name} onError={() => setImgErr(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 36, fontWeight: 950, color: "#fff" }}>
                    {player.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name + meta */}
              <div style={{ paddingBottom: 4 }}>
                <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1.1 }}>
                  {player.name}
                </h1>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8" }}>{player.team}</span>
                  {season?.position && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 999, padding: "2px 8px" }}>
                      {season.position}
                    </span>
                  )}
                  {season?.jerseyNumber && (
                    <span style={{ fontSize: 11, fontWeight: 900, color: "#64748b" }}>#{season.jerseyNumber}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Foopy avg pill */}
            {avgFoopy && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "10px 16px" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Avg Foopy</div>
                  <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.04em", color: foopyColor(Number(avgFoopy)) }}>{avgFoopy}</div>
                </div>
                <div style={{ width: 1, height: 32, background: "rgba(255,255,255,.1)" }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Last {recentGames.length} games</div>
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end", marginTop: 4 }}>
                    {recentGames.slice().reverse().map((g, i) => (
                      <div key={i} title={`${formatDate(g.date)}: ${g.foopy}`}
                        style={{ width: 8, borderRadius: 3, background: foopyColor(g.foopy), height: Math.max(6, g.foopy / 10 * 28) }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Season averages ── */}
        {season && games > 0 && (
          <section style={cardStyle}>
            <div style={sectionLabelStyle}>Season averages</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,.06)", borderRadius: 12, overflow: "hidden" }}>
              {statGrid.map(({ label, value }) => (
                <div key={label} style={{ background: "#080808", padding: "12px 8px", textAlign: "center" as const }}>
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
            <div style={sectionLabelStyle}>Recent performances</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentGames.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                  {/* Date */}
                  <div style={{ minWidth: 44, textAlign: "center" as const, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>{formatDate(g.date)}</div>
                  </div>

                  <div style={{ width: 1, height: 32, background: "rgba(255,255,255,.08)", flexShrink: 0 }} />

                  {/* Key stats */}
                  <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "center" }}>
                    {g.goals > 0 && <StatChip label="G" value={g.goals} />}
                    <StatChip label="D" value={g.disposals} />
                    <StatChip label="K" value={g.kicks} />
                    <StatChip label="M" value={g.marks} />
                    <StatChip label="T" value={g.tackles} />
                    {g.hitouts > 0 && <StatChip label="HO" value={g.hitouts} />}
                  </div>

                  {/* Foopy badge */}
                  <div style={{ flexShrink: 0, minWidth: 42, textAlign: "center" as const }}>
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
            <p style={{ textAlign: "center" as const, color: "#334155", fontWeight: 700, fontSize: 14, padding: "24px 0" }}>
              No stats available yet for this player.
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
  minHeight: "100dvh",
  background: "#000",
  color: "#fff",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const topBarStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 12px) 20px 10px",
};

const backBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#60a5fa",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "0 12px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
  padding: "18px 16px 20px",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 14,
};
