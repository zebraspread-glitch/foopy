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
  const disposals    = num(p.disposals) || (kicks + handballs);
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

  // Map the weighted score onto the Foopy scale (-1 … 10).
  // The floor is -1: a near-empty game (≈1 disposal, or 1 tackle and nothing
  // else — score of ~2 or less) bottoms out there. Rare, but possible.
  // 0 sits just above it (a very quiet game), then it climbs toward 10.
  const adjusted = Math.max(0, score - 2);
  const raw = 11 * (1 - Math.exp(-adjusted / 32)) - 1;
  return Number(Math.max(-1, Math.min(10, raw)).toFixed(1));
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

// ── Rating colour ─────────────────────────────────────────────────────────────
// Single source of truth for the Foopy rating colour, used everywhere a rating
// is shown. Spans the full -1 … 10 scale: -1 is the darkest red, 0 a dark red,
// 1-2 red, climbing through orange/yellow/green to blue/navy, and a gold
// gradient at a perfect 10.

function mixColor(a: string, b: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const c1 = parseInt(a.slice(1), 16);
  const c2 = parseInt(b.slice(1), 16);
  const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t);
  const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * t);
  const bl = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function foopyColor(value: number): string {
  const v = Math.max(-1, Math.min(10, value));
  if (v >= 10) return "linear-gradient(135deg, #ffd700, #ff8c00)";

  const anchors: [number, string][] = [
    [-1,  "#450a0a"], // even darker red
    [0,   "#7f1d1d"], // dark red
    [1,   "#ef4444"], // red
    [2,   "#ef4444"], // red
    [3,   "#f97316"], // orange
    [4,   "#facc15"], // yellow
    [5,   "#84cc16"], // lime
    [6,   "#22c55e"], // green
    [7,   "#16a34a"], // green
    [8,   "#166534"], // dark green
    [9,   "#3b82f6"], // blue
    [9.9, "#1e3a8a"], // navy
  ];

  for (let i = 0; i < anchors.length - 1; i++) {
    const [lo, colorLo] = anchors[i];
    const [hi, colorHi] = anchors[i + 1];
    if (v <= hi) return mixColor(colorLo, colorHi, (v - lo) / (hi - lo));
  }

  return mixColor("#3b82f6", "#1e3a8a", (v - 9) / 0.9);
}
