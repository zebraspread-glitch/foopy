/** Format a number compactly: 4358 → "4.3k", 15000 → "15k", 1200000 → "1.2M" */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

/** @alias formatCompact */
export const formatAura = formatCompact;
/** @alias formatCompact */
export const formatCoins = formatCompact;

// Lowercase particles that belong to the surname, not the first/given name.
const SURNAME_PARTICLES = new Set([
  "de", "da", "di", "du", "del", "della", "van", "von", "der", "den",
  "le", "la", "el", "al", "ah", "st", "mac", "mc", "o",
]);

/**
 * Extract the surname from a full name, keeping multi-word surnames intact.
 *   "Tom De Koning"    → "De Koning"
 *   "Jacob Van Rooyen" → "Van Rooyen"
 *   "Callum Ah Chee"   → "Ah Chee"
 *   "Marcus Bontempelli" → "Bontempelli"
 * Hyphenated surnames (e.g. "Neal-Bullen") are already single tokens.
 */
export function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim();
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (SURNAME_PARTICLES.has(prev.toLowerCase().replace(/[^a-z]/g, ""))) {
    return `${prev} ${last}`;
  }
  return last;
}
