// Server-safe API-Sports AFL team-ID map + helpers.
//
// API-Sports TEAM ids are stable and small (Hawthorn = 8, GWS = 18, …), unlike
// their per-GAME ids, which are assigned in API-Sports' own creation order and
// do NOT track Squiggle's fixture order. That mismatch is why the static
// `apiSportsMatchIds.ts` (a fixed `squiggleId − 35149` offset) silently points
// at the wrong API-Sports game for recent fixtures. We use these stable team
// ids to re-match a game by its two teams when the offset guess comes up empty.
//
// Mirrors API_TEAM_ID_BY_NAME / normalizeTeamName in app/match/[id]/page.tsx —
// kept here so server code (cron + routes) can resolve teams without importing
// the client match page.

export const API_TEAM_ID_BY_NAME: Record<string, number> = {
  Adelaide: 1,
  "Adelaide Crows": 1,
  Brisbane: 2,
  "Brisbane Lions": 2,
  Carlton: 3,
  Collingwood: 4,
  Essendon: 5,
  Fremantle: 6,
  Geelong: 7,
  "Geelong Cats": 7,
  Hawthorn: 8,
  "Hawthorn Hawks": 8,
  Melbourne: 9,
  "Melbourne Demons": 9,
  "North Melbourne": 10,
  "North Melbourne Kangaroos": 10,
  "Port Adelaide": 11,
  "Port Adelaide Power": 11,
  Richmond: 12,
  "Richmond Tigers": 12,
  "St Kilda": 13,
  "St Kilda Saints": 13,
  Sydney: 14,
  "Sydney Swans": 14,
  "West Coast": 15,
  "West Coast Eagles": 15,
  "Western Bulldogs": 16,
  "Gold Coast": 17,
  "Gold Coast Suns": 17,
  GWS: 18,
  "GWS Giants": 18,
  "Greater Western Sydney": 18,
  "Greater Western Sydney Giants": 18,
};

export function normalizeTeamName(name: unknown): string {
  return String(name ?? "")
    .replace("Adelaide Crows", "Adelaide")
    .replace("Brisbane Lions", "Brisbane")
    .replace("Geelong Cats", "Geelong")
    .replace("Gold Coast Suns", "Gold Coast")
    .replace("Greater Western Sydney Giants", "GWS")
    .replace("Greater Western Sydney", "GWS")
    .replace("GWS Giants", "GWS")
    .replace("Hawthorn Hawks", "Hawthorn")
    .replace("Port Adelaide Power", "Port Adelaide")
    .replace("Richmond Tigers", "Richmond")
    .replace("St Kilda Saints", "St Kilda")
    .replace("Sydney Swans", "Sydney")
    .replace("West Coast Eagles", "West Coast")
    .trim();
}

/** Resolve a team name (Squiggle or API-Sports form) to its stable API-Sports team id, or 0. */
export function getApiTeamId(teamName: unknown): number {
  const raw = String(teamName ?? "");
  return API_TEAM_ID_BY_NAME[raw] ?? API_TEAM_ID_BY_NAME[normalizeTeamName(raw)] ?? 0;
}

function gameTeamIds(gameEntry: any): number[] {
  return (gameEntry?.teams ?? [])
    .map((t: any) => Number(t?.team?.id ?? t?.id ?? 0))
    .filter(Boolean);
}

export function gameHasTeamIds(
  gameEntry: any,
  homeApiTeamId: number,
  awayApiTeamId: number
): boolean {
  if (!homeApiTeamId || !awayApiTeamId) return false;
  const ids = new Set(gameTeamIds(gameEntry));
  const wanted = new Set([homeApiTeamId, awayApiTeamId]);
  return ids.has(homeApiTeamId) && ids.has(awayApiTeamId) && ids.size >= wanted.size;
}

/**
 * Given the `response` array from `/games/statistics/players?date=…` (each entry
 * is one game with a `teams` array), find the game whose two teams match the
 * requested home+away API-Sports team ids. Returns that game entry (same shape
 * as a single-game `response[0]`) or null.
 */
export function findGameByTeamIds(
  dateResponse: any[],
  homeApiTeamId: number,
  awayApiTeamId: number
): any | null {
  if (!Array.isArray(dateResponse) || !homeApiTeamId || !awayApiTeamId) return null;
  for (const g of dateResponse) {
    if (gameHasTeamIds(g, homeApiTeamId, awayApiTeamId)) return g;
  }
  return null;
}
