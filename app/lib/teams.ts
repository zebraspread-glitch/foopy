// Single source of truth for matching AFL team names across the app.
//
// Team names arrive from several sources that don't agree on spelling:
//   players.json  → "Brisbane",        Squiggle → "Brisbane Lions"
//   players.json  → "GWS",             Squiggle → "Greater Western Sydney"
// Comparing them with `===` silently fails (this caused wrong opponents on the
// Brownlow page and wrong logos on profiles). Always compare via teamsMatch().

const ALIASES: Record<string, string> = {
  adelaide: "adelaide", adelaidecrows: "adelaide", crows: "adelaide",
  brisbane: "brisbane", brisbanelions: "brisbane", brisbanebears: "brisbane", lions: "brisbane",
  carlton: "carlton", carltonblues: "carlton", blues: "carlton",
  collingwood: "collingwood", collingwoodmagpies: "collingwood", magpies: "collingwood",
  essendon: "essendon", essendonbombers: "essendon", bombers: "essendon",
  fremantle: "fremantle", fremantledockers: "fremantle", dockers: "fremantle",
  geelong: "geelong", geelongcats: "geelong", cats: "geelong",
  goldcoast: "goldcoast", goldcoastsuns: "goldcoast", suns: "goldcoast",
  gws: "gws", gwsgiants: "gws", greaterwesternsydney: "gws", greaterwesternsydneygiants: "gws", giants: "gws",
  hawthorn: "hawthorn", hawthornhawks: "hawthorn", hawks: "hawthorn",
  melbourne: "melbourne", melbournedemons: "melbourne", demons: "melbourne",
  northmelbourne: "northmelbourne", northmelbournekangaroos: "northmelbourne", kangaroos: "northmelbourne",
  portadelaide: "portadelaide", portadelaidepower: "portadelaide", power: "portadelaide",
  richmond: "richmond", richmondtigers: "richmond", tigers: "richmond",
  stkilda: "stkilda", stkildasaints: "stkilda", saints: "stkilda",
  sydney: "sydney", sydneyswans: "sydney", southmelbourne: "sydney", swans: "sydney",
  westcoast: "westcoast", westcoasteagles: "westcoast", eagles: "westcoast",
  westernbulldogs: "westernbulldogs", footscray: "westernbulldogs", bulldogs: "westernbulldogs",
};

// Folds any spelling/nickname of a club onto one canonical key.
export function canonicalTeamKey(team: string | null | undefined): string {
  const key = String(team ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return ALIASES[key] ?? key;
}

// True when two names refer to the same club, regardless of spelling.
export function teamsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = canonicalTeamKey(a);
  const kb = canonicalTeamKey(b);
  return !!ka && ka === kb;
}
