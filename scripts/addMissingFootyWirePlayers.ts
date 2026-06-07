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

const TEAM_BY_FOOTYWIRE_SLUG: Record<string, string> = {
  "adelaide-crows": "Adelaide",
  "brisbane-lions": "Brisbane",
  "carlton-blues": "Carlton",
  "collingwood-magpies": "Collingwood",
  "essendon-bombers": "Essendon",
  "fremantle-dockers": "Fremantle",
  "geelong-cats": "Geelong",
  "gold-coast-suns": "Gold Coast",
  "greater-western-sydney-giants": "GWS",
  "hawthorn-hawks": "Hawthorn",
  kangaroos: "North Melbourne",
  "melbourne-demons": "Melbourne",
  "port-adelaide-power": "Port Adelaide",
  "richmond-tigers": "Richmond",
  "st-kilda-saints": "St Kilda",
  "sydney-swans": "Sydney",
  "west-coast-eagles": "West Coast",
  "western-bulldogs": "Western Bulldogs",
};

const FIRST_NAME_ALIASES: Record<string, string[]> = {
  archie: ["archer"],
  bradley: ["brad"],
  christopher: ["chris"],
  daniel: ["dan"],
  harrison: ["harry"],
  joseph: ["joe"],
  leonardo: ["leo"],
  matthew: ["matt", "matty"],
  mitchell: ["mitch"],
  mitchito: ["mitch"],
  nikolas: ["nik"],
  oliver: ["ollie"],
  robert: ["rob"],
  zachary: ["zach", "zac"],
  thomas: ["tom"],
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

const NAME_CORRECTIONS: Record<string, string> = {
  "Brodie Ryan|Hawthorn": "Bodie Ryan",
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

function makeUniqueFoopyId(name: string, team: string, players: FoopyPlayer[]) {
  const id = makeFoopyId(name);
  if (!players.some((player) => player.id === id)) return id;
  return `${id}_${makeFoopyId(team)}`;
}

function normaliseFootyWireUrl(url: string | undefined) {
  if (!url) return "";
  const fixed = url.replace(
    /^https:\/\/www\.footywire\.compp-/,
    "https://www.footywire.com/afl/footy/pp-"
  );
  return fixed.replace(
    /^https:\/\/www\.footywire\.com\/pp-/,
    "https://www.footywire.com/afl/footy/pp-"
  ).replace(
    "/pp-north-melbourne-kangaroos--",
    "/pp-kangaroos--"
  );
}

function isValidFootyWireUrl(url: string | undefined) {
  return Boolean(
    url &&
      /^https:\/\/www\.footywire\.com\/afl\/footy\/pp-[a-z0-9-]+--[a-z0-9-]+$/.test(url)
  );
}

function teamFromFootyWireUrl(url: string) {
  const slug = url.match(/\/pp-(.+?)--/)?.[1];
  return slug ? TEAM_BY_FOOTYWIRE_SLUG[slug] : undefined;
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

  const withoutSuffix = cleanName.replace(/\s+(jr|junior)$/i, "");
  if (withoutSuffix !== cleanName) {
    keys.add(normalizeName(withoutSuffix));
    keys.add(makeFoopyId(withoutSuffix));
  }

  const spellingVariants = [
    cleanName.replace(/\bhofmann\b/i, "Hoffman"),
    cleanName.replace(/\bhoffman\b/i, "Hofmann"),
    cleanName.replace(/\broberts-thompson\b/i, "Roberts-Thomson"),
    cleanName.replace(/\broberts-thomson\b/i, "Roberts-Thompson"),
  ];

  for (const variant of spellingVariants) {
    if (variant !== cleanName) {
      keys.add(normalizeName(variant));
      keys.add(makeFoopyId(variant));
    }
  }

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

function mergePlayer(target: FoopyPlayer, source: FoopyPlayer) {
  const aliases = new Set([...(target.aliases || []), ...(source.aliases || [])]);
  if (target.name !== source.name) aliases.add(source.name);

  target.aliases = [...aliases].filter((alias) => alias && alias !== target.name).sort();
  target.apiSportsId ??= source.apiSportsId;
  target.eventIds = Array.from(new Set([...(target.eventIds || []), ...(source.eventIds || [])])).sort((a, b) => a - b);
  target.statsIds = Array.from(new Set([...(target.statsIds || []), ...(source.statsIds || [])])).sort((a, b) => a - b);

  if (!isValidFootyWireUrl(target.footyWireUrl) && isValidFootyWireUrl(source.footyWireUrl)) {
    target.footyWireUrl = source.footyWireUrl;
  }
}

function playerScore(player: FoopyPlayer) {
  return (
    (player.apiSportsId ? 1000 : 0) +
    (player.eventIds?.length || 0) * 10 +
    (player.statsIds?.length || 0) * 5 +
    (isValidFootyWireUrl(player.footyWireUrl) ? 1 : 0)
  );
}

function identityKeys(player: FoopyPlayer) {
  const keys = getExistingKeys(player).map((key) => `${player.team}|name|${key}`);
  if (isValidFootyWireUrl(player.footyWireUrl)) {
    keys.push(`${player.team}|url|${player.footyWireUrl}`);
  }
  return keys;
}

function mergeDuplicatePlayers(players: FoopyPlayer[]) {
  const mergedPlayers: FoopyPlayer[] = [];
  const playerByKey = new Map<string, FoopyPlayer>();
  let merged = 0;

  for (const player of [...players].sort((a, b) => playerScore(b) - playerScore(a))) {
    const match = identityKeys(player)
      .map((key) => playerByKey.get(key))
      .find((candidate): candidate is FoopyPlayer => Boolean(candidate));

    if (match) {
      mergePlayer(match, player);
      merged++;
      for (const key of identityKeys(match)) playerByKey.set(key, match);
      continue;
    }

    mergedPlayers.push(player);
    for (const key of identityKeys(player)) playerByKey.set(key, player);
  }

  return { players: mergedPlayers, merged };
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

    const footyWireUrl = href.startsWith("http")
      ? href
      : `https://www.footywire.com${href.startsWith("/") ? href : `/afl/footy/${href}`}`;

    const team = teamFromFootyWireUrl(normaliseFootyWireUrl(footyWireUrl)) ?? TEAM_MAP[teamNick];

    players.push({
      name: flipName(rawName),
      team,
      footyWireUrl: normaliseFootyWireUrl(footyWireUrl),
    });
  });

  return players;
}

async function main() {
  let existing: FoopyPlayer[] = JSON.parse(
    fs.readFileSync(PLAYERS_PATH, "utf8")
  );

  let urlsFixed = 0;
  let eventIdsFixed = 0;
  let namesFixed = 0;
  let duplicatesMerged = 0;

  for (const player of existing) {
    const correctedName = NAME_CORRECTIONS[`${player.name}|${player.team}`];
    if (correctedName && player.name !== correctedName) {
      if (!player.aliases.includes(player.name)) player.aliases.push(player.name);
      player.name = correctedName;
      namesFixed++;
    }

    const normalisedUrl = normaliseFootyWireUrl(player.footyWireUrl);
    if (normalisedUrl && normalisedUrl !== player.footyWireUrl) {
      player.footyWireUrl = normalisedUrl;
      urlsFixed++;
    }

    if (!Array.isArray(player.eventIds)) {
      player.eventIds = player.eventIds == null ? [] : [Number(player.eventIds)].filter(Number.isFinite);
      eventIdsFixed++;
    }
  }

  const initialMerge = mergeDuplicatePlayers(existing);
  existing = initialMerge.players;
  duplicatesMerged += initialMerge.merged;

  const existingKeys = new Set<string>();

  for (const player of existing) {
    for (const key of getExistingKeys(player)) {
      existingKeys.add(`${player.team}|${key}`);
    }
  }

  const footyWirePlayers = await scrapeFootyWirePlayers();

  let added = 0;
  let aliasesAdded = 0;

  for (const fw of footyWirePlayers) {
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

      if (!isValidFootyWireUrl(matchingPlayer.footyWireUrl)) {
        matchingPlayer.footyWireUrl = fw.footyWireUrl;
        urlsFixed++;
      }

      for (const key of fwKeys) {
        existingKeys.add(`${fw.team}|${key}`);
      }

      continue;
    }

    if (fwKeys.some((key) => existingKeys.has(`${fw.team}|${key}`))) continue;

    const id = makeUniqueFoopyId(fw.name, fw.team, existing);

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
      existingKeys.add(`${fw.team}|${key}`);
    }

    added++;
  }

  const finalMerge = mergeDuplicatePlayers(existing);
  existing = finalMerge.players;
  duplicatesMerged += finalMerge.merged;

  existing.sort((a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team));

  fs.writeFileSync(PLAYERS_PATH, JSON.stringify(existing, null, 2));

  console.log(`FootyWire players found: ${footyWirePlayers.length}`);
  console.log(`Added missing players: ${added}`);
  console.log(`Aliases added to existing players: ${aliasesAdded}`);
  console.log(`FootyWire URLs fixed/filled: ${urlsFixed}`);
  console.log(`eventIds arrays fixed: ${eventIdsFixed}`);
  console.log(`Names corrected: ${namesFixed}`);
  console.log(`Duplicate ids merged: ${duplicatesMerged}`);
  console.log(`Total players now: ${existing.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
