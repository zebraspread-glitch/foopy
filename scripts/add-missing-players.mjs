import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const newPlayers = [
  { name: "Alex Van Wyk",      team: "Port Adelaide",    footySlug: "port-adelaide-power",        month: 7,  day: 1  },
  { name: "Caleb May",         team: "Western Bulldogs", footySlug: "western-bulldogs",            month: 5,  day: 13 },
  { name: "Campbell Lake",     team: "St Kilda",         footySlug: "st-kilda-saints",             month: 8,  day: 11 },
  { name: "Flynn Riley",       team: "Carlton",          footySlug: "carlton-blues",               month: 4,  day: 5  },
  { name: "Harrison Coe",      team: "Collingwood",      footySlug: "collingwood-magpies",         month: 11, day: 10 },
  { name: "Hugo Hall-Kahan",   team: "Adelaide",         footySlug: "adelaide-crows",              month: 9,  day: 22 },
  { name: "Jaxon Artemis",     team: "Essendon",         footySlug: "essendon-bombers",            month: 8,  day: 24 },
  { name: "Joel Fitzgerald",   team: "Melbourne",        footySlug: "melbourne-demons",            month: 8,  day: 8  },
  { name: "Kye Annand",        team: "Richmond",         footySlug: "richmond-tigers",             month: 10, day: 14 },
  { name: "Liam Puncher",      team: "Collingwood",      footySlug: "collingwood-magpies",         month: 8,  day: 26 },
  { name: "Lukas Cooke",       team: "Melbourne",        footySlug: "melbourne-demons",            month: 9,  day: 26 },
  { name: "Marcus Herbert",    team: "West Coast",       footySlug: "west-coast-eagles",           month: 8,  day: 13 },
  { name: "Max Beattie",       team: "Hawthorn",         footySlug: "hawthorn-hawks",              month: 11, day: 18 },
  { name: "Max Mapley",        team: "Melbourne",        footySlug: "melbourne-demons",            month: 10, day: 27 },
  { name: "Mitch Podhajski",   team: "Collingwood",      footySlug: "collingwood-magpies",         month: 1,  day: 4  },
  { name: "Oliver Francou",    team: "West Coast",       footySlug: "west-coast-eagles",           month: 2,  day: 27 },
  { name: "Oliver Griffin",    team: "North Melbourne",  footySlug: "north-melbourne-kangaroos",   month: 6,  day: 4  },
  { name: "Xavier Bamert",     team: "Port Adelaide",    footySlug: "port-adelaide-power",         month: 1,  day: 29 },
];

// ── 1. Update players.json ────────────────────────────────────────────────────
const players = require("../app/data/players.json");
const existingIds = new Set(players.map(p => p.id));

const nameToSlug = name =>
  name.toLowerCase().replace(/['-]/g, "").replace(/\s+/g, "-");
const nameToId = name =>
  name.toLowerCase().replace(/['\-]/g, "_").replace(/\s+/g, "_");

const newPlayerEntries = newPlayers.map(p => ({
  id: nameToId(p.name),
  name: p.name,
  team: p.team,
  aliases: [],
  apiSportsId: null,
  eventIds: [],
  statsIds: [],
  footyWireUrl: `https://www.footywire.com/afl/footy/pp-${p.footySlug}--${nameToSlug(p.name)}`,
})).filter(p => !existingIds.has(p.id));

const updatedPlayers = [...players, ...newPlayerEntries]
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  "app/data/players.json",
  JSON.stringify(updatedPlayers, null, 2),
  "utf8"
);
console.log(`✅ players.json: added ${newPlayerEntries.length} players (total: ${updatedPlayers.length})`);
newPlayerEntries.forEach(p => console.log(`   + ${p.name} (${p.team})`));

// ── 2. Update playerBirthdays.json ───────────────────────────────────────────
const birthdays = require("../app/data/playerBirthdays.json");
const existingBirthdayNames = new Set(birthdays.map(b => b.name.toLowerCase()));

const newBirthdays = newPlayers
  .filter(p => !existingBirthdayNames.has(p.name.toLowerCase()))
  .map(p => ({ name: p.name, month: p.month, day: p.day }));

const updatedBirthdays = [...birthdays, ...newBirthdays]
  .sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day);

writeFileSync(
  "app/data/playerBirthdays.json",
  JSON.stringify(updatedBirthdays, null, 2),
  "utf8"
);
console.log(`\n✅ playerBirthdays.json: added ${newBirthdays.length} entries (total: ${updatedBirthdays.length})`);
newBirthdays.forEach(b => console.log(`   + ${b.name}: ${b.month}/${b.day}`));
