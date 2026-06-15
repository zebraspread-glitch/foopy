import path from "path";
import fs from "fs";
import Link from "next/link";
import { foopyColor } from "@/app/lib/foopyRating";
import { computeAvgFoopyMap } from "@/app/lib/computeAvgFoopy.server";

type PlayerInfo = {
  id: string;
  name: string;
  team: string;
  apiSportsId?: number | null;
  statsIds?: number[];
};


const TEAMS = [
  { name: "Adelaide", slug: "adelaide", logo: "/team-logos/crows.png", color: "#002b5c" },
  { name: "Brisbane Lions", slug: "brisbanelions", logo: "/team-logos/lions.png", color: "#a50034" },
  { name: "Carlton", slug: "carlton", logo: "/team-logos/blues.png", color: "#031a35" },
  { name: "Collingwood", slug: "collingwood", logo: "/team-logos/magpies.png", color: "#1e1e28" },
  { name: "Essendon", slug: "essendon", logo: "/team-logos/bombers.png", color: "#cc0000" },
  { name: "Fremantle", slug: "fremantle", logo: "/team-logos/dockers.png", color: "#4b1979" },
  { name: "Geelong", slug: "geelong", logo: "/team-logos/cats.png", color: "#003b73" },
  { name: "Gold Coast", slug: "goldcoast", logo: "/team-logos/suns.png", color: "#c0392b" },
  { name: "GWS", slug: "gws", logo: "/team-logos/giants.png", color: "#e05a1a" },
  { name: "Hawthorn", slug: "hawthorn", logo: "/team-logos/hawks.png", color: "#6b3a1f" },
  { name: "Melbourne", slug: "melbourne", logo: "/team-logos/demons.png", color: "#c8102e" },
  { name: "North Melbourne", slug: "northmelbourne", logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide", slug: "portadelaide", logo: "/team-logos/power.png", color: "#008999" },
  { name: "Richmond", slug: "richmond", logo: "/team-logos/tigers.png", color: "#272731" },
  { name: "St Kilda", slug: "stkilda", logo: "/team-logos/saints.png", color: "#c8102e" },
  { name: "Sydney", slug: "sydney", logo: "/team-logos/swans.png", color: "#c0392b" },
  { name: "West Coast", slug: "westcoast", logo: "/team-logos/eagles.png", color: "#003087" },
  { name: "Western Bulldogs", slug: "westernbulldogs", logo: "/team-logos/bulldogs.png", color: "#1a4abf" },
];


export default async function TeamAveragePage() {
  const dataDir = path.join(process.cwd(), "app", "data");
  const players: PlayerInfo[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));

  // Use the same avgFoopy computation as the player profile page (game-stats.json + match_cache)
  const avgFoopyMap = await computeAvgFoopyMap();

  function getPlayerAvgFoopy(player: PlayerInfo): number | null {
    const ids = new Set<number>();
    if (player.apiSportsId) ids.add(Number(player.apiSportsId));
    for (const sid of player.statsIds ?? []) ids.add(Number(sid));
    for (const id of ids) {
      const avg = avgFoopyMap.get(id);
      if (avg !== undefined) return avg;
    }
    return null;
  }

  const rankings = TEAMS.map((team) => {
    const rated = players
      .filter((player) => player.team === team.name)
      .map(getPlayerAvgFoopy)
      .filter((r): r is number => r !== null);
    const average = rated.length ? rated.reduce((sum, r) => sum + r, 0) / rated.length : null;
    return { ...team, average, ratedCount: rated.length };
  })
    .filter((team): team is typeof TEAMS[number] & { average: number; ratedCount: number } => team.average !== null)
    .sort((a, b) => b.average - a.average);

  return (
    <main style={pageStyle}>
      <div style={wrapStyle}>
        <Link href=".." style={backStyle}>Back</Link>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Team Average</h1>
            <p style={subStyle}>Teams ranked by average player Foopy rating</p>
          </div>
          <span style={countStyle}>{rankings.length} teams</span>
        </header>

        <section style={cardStyle}>
          {rankings.map((team, index) => (
            <Link key={team.slug} href={`/team/${team.slug}`} style={rowStyle}>
              <div style={rankStyle}>{index + 1}</div>
              <div style={{ ...logoWrapStyle, background: `${team.color}22`, borderColor: `${team.color}55` }}>
                <img src={team.logo} alt={team.name} style={logoStyle} />
              </div>
              <div style={bodyStyle}>
                <div style={nameStyle}>{team.name}</div>
                <div style={metaStyle}>{team.ratedCount} rated players</div>
              </div>
              <div style={{ ...ratingStyle, background: foopyColor(team.average) }}>{team.average.toFixed(1)}</div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 14px) 12px 0",
};

const backStyle: React.CSSProperties = {
  display: "inline-flex",
  color: "#60a5fa",
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 900,
  margin: "0 0 12px 6px",
};

const headerStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  gap: 14,
  padding: "0 6px 14px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--text-1)",
  fontSize: 26,
  fontWeight: 950,
  letterSpacing: "-0.04em",
};

const subStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--text-3)",
  fontSize: 12,
  fontWeight: 800,
};

const countStyle: React.CSSProperties = {
  position: "absolute",
  right: 6,
  top: 0,
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 850,
  color: "var(--text-3)",
  background: "var(--border-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 999,
  padding: "5px 10px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  overflow: "hidden",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderBottom: "1px solid var(--border-1)",
  textDecoration: "none",
  color: "inherit",
};

const rankStyle: React.CSSProperties = {
  width: 24,
  color: "var(--text-3)",
  fontSize: 13,
  fontWeight: 950,
  textAlign: "right",
  flexShrink: 0,
};

const logoWrapStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  overflow: "hidden",
  border: "1px solid var(--border-3)",
  flexShrink: 0,
};

const logoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const nameStyle: React.CSSProperties = {
  color: "var(--text-1)",
  fontSize: 15,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  color: "var(--text-3)",
  fontSize: 11,
  fontWeight: 800,
  marginTop: 3,
};

const ratingStyle: React.CSSProperties = {
  minWidth: 50,
  borderRadius: 9,
  padding: "5px 11px 6px",
  color: "var(--text-1)",
  fontSize: 16,
  fontWeight: 950,
  lineHeight: 1,
  textAlign: "center",
};
