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
