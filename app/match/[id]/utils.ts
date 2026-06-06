import playerStatsJson from "@/app/data/players.json";
import type { MatchGame, PlayerStat, SavedMatchStats, LiveEvent } from "./types";
import { foopyRating as foopyRatingShared } from "@/app/lib/foopyRating";

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

    collingwood: { primary: "#ffffff", secondary: "#14141e", home: "#14141e", away: "#ffffff", text: "#14141e" },

    essendon: { primary: "#ef4444", secondary: "#14141e", home: "#ef4444", away: "#14141e", text: "#ffffff" },

    fremantle: { primary: "#7c3aed", secondary: "#ffffff", home: "#7c3aed", away: "#ffffff", text: "#ffffff" },

    geelong: { primary: "#1e3a8a", secondary: "#ffffff", home: "#1e3a8a", away: "#ffffff", text: "#ffffff" },
    "geelong cats": { primary: "#1e3a8a", secondary: "#ffffff", home: "#1e3a8a", away: "#ffffff", text: "#ffffff" },

    "gold coast": { primary: "#ef4444", secondary: "#facc15", home: "#ef4444", away: "#facc15", text: "#ffffff" },
    "gold coast suns": { primary: "#ef4444", secondary: "#facc15", home: "#ef4444", away: "#facc15", text: "#ffffff" },

    gws: { primary: "#f97316", secondary: "#14141e", home: "#f97316", away: "#14141e", text: "#14141e" },
    "gws giants": { primary: "#f97316", secondary: "#14141e", home: "#f97316", away: "#14141e", text: "#14141e" },
    "greater western sydney": { primary: "#f97316", secondary: "#14141e", home: "#f97316", away: "#14141e", text: "#14141e" },
    "greater western sydney giants": { primary: "#f97316", secondary: "#14141e", home: "#f97316", away: "#14141e", text: "#14141e" },

    hawthorn: { primary: "#f59e0b", secondary: "#5b2a00", home: "#f59e0b", away: "#5b2a00", text: "#14141e" },
    "hawthorn hawks": { primary: "#f59e0b", secondary: "#5b2a00", home: "#f59e0b", away: "#5b2a00", text: "#14141e" },

    melbourne: { primary: "#ef4444", secondary: "#1e3a8a", home: "#ef4444", away: "#1e3a8a", text: "#ffffff" },
    "melbourne demons": { primary: "#ef4444", secondary: "#1e3a8a", home: "#ef4444", away: "#1e3a8a", text: "#ffffff" },

    "north melbourne": { primary: "#3b82f6", secondary: "#ffffff", home: "#3b82f6", away: "#ffffff", text: "#ffffff" },
    "north melbourne kangaroos": { primary: "#3b82f6", secondary: "#ffffff", home: "#3b82f6", away: "#ffffff", text: "#ffffff" },

    "port adelaide": { primary: "#06b6d4", secondary: "#14141e", home: "#06b6d4", away: "#14141e", text: "#14141e" },
    "port adelaide power": { primary: "#06b6d4", secondary: "#14141e", home: "#06b6d4", away: "#14141e", text: "#14141e" },

    richmond: { primary: "#facc15", secondary: "#14141e", home: "#facc15", away: "#14141e", text: "#14141e" },
    "richmond tigers": { primary: "#facc15", secondary: "#14141e", home: "#facc15", away: "#14141e", text: "#14141e" },

    "st kilda": { primary: "#ef4444", secondary: "#14141e", home: "#ef4444", away: "#14141e", text: "#ffffff" },
    "st kilda saints": { primary: "#ef4444", secondary: "#14141e", home: "#ef4444", away: "#14141e", text: "#ffffff" },

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
      return club && (club === norm || club.includes(norm) || norm.includes(club));
    });
    if (match) return match;
  }

  return candidates[0] ?? null;
}

// Delegates to the shared, server-safe implementation so the rating stays
// identical everywhere across Foopy. See app/lib/foopyRating.ts.
export function foopyRating(p: PlayerStat) {
  return foopyRatingShared(p);
}

export function eventQuarter(event: LiveEvent) {
  return event.quarter ?? `Q${event.period ?? "-"}`;
}
