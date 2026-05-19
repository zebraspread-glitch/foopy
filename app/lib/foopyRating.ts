// Shared server-safe copy of foopyRating — usable in API routes.
// Keep in sync with app/match/[id]/utils.ts foopyRating().

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export interface RawPlayerStats {
  goals?: unknown;
  goalAssists?: unknown;
  behinds?: unknown;
  kicks?: unknown;
  handballs?: unknown;
  marks?: unknown;
  tackles?: unknown;
  hitouts?: unknown;
  disposals?: unknown;
  clearances?: unknown;
  freesFor?: unknown;
  frees?: unknown;
  ff?: unknown;
  freeKicksFor?: unknown;
  freesAgainst?: unknown;
  fa?: unknown;
  freeKicksAgainst?: unknown;
}

export function foopyRating(p: RawPlayerStats): number {
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

  if (goals        >= 3)  score += 3;
  if (goals        >= 5)  score += 5;
  if (goals        >= 7)  score += 10;
  if (goals        >= 10) score += 18;
  if (goalAssists  >= 3)  score += 1;
  if (disposals    >= 25) score += 3;
  if (disposals    >= 30) score += 4;
  if (tackles      >= 8)  score += 4;
  if (clearances   >= 7)  score += 1;
  if (marks        >= 10) score += 3;
  if (hitouts      >= 25) score += 3;
  if (freesAgainst >= 4)  score -= 1;

  if (score <= 0) return 0;
  const raw = 10 * (1 - Math.exp(-score / 36));
  return Number(Math.max(1, Math.min(10, raw)).toFixed(1));
}

// ── Game-stats JSON helpers ──────────────────────────────────────────────────

interface RawGamePlayer {
  player:     { id: number; number?: number };
  goals?:     { total?: number; assists?: number };
  behinds?:   number;
  disposals?: number;
  kicks?:     number;
  handballs?: number;
  marks?:     number;
  tackles?:   number;
  hitouts?:   number;
  clearances?:number;
  free_kicks?:{ for?: number; against?: number };
}

export function rawPlayerToStats(p: RawGamePlayer): RawPlayerStats {
  return {
    goals:        p.goals?.total      ?? 0,
    goalAssists:  p.goals?.assists    ?? 0,
    behinds:      p.behinds           ?? 0,
    kicks:        p.kicks             ?? 0,
    handballs:    p.handballs         ?? 0,
    marks:        p.marks             ?? 0,
    tackles:      p.tackles           ?? 0,
    hitouts:      p.hitouts           ?? 0,
    disposals:    p.disposals         ?? 0,
    clearances:   p.clearances        ?? 0,
    freesFor:     p.free_kicks?.for   ?? 0,
    freesAgainst: p.free_kicks?.against ?? 0,
  };
}

export function foopyRatingFromRaw(p: RawGamePlayer): number {
  return foopyRating(rawPlayerToStats(p));
}
