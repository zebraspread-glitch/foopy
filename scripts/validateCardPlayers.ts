import { CARD_PLAYERS } from "../app/data/cardPlayers";
import playersJson from "../app/data/players.json";

const ALBUM_TEAMS = ["Adelaide","Brisbane Lions","Carlton","Collingwood","Essendon","Fremantle","Geelong","GWS","Gold Coast","Hawthorn","Melbourne","North Melbourne","Port Adelaide","Richmond","St Kilda","Sydney","West Coast","Western Bulldogs"];

const albumSet = new Set(ALBUM_TEAMS);
const teamsInData = [...new Set(CARD_PLAYERS.map(p => p.team))].sort();
const badTeams = teamsInData.filter(t => !albumSet.has(t));
console.log("=== CARD_PLAYERS teams NOT in album TEAMS list (hidden from album) ===");
console.log(badTeams.length ? badTeams : "(none — all team names match)");

console.log("\n=== Players per album team ===");
for (const t of ALBUM_TEAMS) {
  const n = CARD_PLAYERS.filter(p => p.team === t).length;
  console.log(`${n.toString().padStart(3)}  ${t}`);
}
console.log(`Total CARD_PLAYERS: ${CARD_PLAYERS.length}`);

const folderByTeam = new Map<string, Set<string>>();
for (const p of CARD_PLAYERS) {
  if (!folderByTeam.has(p.team)) folderByTeam.set(p.team, new Set());
  folderByTeam.get(p.team)!.add(p.folder);
}
const multiFolder = [...folderByTeam.entries()].filter(([,s]) => s.size > 1);
console.log("\n=== Teams with inconsistent folders ===");
console.log(multiFolder.length ? multiFolder.map(([t,s])=>`${t}: ${[...s]}`) : "(none)");

const ids = CARD_PLAYERS.map(p=>p.id);
const dupIds = ids.filter((id,i)=>ids.indexOf(id)!==i);
console.log("\n=== Duplicate card ids ===");
console.log(dupIds.length ? [...new Set(dupIds)] : "(none)");

const pj = (playersJson as any[]);
console.log(`\n=== players.json total: ${pj.length} ===`);

// Cross-reference: which players.json entries have NO card?
// CARD_PLAYERS ids strip underscores from players.json ids (see cards code:
// id.replace(/_/g, "")). Also match on normalised name as a fallback.
import { CARD_PLAYER_ID_ALIASES } from "../app/data/cardPlayers";
const cardIds = new Set(CARD_PLAYERS.map(p => p.id));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const cardNames = new Set(CARD_PLAYERS.map(p => norm(p.name)));

const missing = pj.filter((p) => {
  const stripped = String(p.id).replace(/_/g, "");
  const aliased = CARD_PLAYER_ID_ALIASES[stripped] ?? stripped;
  if (cardIds.has(stripped) || cardIds.has(aliased)) return false;
  if (cardNames.has(norm(p.name))) return false;
  // also check any aliases listed in players.json
  const aliasNames: string[] = Array.isArray(p.aliases) ? p.aliases : [];
  if (aliasNames.some((a) => cardNames.has(norm(a)))) return false;
  return true;
});

console.log(`\n=== players.json entries with NO card (${missing.length}) ===`);
for (const p of missing.sort((a,b)=>String(a.team).localeCompare(String(b.team)))) {
  console.log(`  ${String(p.team ?? "?").padEnd(20)} ${p.name}  (id: ${p.id})`);
}
