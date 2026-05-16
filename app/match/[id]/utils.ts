import playerStatsJson from "@/app/data/players.json";
import type { MatchGame, PlayerStat, SavedMatchStats, LiveEvent } from "./types";

export function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function scoreText(score: any) {
  return num(score);
}

export function statValue(value: any) {
  return value ?? 0;
}

export function getStatus(game: MatchGame | null) {
  if (!game) return "UPCOMING";
  const complete = Number(game.complete ?? 0);
  if (complete >= 100 || game.is_final === 1) return "FINAL";
  if (complete > 0 && complete < 100) return "LIVE";
  return "UPCOMING";
}

export function getApiSportsGameId(saved: SavedMatchStats | null, pageId: string) {
  return saved?.apiSportsGameId ?? saved?.apiSportsId ?? saved?.aflApiId ?? saved?.matchId ?? pageId;
}

export function getAbbr(team: string) {
  const map: Record<string, string> = {
    Adelaide: "ADE",
    "Adelaide Crows": "ADE",
    Brisbane: "BRI",
    "Brisbane Lions": "BRI",
    Carlton: "CAR",
    Collingwood: "COL",
    Essendon: "ESS",
    Fremantle: "FRE",
    Geelong: "GEE",
    "Geelong Cats": "GEE",
    "Gold Coast": "GC",
    "Gold Coast Suns": "GC",
    GWS: "GWS",
    "GWS Giants": "GWS",
    "Greater Western Sydney": "GWS",
    "Greater Western Sydney Giants": "GWS",
    Hawthorn: "HAW",
    Melbourne: "MEL",
    "North Melbourne": "NM",
    "Port Adelaide": "PA",
    Richmond: "RIC",
    "St Kilda": "STK",
    Sydney: "SYD",
    "West Coast": "WCE",
    "Western Bulldogs": "WB",
  };

  return map[team] ?? team.slice(0, 3).toUpperCase();
}

export function getLogo(team: string) {
  const map: Record<string, string> = {
    Adelaide: "/team-logos/crows.png",
    "Adelaide Crows": "/team-logos/crows.png",
    Brisbane: "/team-logos/lions.png",
    "Brisbane Lions": "/team-logos/lions.png",
    Carlton: "/team-logos/blues.png",
    Collingwood: "/team-logos/magpies.png",
    Essendon: "/team-logos/bombers.png",
    Fremantle: "/team-logos/dockers.png",
    Geelong: "/team-logos/cats.png",
    "Geelong Cats": "/team-logos/cats.png",
    "Gold Coast": "/team-logos/suns.png",
    "Gold Coast Suns": "/team-logos/suns.png",
    GWS: "/team-logos/giants.png",
    "GWS Giants": "/team-logos/giants.png",
    "Greater Western Sydney": "/team-logos/giants.png",
    "Greater Western Sydney Giants": "/team-logos/giants.png",
    Hawthorn: "/team-logos/hawks.png",
    "Hawthorn Hawks": "/team-logos/hawks.png",
    Melbourne: "/team-logos/demons.png",
    "North Melbourne": "/team-logos/kangaroos.png",
    "Port Adelaide": "/team-logos/power.png",
    "Port Adelaide Power": "/team-logos/power.png",
    Richmond: "/team-logos/tigers.png",
    "Richmond Tigers": "/team-logos/tigers.png",
    "St Kilda": "/team-logos/saints.png",
    "St Kilda Saints": "/team-logos/saints.png",
    Sydney: "/team-logos/swans.png",
    "Sydney Swans": "/team-logos/swans.png",
    "West Coast": "/team-logos/eagles.png",
    "West Coast Eagles": "/team-logos/eagles.png",
    "Western Bulldogs": "/team-logos/bulldogs.png",
  };

  return map[team] ?? "/team-logos/default.png";
}

export type TeamColourSet = {
  primary: string;
  secondary: string;
  home: string;
  away: string;
  text: string;
};

export function teamColors(team: string): TeamColourSet {
  const key = String(team || "").toLowerCase().trim();

  const map: Record<string, TeamColourSet> = {
    adelaide: { primary: "#002b5c", secondary: "#facc15", home: "#002b5c", away: "#facc15", text: "#ffffff" },
    "adelaide crows": { primary: "#002b5c", secondary: "#facc15", home: "#002b5c", away: "#facc15", text: "#ffffff" },

    brisbane: { primary: "#a50034", secondary: "#facc15", home: "#a50034", away: "#facc15", text: "#ffffff" },
    "brisbane lions": { primary: "#a50034", secondary: "#facc15", home: "#a50034", away: "#facc15", text: "#ffffff" },

    carlton: { primary: "#031a35", secondary: "#ffffff", home: "#031a35", away: "#ffffff", text: "#ffffff" },

    collingwood: { primary: "#ffffff", secondary: "#000000", home: "#000000", away: "#ffffff", text: "#000000" },

    essendon: { primary: "#ef4444", secondary: "#000000", home: "#ef4444", away: "#000000", text: "#ffffff" },

    fremantle: { primary: "#7c3aed", secondary: "#ffffff", home: "#7c3aed", away: "#ffffff", text: "#ffffff" },

    geelong: { primary: "#1e3a8a", secondary: "#ffffff", home: "#1e3a8a", away: "#ffffff", text: "#ffffff" },
    "geelong cats": { primary: "#1e3a8a", secondary: "#ffffff", home: "#1e3a8a", away: "#ffffff", text: "#ffffff" },

    "gold coast": { primary: "#ef4444", secondary: "#facc15", home: "#ef4444", away: "#facc15", text: "#ffffff" },
    "gold coast suns": { primary: "#ef4444", secondary: "#facc15", home: "#ef4444", away: "#facc15", text: "#ffffff" },

    gws: { primary: "#f97316", secondary: "#000000", home: "#f97316", away: "#000000", text: "#000000" },
    "gws giants": { primary: "#f97316", secondary: "#000000", home: "#f97316", away: "#000000", text: "#000000" },
    "greater western sydney": { primary: "#f97316", secondary: "#000000", home: "#f97316", away: "#000000", text: "#000000" },
    "greater western sydney giants": { primary: "#f97316", secondary: "#000000", home: "#f97316", away: "#000000", text: "#000000" },

    hawthorn: { primary: "#f59e0b", secondary: "#5b2a00", home: "#f59e0b", away: "#5b2a00", text: "#000000" },
    "hawthorn hawks": { primary: "#f59e0b", secondary: "#5b2a00", home: "#f59e0b", away: "#5b2a00", text: "#000000" },

    melbourne: { primary: "#ef4444", secondary: "#1e3a8a", home: "#ef4444", away: "#1e3a8a", text: "#ffffff" },
    "melbourne demons": { primary: "#ef4444", secondary: "#1e3a8a", home: "#ef4444", away: "#1e3a8a", text: "#ffffff" },

    "north melbourne": { primary: "#3b82f6", secondary: "#ffffff", home: "#3b82f6", away: "#ffffff", text: "#ffffff" },
    "north melbourne kangaroos": { primary: "#3b82f6", secondary: "#ffffff", home: "#3b82f6", away: "#ffffff", text: "#ffffff" },

    "port adelaide": { primary: "#06b6d4", secondary: "#000000", home: "#06b6d4", away: "#000000", text: "#000000" },
    "port adelaide power": { primary: "#06b6d4", secondary: "#000000", home: "#06b6d4", away: "#000000", text: "#000000" },

    richmond: { primary: "#facc15", secondary: "#000000", home: "#facc15", away: "#000000", text: "#000000" },
    "richmond tigers": { primary: "#facc15", secondary: "#000000", home: "#facc15", away: "#000000", text: "#000000" },

    "st kilda": { primary: "#ef4444", secondary: "#000000", home: "#ef4444", away: "#000000", text: "#ffffff" },
    "st kilda saints": { primary: "#ef4444", secondary: "#000000", home: "#ef4444", away: "#000000", text: "#ffffff" },

    sydney: { primary: "#ef4444", secondary: "#ffffff", home: "#ef4444", away: "#ffffff", text: "#ffffff" },
    "sydney swans": { primary: "#ef4444", secondary: "#ffffff", home: "#ef4444", away: "#ffffff", text: "#ffffff" },

    "west coast": { primary: "#003087", secondary: "#facc15", home: "#003087", away: "#facc15", text: "#ffffff" },
    "west coast eagles": { primary: "#003087", secondary: "#facc15", home: "#003087", away: "#facc15", text: "#ffffff" },

    "western bulldogs": { primary: "#2563eb", secondary: "#ef4444", home: "#2563eb", away: "#ef4444", text: "#ffffff" },
  };

  return map[key] ?? {
    primary: "#1f2937",
    secondary: "#94a3b8",
    home: "#1f2937",
    away: "#94a3b8",
    text: "#ffffff",
  };
}

export function teamColor(team: string, side: "home" | "away" | "primary" | "secondary" = "primary") {
  const colours = teamColors(team);
  return colours[side] ?? colours.primary;
}

export function teamBarColor(team: string, side: "home" | "away") {
  return teamColor(team, side);
}

export function findPlayerByApiSportsId(id?: number | string) {
  if (id == null || id === "") return null;

  const target = Number(id);

  return (
    (playerStatsJson as any[]).find((p) => {
      const apiSportsId = Number(p.apiSportsId);
      const statsIds = Array.isArray(p.statsIds) ? p.statsIds.map(Number) : [];
      return apiSportsId === target || statsIds.includes(target);
    }) ?? null
  );
}

export function findPlayerByEventId(id?: number | string, preferTeam?: string) {
  if (id == null || id === "") return null;

  const target = Number(id);
  const candidates = (playerStatsJson as any[]).filter((p) => {
    const eventIds = Array.isArray(p.eventIds) ? p.eventIds.map(Number) : [];
    return eventIds.includes(target);
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (preferTeam) {
    const norm = preferTeam.toLowerCase().replace(/[^a-z]/g, "");
    const match = candidates.find((p) => {
      const club = String(p.club ?? p.team ?? "").toLowerCase().replace(/[^a-z]/g, "");
      return club && club.includes(norm);
    });
    if (match) return match;
  }

  return candidates[0] ?? null;
}

export function foopyRating(p: PlayerStat) {
  const goals        = num(p.goals);
  const goalAssists  = num(p.goalAssists);
  const behinds      = num(p.behinds);
  const kicks        = num(p.kicks);
  const handballs    = num(p.handballs);
  const marks        = num(p.marks);
  const tackles      = num(p.tackles);
  const hitouts      = num(p.hitouts);
  const disposals    = num(p.disposals);
  const clearances   = num(p.clearances);
  const freesFor     = num(p.freesFor ?? p.frees ?? p.ff ?? p.freeKicksFor);
  const freesAgainst = num(p.freesAgainst ?? p.fa ?? p.freeKicksAgainst);

  let score =
    goals        * 5.5 +
    goalAssists  * 1.5 +
    behinds      * 1.2 +
    kicks        * 0.75 +
    handballs    * 0.55 +
    marks        * 1.0 +
    tackles      * 1.8 +
    hitouts      * 0.35 +
    clearances   * 0.5 +
    freesFor     * 0.3 -
    freesAgainst * 0.4;

  if (goals >= 3)        score += 3;
  if (goals >= 5)        score += 5;
  if (goals >= 7)        score += 10;
  if (goals >= 10)       score += 18;
  if (goalAssists >= 3)  score += 1;
  if (disposals >= 25)   score += 3;
  if (disposals >= 30)   score += 4;
  if (tackles >= 8)      score += 4;
  if (clearances >= 7)   score += 1;
  if (marks >= 10)       score += 3;
  if (hitouts >= 25)     score += 3;
  if (freesAgainst >= 4) score -= 1;

  if (score <= 0) return 0;
  const rawRating = 10 * (1 - Math.exp(-score / 36));
  return Number(Math.max(1, Math.min(10, rawRating)).toFixed(1));
}

export function eventQuarter(event: LiveEvent) {
  return event.quarter ?? `Q${event.period ?? "-"}`;
}