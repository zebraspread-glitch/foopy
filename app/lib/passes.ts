// Shared types and pure helpers for the Passes system.

export const MAX_PLAYER_PASSES = 100;
export const PLAYER_PASS_COST  = 500;   // coins to buy
export const TEAM_PASS_COST    = 1500;  // coins to buy (one-time slot)

// ── Pass level definitions ────────────────────────────────────────────────────

export type PassLevelName = "Bronze" | "Silver" | "Gold" | "Emerald" | "Sapphire" | "Ruby" | "Amethyst" | "Diamond" | "Pink Diamond" | "Mythic";

interface LevelDef {
  name:       PassLevelName;
  color:      string;
  darkColor:  string;
  gradient:   string;
  xpRequired: number;
}

export const PLAYER_PASS_LEVELS: LevelDef[] = [
  { name: "Bronze",       color: "#e8a87c", darkColor: "#7a3d10", gradient: "linear-gradient(155deg,#3b1a08,#6b3010)",  xpRequired: 0     },
  { name: "Silver",       color: "#d4d4d4", darkColor: "#555",    gradient: "linear-gradient(155deg,#1c1c2a,#2e2e42)",  xpRequired: 300   },
  { name: "Gold",         color: "#ffd700", darkColor: "#7a6000", gradient: "linear-gradient(155deg,#2e2600,#4a3c00)",  xpRequired: 700   },
  { name: "Emerald",      color: "#10b981", darkColor: "#065f3a", gradient: "linear-gradient(155deg,#031f13,#063d22)",  xpRequired: 1200  },
  { name: "Sapphire",     color: "#3b82f6", darkColor: "#1e40af", gradient: "linear-gradient(155deg,#06183b,#0a2d6b)",  xpRequired: 2000  },
  { name: "Ruby",         color: "#ef4444", darkColor: "#991b1b", gradient: "linear-gradient(155deg,#3b0606,#6b0a0a)",  xpRequired: 3000  },
  { name: "Amethyst",     color: "#a78bfa", darkColor: "#5b21b6", gradient: "linear-gradient(155deg,#1a0a33,#2d1060)",  xpRequired: 4500  },
  { name: "Diamond",      color: "#67e8f9", darkColor: "#0050a0", gradient: "linear-gradient(155deg,#00103d,#002966)",  xpRequired: 6500  },
  { name: "Pink Diamond", color: "#f472b6", darkColor: "#be185d", gradient: "linear-gradient(155deg,#2d0a1a,#5a1030)",  xpRequired: 9000  },
  { name: "Mythic",       color: "#c084fc", darkColor: "#5b1ea8", gradient: "linear-gradient(155deg,#1a0033,#36006b)",  xpRequired: 12000 },
];

export const TEAM_PASS_LEVELS: LevelDef[] = [
  { name: "Bronze",       color: "#e8a87c", darkColor: "#7a3d10", gradient: "linear-gradient(155deg,#3b1a08,#6b3010)",  xpRequired: 0     },
  { name: "Silver",       color: "#d4d4d4", darkColor: "#555",    gradient: "linear-gradient(155deg,#1c1c2a,#2e2e42)",  xpRequired: 1000  },
  { name: "Gold",         color: "#ffd700", darkColor: "#7a6000", gradient: "linear-gradient(155deg,#2e2600,#4a3c00)",  xpRequired: 2500  },
  { name: "Emerald",      color: "#10b981", darkColor: "#065f3a", gradient: "linear-gradient(155deg,#031f13,#063d22)",  xpRequired: 4500  },
  { name: "Sapphire",     color: "#3b82f6", darkColor: "#1e40af", gradient: "linear-gradient(155deg,#06183b,#0a2d6b)",  xpRequired: 7000  },
  { name: "Ruby",         color: "#ef4444", darkColor: "#991b1b", gradient: "linear-gradient(155deg,#3b0606,#6b0a0a)",  xpRequired: 10000 },
  { name: "Amethyst",     color: "#a78bfa", darkColor: "#5b21b6", gradient: "linear-gradient(155deg,#1a0a33,#2d1060)",  xpRequired: 14000 },
  { name: "Diamond",      color: "#67e8f9", darkColor: "#0050a0", gradient: "linear-gradient(155deg,#00103d,#002966)",  xpRequired: 18000 },
  { name: "Pink Diamond", color: "#f472b6", darkColor: "#be185d", gradient: "linear-gradient(155deg,#2d0a1a,#5a1030)",  xpRequired: 23000 },
  { name: "Mythic",       color: "#c084fc", darkColor: "#5b1ea8", gradient: "linear-gradient(155deg,#1a0033,#36006b)",  xpRequired: 30000 },
];

const LEVEL_MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7] as const;

export interface PassLevelInfo {
  levelIdx:   number;
  name:       PassLevelName;
  color:      string;
  darkColor:  string;
  gradient:   string;
  multiplier: number;
  xp:         number;
  levelXp:    number;
  nextXp:     number | null;
  isMaxed:    boolean;
  progress:   number; // 0–1
}

export function getPassLevel(xp: number, levels: LevelDef[]): PassLevelInfo {
  let idx = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].xpRequired) { idx = i; break; }
  }
  const lvl  = levels[idx];
  const next = levels[idx + 1] as LevelDef | undefined;
  return {
    levelIdx:   idx,
    name:       lvl.name,
    color:      lvl.color,
    darkColor:  lvl.darkColor,
    gradient:   lvl.gradient,
    multiplier: LEVEL_MULTIPLIERS[idx],
    xp,
    levelXp:    lvl.xpRequired,
    nextXp:     next?.xpRequired ?? null,
    isMaxed:    !next,
    progress:   next ? Math.min(1, (xp - lvl.xpRequired) / (next.xpRequired - lvl.xpRequired)) : 1,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamPass {
  id: string;
  user_id: string;
  team_name: string;
  active: boolean;
  xp: number;
  created_at: string;
}

export interface PlayerPass {
  id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  team_name: string;
  active: boolean;
  xp: number;
  created_at: string;
}

export interface PassReward {
  id: string;
  user_id: string;
  pass_type: "team" | "player";
  pass_id: string;
  match_id: string;
  aura_reward: number;
  coin_reward: number;
  claimed_at: string;
  created_at: string;
}

export interface PendingReward {
  pass_type: "team" | "player";
  pass_id: string;
  match_id: string;
  team_name?: string;
  opponent?: string;
  margin?: number;
  player_name?: string;
  rating?: number;
  aura_reward: number;
  coin_reward: number;
  match_date: string;
  description: string;
}

// ── Reward calculators ────────────────────────────────────────────────────────

export function teamPassReward(margin: number, xp = 0): { aura: number; coins: number } | null {
  if (margin <= 0) return null;
  const { multiplier } = getPassLevel(xp, TEAM_PASS_LEVELS);
  const base = margin <= 12 ? { aura: 10, coins: 25  }
             : margin <= 30 ? { aura: 20, coins: 50  }
             : margin <= 60 ? { aura: 35, coins: 100 }
             :                { aura: 50, coins: 150 };
  return {
    aura:  Math.round(base.aura  * multiplier),
    coins: Math.round(base.coins * multiplier),
  };
}

export function playerPassReward(rating: number, xp = 0): { aura: number; coins: number } | null {
  if (rating <= 0) return null;
  const { multiplier } = getPassLevel(xp, PLAYER_PASS_LEVELS);
  return {
    aura:  Math.round(rating * 5  * multiplier),
    coins: Math.round(rating * 10 * multiplier),
  };
}

// ── Team name normaliser ──────────────────────────────────────────────────────

export function normaliseTeam(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export function teamsMatch(a: string, b: string): boolean {
  const na = normaliseTeam(a);
  const nb = normaliseTeam(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export const AFL_TEAMS: string[] = [
  "Adelaide Crows",
  "Brisbane Lions",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong Cats",
  "Gold Coast Suns",
  "GWS Giants",
  "Hawthorn",
  "Melbourne",
  "North Melbourne",
  "Port Adelaide",
  "Richmond",
  "St Kilda",
  "Sydney Swans",
  "West Coast Eagles",
  "Western Bulldogs",
];
