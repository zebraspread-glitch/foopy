// ── AFL venue lookup ──────────────────────────────────────────────────────────
// Maps the venue name Squiggle reports → the real/sponsor display name, the
// suburb + state, coordinates (for the weather forecast) and capacity/surface.
//
// Keyed by the SQUIGGLE name (what arrives in game data). Lookup is lenient
// (case/punctuation-insensitive, substring either way) so minor format
// differences ("M.C.G" vs "M.C.G.") still match.
//
// When Squiggle's name already IS the real name, displayName just repeats it.

export type VenueInfo = {
  /** Real / sponsor display name shown as the card title. */
  displayName: string;
  /** Suburb + state shown under the name. */
  location: string;
  lat: number;
  lon: number;
  capacity: string;
  surface: string;
};

export const VENUES: Record<string, VenueInfo> = {
  // ── Squiggle name == real name ──
  "M.C.G":          { displayName: "MCG",            location: "Richmond, VIC",            lat: -37.8200, lon: 144.9834, capacity: "100,024", surface: "Grass" },
  "SCG":            { displayName: "SCG",            location: "Moore Park, NSW",          lat: -33.8915, lon: 151.2244, capacity: "48,000",  surface: "Grass" },
  "Adelaide Oval":  { displayName: "Adelaide Oval",  location: "North Adelaide, SA",       lat: -34.9156, lon: 138.5961, capacity: "53,500",  surface: "Grass" },
  "Gabba":          { displayName: "Gabba",          location: "Woolloongabba, QLD",       lat: -27.4858, lon: 153.0381, capacity: "42,000",  surface: "Grass" },
  "Traeger Park":   { displayName: "Traeger Park",   location: "Alice Springs, NT",        lat: -23.7050, lon: 133.8803, capacity: "10,000",  surface: "Grass" },
  "Manuka Oval":    { displayName: "Manuka Oval",    location: "Griffith, ACT",            lat: -35.3175, lon: 149.1347, capacity: "13,500",  surface: "Grass" },
  "Hands Oval":     { displayName: "Hands Oval",     location: "Bunbury, WA",              lat: -33.3289, lon: 115.6447, capacity: "8,000",   surface: "Grass" },

  // ── Squiggle name != real name ──
  "Docklands":        { displayName: "Marvel Stadium",       location: "Docklands, VIC",           lat: -37.8165, lon: 144.9476, capacity: "53,359", surface: "Grass" },
  "Perth Stadium":    { displayName: "Optus Stadium",        location: "Burswood, WA",             lat: -31.9510, lon: 115.8890, capacity: "61,266", surface: "Grass" },
  "Sydney Showground":{ displayName: "ENGIE Stadium",        location: "Sydney Olympic Park, NSW", lat: -33.8434, lon: 151.0635, capacity: "24,000", surface: "Grass" },
  "Marrara Oval":     { displayName: "TIO Stadium",          location: "Marrara, NT",              lat: -12.3992, lon: 130.8854, capacity: "12,500", surface: "Grass" },
  "Bellerive Oval":   { displayName: "Ninja Stadium",        location: "Bellerive, TAS",           lat: -42.8772, lon: 147.3730, capacity: "20,000", surface: "Grass" },
  "Carrara":          { displayName: "People First Stadium", location: "Carrara, QLD",             lat: -28.0064, lon: 153.3665, capacity: "27,400", surface: "Grass" },
  "York Park":        { displayName: "UTAS Stadium",         location: "Launceston, TAS",          lat: -41.4259, lon: 147.1380, capacity: "21,000", surface: "Grass" },

  // ── Additional venues Squiggle may use (best-effort; update as needed) ──
  "Kardinia Park":    { displayName: "GMHBA Stadium",        location: "South Geelong, VIC",       lat: -38.1580, lon: 144.3544, capacity: "40,000", surface: "Grass" },
  "Norwood Oval":     { displayName: "Norwood Oval",         location: "Norwood, SA",              lat: -34.9200, lon: 138.6310, capacity: "12,000", surface: "Grass" },
  "Cazaly's Stadium": { displayName: "Cazaly's Stadium",     location: "Westcourt, QLD",           lat: -16.9356, lon: 145.7490, capacity: "13,500", surface: "Grass" },
  "Eureka Stadium":   { displayName: "Mars Stadium",         location: "Ballarat, VIC",            lat: -37.5404, lon: 143.8483, capacity: "12,000", surface: "Grass" },
  "Stadium Australia":{ displayName: "Accor Stadium",        location: "Sydney Olympic Park, NSW", lat: -33.8471, lon: 151.0630, capacity: "83,500", surface: "Grass" },
};

// Squiggle sometimes uses alternate names for the same ground — map them to a
// primary key above so the lookup still resolves.
const ALIASES: Record<string, string> = {
  "marvel stadium":     "Docklands",
  "optus stadium":      "Perth Stadium",
  "engie stadium":      "Sydney Showground",
  "showground":         "Sydney Showground",
  "tio stadium":        "Marrara Oval",
  "ninja stadium":      "Bellerive Oval",
  "blundstone arena":   "Bellerive Oval",
  "people first stadium":"Carrara",
  "metricon stadium":   "Carrara",
  "heritage bank stadium":"Carrara",
  "utas stadium":       "York Park",
  "gmhba stadium":      "Kardinia Park",
  "mars stadium":       "Eureka Stadium",
  "accor stadium":      "Stadium Australia",
  "anz stadium":        "Stadium Australia",
  "mcg":                "M.C.G",
  "the gabba":          "Gabba",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolve a Squiggle venue name to its VenueInfo (or null if unknown). */
export function lookupVenue(name: string | null | undefined): VenueInfo | null {
  if (!name) return null;
  const n = norm(name);

  // 1. Direct / substring match against the primary keys.
  for (const [key, val] of Object.entries(VENUES)) {
    const k = norm(key);
    if (n === k || n.includes(k) || k.includes(n)) return val;
  }

  // 2. Alias match (real name or alternate name → primary key).
  for (const [aliasName, primaryKey] of Object.entries(ALIASES)) {
    const a = norm(aliasName);
    if (n === a || n.includes(a) || a.includes(n)) return VENUES[primaryKey] ?? null;
  }

  return null;
}
