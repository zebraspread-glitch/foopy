// Shared types and pure helpers for the Passes system.

export const MAX_PLAYER_PASSES = 100;
export const MAX_TEAM_PASSES   = 3;
export const PLAYER_PASS_COST  = 500;   // coins to buy
export const TEAM_PASS_COST    = 1500;  // coins per new team pass slot

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
  { name: "Bronze",       color: "#e8a87c", darkColor: "#7a3d10", gradient: "linear-gradient(155deg,#3b1a08,#6b3010)",  xpRequired: 0    },
  { name: "Silver",       color: "#d4d4d4", darkColor: "#555",    gradient: "linear-gradient(155deg,#181818,#2c2c2c)",  xpRequired: 50   },
  { name: "Gold",         color: "#ffd700", darkColor: "#7a6000", gradient: "linear-gradient(155deg,#2e2600,#4a3c00)",  xpRequired: 125  },
  { name: "Emerald",      color: "#10b981", darkColor: "#065f3a", gradient: "linear-gradient(155deg,#031f13,#063d22)",  xpRequired: 225  },
  { name: "Sapphire",     color: "#3b82f6", darkColor: "#1e40af", gradient: "linear-gradient(155deg,#06183b,#0a2d6b)",  xpRequired: 375  },
  { name: "Ruby",         color: "#ef4444", darkColor: "#991b1b", gradient: "linear-gradient(155deg,#3b0606,#6b0a0a)",  xpRequired: 575  },
  { name: "Amethyst",     color: "#a78bfa", darkColor: "#5b21b6", gradient: "linear-gradient(155deg,#1a0a33,#2d1060)",  xpRequired: 825  },
  { name: "Diamond",      color: "#7ff7ee", darkColor: "#008b8f", gradient: "radial-gradient(ellipse at 18% 12%,rgba(190,255,250,.34),transparent 34%),radial-gradient(ellipse at 88% 18%,rgba(45,212,191,.32),transparent 38%),linear-gradient(155deg,#032f35,#075e66 48%,#0a3f48)",  xpRequired: 1125 },
  { name: "Pink Diamond", color: "#f472b6", darkColor: "#be185d", gradient: "linear-gradient(155deg,#2d0a1a,#5a1030)",  xpRequired: 1625 },
  { name: "Mythic",       color: "#7dd3fc", darkColor: "#7c3aed", gradient: "radial-gradient(circle at 16% 10%,rgba(255,255,255,.98),transparent 28%),radial-gradient(circle at 78% 22%,rgba(125,211,252,.34),transparent 34%),radial-gradient(circle at 72% 74%,rgba(167,139,250,.28),transparent 42%),radial-gradient(circle at 28% 68%,rgba(153,246,228,.24),transparent 36%),linear-gradient(135deg,#ffffff 0%,#eef7ff 28%,#f4efff 56%,#e0f7ff 82%,#fbfdff 100%)",  xpRequired: 2625 },
];

export const TEAM_PASS_LEVELS: LevelDef[] = [
  { name: "Bronze",       color: "#e8a87c", darkColor: "#7a3d10", gradient: "linear-gradient(155deg,#3b1a08,#6b3010)",  xpRequired: 0     },
  { name: "Silver",       color: "#d4d4d4", darkColor: "#555",    gradient: "linear-gradient(155deg,#181818,#2c2c2c)",  xpRequired: 100   },
  { name: "Gold",         color: "#ffd700", darkColor: "#7a6000", gradient: "linear-gradient(155deg,#2e2600,#4a3c00)",  xpRequired: 400   },
  { name: "Emerald",      color: "#10b981", darkColor: "#065f3a", gradient: "linear-gradient(155deg,#031f13,#063d22)",  xpRequired: 900   },
  { name: "Sapphire",     color: "#3b82f6", darkColor: "#1e40af", gradient: "linear-gradient(155deg,#06183b,#0a2d6b)",  xpRequired: 1650  },
  { name: "Ruby",         color: "#ef4444", darkColor: "#991b1b", gradient: "linear-gradient(155deg,#3b0606,#6b0a0a)",  xpRequired: 2650  },
  { name: "Amethyst",     color: "#a78bfa", darkColor: "#5b21b6", gradient: "linear-gradient(155deg,#1a0a33,#2d1060)",  xpRequired: 4150  },
  { name: "Diamond",      color: "#67e8f9", darkColor: "#0050a0", gradient: "linear-gradient(155deg,#00103d,#002966)",  xpRequired: 6150  },
  { name: "Pink Diamond", color: "#f472b6", darkColor: "#be185d", gradient: "linear-gradient(155deg,#2d0a1a,#5a1030)",  xpRequired: 9150  },
  { name: "Mythic",       color: "#7dd3fc", darkColor: "#7c3aed", gradient: "radial-gradient(circle at 16% 10%,rgba(255,255,255,.98),transparent 28%),radial-gradient(circle at 78% 22%,rgba(125,211,252,.34),transparent 34%),radial-gradient(circle at 72% 74%,rgba(167,139,250,.28),transparent 42%),radial-gradient(circle at 28% 68%,rgba(153,246,228,.24),transparent 36%),linear-gradient(135deg,#ffffff 0%,#eef7ff 28%,#f4efff 56%,#e0f7ff 82%,#fbfdff 100%)",  xpRequired: 14150 },
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
  serial_number: number | null;
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
  serial_number: number | null;
  created_at: string;
}

export type PlayerPassIdentityInput = {
  id?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  team_name?: string | null;
  active?: boolean | null;
  xp?: number | null;
  serial_number?: number | null;
  created_at?: string | null;
};

export function normalizePassPlayerIdentity(value?: string | null): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function playerPassIdentityKey(pass: PlayerPassIdentityInput): string {
  return normalizePassPlayerIdentity(pass.player_name) || normalizePassPlayerIdentity(pass.player_id);
}

function isBetterPlayerPass<T extends PlayerPassIdentityInput>(candidate: T, current: T): boolean {
  const candidateActive = Boolean(candidate.active);
  const currentActive = Boolean(current.active);
  if (candidateActive !== currentActive) return candidateActive;

  const candidateXp = Number(candidate.xp ?? 0);
  const currentXp = Number(current.xp ?? 0);
  if (candidateXp !== currentXp) return candidateXp > currentXp;

  const candidateSerial = candidate.serial_number ?? Number.POSITIVE_INFINITY;
  const currentSerial = current.serial_number ?? Number.POSITIVE_INFINITY;
  if (candidateSerial !== currentSerial) return candidateSerial < currentSerial;

  const candidateTime = Date.parse(String(candidate.created_at ?? ""));
  const currentTime = Date.parse(String(current.created_at ?? ""));
  if (!Number.isNaN(candidateTime) && !Number.isNaN(currentTime) && candidateTime !== currentTime) {
    return candidateTime < currentTime;
  }

  return String(candidate.id ?? "") < String(current.id ?? "");
}

export function dedupePlayerPasses<T extends PlayerPassIdentityInput>(passes: T[]): T[] {
  const byKey = new Map<string, T>();
  const keyOrder: string[] = [];

  for (const pass of passes) {
    const key = playerPassIdentityKey(pass) || `pass:${pass.id ?? keyOrder.length}`;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, pass);
      keyOrder.push(key);
      continue;
    }

    if (isBetterPlayerPass(pass, current)) {
      byKey.set(key, pass);
    }
  }

  return keyOrder.map((key) => byKey.get(key)).filter((pass): pass is T => Boolean(pass));
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
