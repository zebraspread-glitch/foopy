// scripts/addMissingFootyWirePlayers.ts
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

type FoopyPlayer = {
  id: string;
  name: string;
  team: string;
  aliases: string[];
  apiSportsId: number | null;
  eventIds: number[];
  statsIds: number[];
  footyWireUrl?: string;
};

const PLAYERS_PATH = path.join(process.cwd(), "app", "data", "players.json");
const FOOTYWIRE_URL = "https://www.footywire.com/afl/footy/ft_players";

const TEAM_MAP: Record<string, string> = {
  Crows: "Adelaide",
  Lions: "Brisbane",
  Blues: "Carlton",
  Magpies: "Collingwood",
  Bombers: "Essendon",
  Dockers: "Fremantle",
  Cats: "Geelong",
  Hawks: "Hawthorn",
  Demons: "Melbourne",
  Kangaroos: "North Melbourne",
  Power: "Port Adelaide",
  Tigers: "Richmond",
  Saints: "St Kilda",
  Swans: "Sydney",
  Eagles: "West Coast",
  Bulldogs: "Western Bulldogs",
  Suns: "Gold Coast",
  Giants: "GWS",
};

const FIRST_NAME_ALIASES: Record<string, string[]> = {
  zachary: ["zach"],
  thomas: ["tom"],
  matthew: ["matt"],
  william: ["will"],
  nicholas: ["nick", "nic"],
  lachlan: ["lachie"],
  cameron: ["cam"],
  benjamin: ["ben"],
  joshua: ["josh"],
  patrick: ["paddy"],
  charles: ["charlie"],
  samuel: ["sam"],
  maximilian: ["max"],
};

function makeFoopyId(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function flipName(name: string) {
  if (!name.includes(",")) return name.trim();

  const [last, first] = name.split(",").map((x) => x.trim());
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

function possibleNameKeys(name: string) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const parts = cleanName.toLowerCase().split(/\s+/);

  const first = parts[0];
  const rest = parts.slice(1).join(" ");

  const keys = new Set<string>();

  keys.add(normalizeName(cleanName));
  keys.add(makeFoopyId(cleanName));

  for (const [longName, shorts] of Object.entries(FIRST_NAME_ALIASES)) {
    if (first === longName) {
      for (const short of shorts) {
        keys.add(normalizeName(`${short} ${rest}`));
        keys.add(makeFoopyId(`${short} ${rest}`));
      }
    }

    if (shorts.includes(first)) {
      keys.add(normalizeName(`${longName} ${rest}`));
      keys.add(makeFoopyId(`${longName} ${rest}`));
    }
  }

  return [...keys];
}

function getExistingKeys(player: FoopyPlayer) {
  return [
    ...possibleNameKeys(player.name),
    ...(player.aliases || []).flatMap(possibleNameKeys),
  ];
}

async function scrapeFootyWirePlayers() {
  const res = await fetch(FOOTYWIRE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch FootyWire: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const players: { name: string; team: string; footyWireUrl: string }[] = [];

  $("a").each((_, el) => {
    const rawName = $(el).text().trim();
    const href = $(el).attr("href") || "";

    if (!rawName.includes(",")) return;

    const parentText = $(el).parent().text().replace(/\s+/g, " ").trim();

    const teamNick = Object.keys(TEAM_MAP).find((nick) =>
      parentText.includes(`${rawName} ${nick}`)
    );

    if (!teamNick) return;

    players.push({
      name: flipName(rawName),
      team: TEAM_MAP[teamNick],
      footyWireUrl: href.startsWith("http")
        ? href
        : `https://www.footywire.com${href}`,
    });
  });

  return players;
}

async function main() {
  const existing: FoopyPlayer[] = JSON.parse(
    fs.readFileSync(PLAYERS_PATH, "utf8")
  );

  const existingKeys = new Set<string>();

  for (const player of existing) {
    for (const key of getExistingKeys(player)) {
      existingKeys.add(key);
    }
  }

  const footyWirePlayers = await scrapeFootyWirePlayers();

  let added = 0;
  let aliasesAdded = 0;

  for (const fw of footyWirePlayers) {
    const id = makeFoopyId(fw.name);
    const fwKeys = possibleNameKeys(fw.name);

    const matchingPlayer = existing.find((player) => {
      if (player.team !== fw.team) return false;

      const playerKeys = getExistingKeys(player);
      return playerKeys.some((key) => fwKeys.includes(key));
    });

    if (matchingPlayer) {
      if (
        matchingPlayer.name !== fw.name &&
        !matchingPlayer.aliases.includes(fw.name)
      ) {
        matchingPlayer.aliases.push(fw.name);
        aliasesAdded++;
      }

      if (!matchingPlayer.footyWireUrl) {
        matchingPlayer.footyWireUrl = fw.footyWireUrl;
      }

      for (const key of fwKeys) {
        existingKeys.add(key);
      }

      continue;
    }

    if (fwKeys.some((key) => existingKeys.has(key))) continue;

    existing.push({
      id,
      name: fw.name,
      team: fw.team,
      aliases: [],
      apiSportsId: null,
      eventIds: [],
      statsIds: [],
      footyWireUrl: fw.footyWireUrl,
    });

    for (const key of fwKeys) {
      existingKeys.add(key);
    }

    added++;
  }

  existing.sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return a.name.localeCompare(b.name);
  });

  fs.writeFileSync(PLAYERS_PATH, JSON.stringify(existing, null, 2));

  console.log(`FootyWire players found: ${footyWirePlayers.length}`);
  console.log(`Added missing players: ${added}`);
  console.log(`Aliases added to existing players: ${aliasesAdded}`);
  console.log(`Total players now: ${existing.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});