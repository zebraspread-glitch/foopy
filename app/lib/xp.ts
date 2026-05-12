// ─── Types ───────────────────────────────────────────────────────────────────

export type XPAction =
  | "daily_login"
  | "make_pick"
  | "lock_picks"
  | "correct_pick"
  | "send_message"
  | "add_favourite"
  | "set_username"
  | "set_avatar"
  | "set_banner"
  | "set_bio"
  | "view_match"
  | "react_play"
  | "like_comment"
  | "add_friend";

export type XPLog = {
  daily?:   string;                   // ISO date string of last daily XP
  msg?:     string;                   // ISO timestamp of last message XP
  react?:   string;                   // ISO timestamp of last react_play XP
  like?:    string;                   // ISO timestamp of last like_comment XP
  friend?:  string;                   // ISO timestamp of last add_friend XP
  locked?:  number[];                 // round numbers where lock_picks was awarded
  picks?:   number[];                 // game IDs where make_pick XP was awarded
  correct?: number[];                 // game IDs where correct_pick XP was awarded
  once?:    string[];                 // one-time action keys
  matches?: Record<string, string>;   // matchId → ISO timestamp of last view XP
};

export type XPResult = {
  awarded: number;
  reason: string;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  prevLevel: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const XP_VALUES: Record<XPAction, number> = {
  daily_login:   10,
  make_pick:      5,
  lock_picks:    15,
  correct_pick:  10,
  send_message:  10,
  add_favourite: 10,
  set_username:  50,
  set_avatar:    20,
  set_banner:    20,
  set_bio:       20,
  view_match:     5,
  react_play:     5,
  like_comment:   2,
  add_friend:     5,
};

export const LEVEL_TITLES = [
  "",            // 0 — unused
  "Rookie",      // 1
  "Supporter",   // 2
  "Fan",         // 3
  "Fanatic",     // 4
  "Die Hard",    // 5
  "Expert",      // 6
  "Legend",      // 7
  "Icon",        // 8
  "Elite",       // 9
  "GOAT",        // 10+
];

export const LEVEL_MILESTONES: Record<number, { emoji: string; label: string }> = {
  2:  { emoji: "🎟️", label: "Supporter" },
  5:  { emoji: "🔥", label: "Die Hard" },
  7:  { emoji: "👑", label: "Legend" },
  10: { emoji: "🐐", label: "GOAT" },
};

// Cooldown for message XP: once per day
const MSG_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ─── Level math ──────────────────────────────────────────────────────────────
//
// XP to level up per bracket of 100 levels:
//   Levels   1–100  → 100 XP each
//   Levels 101–200  → 120 XP each
//   Levels 201–300  → 140 XP each
//   …and so on (+20 XP per bracket)

function xpPerLevelInBracket(bracket: number): number {
  return 100 + 20 * bracket;
}

/** Total XP required to reach `level` (accumulated from level 1). */
export function totalXPToReach(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;                       // number of levels to climb
  const bracket    = Math.floor(n / 100);    // complete brackets before current
  const remainder  = n % 100;                // levels into the current bracket

  // Sum XP for all complete brackets (each bracket k = 100 levels at 100+20k XP)
  // = sum_{k=0}^{bracket-1} 100*(100+20k) = 100*bracket*(100 + 10*(bracket-1))
  const completedXP = bracket * 100 * (100 + 10 * (bracket - 1));
  const remainderXP = remainder * xpPerLevelInBracket(bracket);

  return completedXP + remainderXP;
}

/** Current level from total accumulated XP. */
export function levelFromXP(xp: number): number {
  if (xp <= 0) return 1;
  let remaining = xp;
  let level     = 1;
  let bracket   = 0;

  while (true) {
    const xpPerLevel    = xpPerLevelInBracket(bracket);
    const xpForBracket  = 100 * xpPerLevel;

    if (remaining < xpForBracket) {
      level += Math.floor(remaining / xpPerLevel);
      break;
    }
    remaining -= xpForBracket;
    level     += 100;
    bracket++;
  }

  return Math.max(1, level);
}

/** XP accumulated within the current level (progress toward next). */
export function xpInCurrentLevel(xp: number): number {
  const level = levelFromXP(xp);
  return xp - totalXPToReach(level);
}

/** XP required to complete the current level (advance one level). */
export function xpForCurrentLevel(xp: number): number {
  const level   = levelFromXP(xp);
  const bracket = Math.floor((level - 1) / 100);
  return xpPerLevelInBracket(bracket);
}

/** 0–1 progress fraction within the current level. */
export function levelProgress(xp: number): number {
  return Math.min(1, xpInCurrentLevel(xp) / xpForCurrentLevel(xp));
}

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)] ?? "GOAT";
}

// ─── Cooldown / eligibility checks ───────────────────────────────────────────

export function canAwardXP(
  action: XPAction,
  log: XPLog,
  meta?: { roundId?: number; gameId?: number; matchId?: string; slot?: number }
): boolean {
  const now = Date.now();

  switch (action) {
    case "daily_login": {
      if (!log.daily) return true;
      const lastDate = new Date(log.daily).toDateString();
      return lastDate !== new Date().toDateString();
    }
    case "make_pick": {
      if (!meta?.gameId) return false;
      return !(log.picks ?? []).includes(meta.gameId);
    }
    case "lock_picks": {
      if (meta?.roundId === undefined) return false;
      return !(log.locked ?? []).includes(meta.roundId);
    }
    case "correct_pick": {
      if (!meta?.gameId) return false;
      return !(log.correct ?? []).includes(meta.gameId);
    }
    case "send_message": {
      if (!log.msg) return true;
      return now - new Date(log.msg).getTime() > MSG_COOLDOWN_MS;
    }
    case "react_play": {
      if (!log.react) return true;
      return now - new Date(log.react).getTime() > MSG_COOLDOWN_MS;
    }
    case "like_comment": {
      if (!log.like) return true;
      return now - new Date(log.like).getTime() > MSG_COOLDOWN_MS;
    }
    case "add_friend": {
      if (!log.friend) return true;
      return now - new Date(log.friend).getTime() > MSG_COOLDOWN_MS;
    }
    case "add_favourite": {
      if (meta?.slot === undefined) return false;
      return !(log.once ?? []).includes(`fav_${meta.slot}`);
    }
    case "set_username":
      return !(log.once ?? []).includes("set_username");
    case "set_avatar":
      return !(log.once ?? []).includes("set_avatar");
    case "set_banner":
      return !(log.once ?? []).includes("set_banner");
    case "set_bio":
      return !(log.once ?? []).includes("set_bio");
    case "view_match": {
      if (!meta?.matchId) return false;
      return !log.matches?.[meta.matchId];
    }
    default:
      return false;
  }
}

/** Returns the updated XPLog after recording an action. */
export function recordAction(
  action: XPAction,
  log: XPLog,
  meta?: { roundId?: number; gameId?: number; matchId?: string; slot?: number }
): XPLog {
  const now = new Date().toISOString();
  const updated = { ...log };

  switch (action) {
    case "daily_login":
      updated.daily = now;
      break;
    case "make_pick":
      updated.picks = [...(log.picks ?? []), meta!.gameId!];
      break;
    case "lock_picks":
      updated.locked = [...(log.locked ?? []), meta!.roundId!];
      break;
    case "correct_pick":
      updated.correct = [...(log.correct ?? []), meta!.gameId!];
      break;
    case "send_message":
      updated.msg = now;
      break;
    case "react_play":
      updated.react = now;
      break;
    case "like_comment":
      updated.like = now;
      break;
    case "add_friend":
      updated.friend = now;
      break;
    case "add_favourite":
      updated.once = [...(log.once ?? []), `fav_${meta!.slot!}`];
      break;
    case "set_username":
    case "set_avatar":
    case "set_banner":
    case "set_bio":
      updated.once = [...(log.once ?? []), action];
      break;
    case "view_match":
      updated.matches = { ...(log.matches ?? {}), [meta!.matchId!]: now };
      break;
  }

  return updated;
}

/** Compute XP result without side effects. */
export function computeXPAward(
  action: XPAction,
  currentXP: number,
  log: XPLog,
  meta?: { roundId?: number; gameId?: number; matchId?: string; slot?: number }
): XPResult | null {
  if (!canAwardXP(action, log, meta)) return null;

  const awarded = XP_VALUES[action];
  const newXP = currentXP + awarded;
  const prevLevel = levelFromXP(currentXP);
  const newLevel = levelFromXP(newXP);

  return {
    awarded,
    reason: action,
    newXP,
    newLevel,
    leveledUp: newLevel > prevLevel,
    prevLevel,
  };
}
