// ─────────────────────────────────────────────────────────────────────────────
// Manual season-stat corrections.
//
// The season stats are sourced from API-Sports, which undercounts AFL goals and
// occasionally has a player on the wrong team. These overrides are applied on
// top of BOTH the live Supabase cache and the static fallback, so corrected
// values always win on the live site.
//
// Keyed by apiSportsId (stable). Only the listed fields are overridden; every
// other field passes through untouched.
//
// ⚠️ MAINTENANCE: goal TOTALS keep climbing as the season continues — bump the
// numbers here each round, or remove an entry once API-Sports catches up.
// ─────────────────────────────────────────────────────────────────────────────

export type StatCorrection = Partial<{
  goals: number;
  team: string;
  position: string;
}>;

export const STAT_CORRECTIONS: Record<number, StatCorrection> = {
  1550: { goals: 42 }, // Ben King (Gold Coast) — API-Sports had 41
  648:  { goals: 39 }, // Jeremy Cameron (Geelong) — API-Sports had 37
};

/** Returns a new array with STAT_CORRECTIONS merged over matching players. */
export function applyStatCorrections<T extends { apiSportsId?: number | string | null }>(
  players: T[],
): T[] {
  return players.map((p) => {
    const id = Number(p.apiSportsId);
    const fix = id ? STAT_CORRECTIONS[id] : undefined;
    return fix ? { ...p, ...fix } : p;
  });
}
