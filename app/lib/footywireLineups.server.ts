import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";

// ── FootyWire team-selections scraper ────────────────────────────────────────
// Parses https://www.footywire.com/afl/footy/afl_team_selections, which lists
// the officially named teams (released progressively Thu–Sat) including explicit
// Ins / Outs, the on-field 18 by line, interchange, and emergencies per team.
// Players are matched back to app/data/players.json via their FootyWire slug.

export type LineupPlayer = {
  name: string;
  team: string;
  id: string | null;        // players.json id (for profile links / images)
  apiSportsId: number | null;
  pos?: string;             // on-field line label (FB/HB/C/HF/FF/Fol)
};

export type TeamLineup = {
  team: string;
  onfield: LineupPlayer[];
  interchange: LineupPlayer[];
  emergencies: LineupPlayer[];
  ins: LineupPlayer[];
  outs: LineupPlayer[];
};

export type ScrapedGame = {
  home: string;
  away: string;
  venue: string;
  teams: Record<string, TeamLineup>;
};

const SELECTIONS_URL = "https://www.footywire.com/afl/footy/afl_team_selections";

// FootyWire club slug → app team name (matches players.json `team` field).
const TEAM_SLUG: Record<string, string> = {
  "adelaide-crows": "Adelaide",
  "brisbane-lions": "Brisbane",
  "carlton-blues": "Carlton",
  "collingwood-magpies": "Collingwood",
  "essendon-bombers": "Essendon",
  "fremantle-dockers": "Fremantle",
  "geelong-cats": "Geelong",
  "gold-coast-suns": "Gold Coast",
  "gws-giants": "GWS",
  "greater-western-sydney-giants": "GWS",
  "hawthorn-hawks": "Hawthorn",
  "melbourne-demons": "Melbourne",
  "kangaroos": "North Melbourne",
  "north-melbourne-kangaroos": "North Melbourne",
  "port-adelaide-power": "Port Adelaide",
  "richmond-tigers": "Richmond",
  "st-kilda-saints": "St Kilda",
  "sydney-swans": "Sydney",
  "west-coast-eagles": "West Coast",
  "western-bulldogs": "Western Bulldogs",
};

const SECTIONS = ["Interchange", "Emergencies", "Ins", "Outs"] as const;
const POSITIONS = new Set(["FB", "HB", "C", "HF", "FF", "Fol", "Foll", "Ruck", "INT"]);

function teamFromSlug(slug: string): string {
  const m = slug.match(/^pp-(.+?)--/);
  if (!m) return "";
  return TEAM_SLUG[m[1]] ?? m[1];
}

function loadSlugIndex(): Map<string, { id: string; apiSportsId: number | null; name: string }> {
  const index = new Map<string, { id: string; apiSportsId: number | null; name: string }>();
  try {
    const players: any[] = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "app", "data", "players.json"), "utf8")
    );
    for (const p of players) {
      if (!p.footyWireUrl) continue;
      const m = String(p.footyWireUrl).match(/pp-[^/]+/);
      if (m) index.set(m[0], { id: p.id, apiSportsId: p.apiSportsId ?? null, name: p.name });
    }
  } catch {}
  return index;
}

export async function scrapeLineups(): Promise<ScrapedGame[]> {
  const res = await fetch(SELECTIONS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FoopyBot/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FootyWire HTTP ${res.status}`);
  const html = await res.text();

  const slugIndex = loadSlugIndex();
  // Each game block follows a <a name="<gameid>"> anchor.
  const segments = html.split(/<a name="\d+">/).slice(1);
  const games: ScrapedGame[] = [];

  for (const seg of segments) {
    const titleM = seg.match(
      /([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*) v ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*) \(([^)]+)\)/
    );
    if (!titleM) continue;
    const home = titleM[1];
    const away = titleM[2];
    const venue = titleM[3];

    const $ = cheerio.load(seg);
    const teams: Record<string, TeamLineup> = {};
    const ensure = (t: string): TeamLineup =>
      (teams[t] ??= { team: t, onfield: [], interchange: [], emergencies: [], ins: [], outs: [] });

    const parsePlayer = (el: any): LineupPlayer | null => {
      const href = $(el).attr("href") ?? "";
      const slug = (href.match(/pp-[^/?"]+/) ?? [])[0];
      if (!slug) return null;
      const team = teamFromSlug(slug);
      if (!team) return null;
      const matched = slugIndex.get(slug);
      return {
        // Prefer the full name from players.json (better display + image lookup);
        // fall back to FootyWire's abbreviated name when unmatched.
        name: matched?.name ?? $(el).text().trim(),
        team,
        id: matched?.id ?? null,
        apiSportsId: matched?.apiSportsId ?? null,
      };
    };

    // 1) Column tables — each holds one team's Interchange / Emergencies / Ins / Outs.
    $("table").each((_i, tbl) => {
      let cur: keyof TeamLineup | null = null;
      $(tbl)
        .find("tr")
        .each((_j, tr) => {
          const label = $(tr).find("td").first().text().trim();
          if ((SECTIONS as readonly string[]).includes(label)) {
            cur = label.toLowerCase() as keyof TeamLineup;
            return;
          }
          if (!cur) return;
          $(tr)
            .find('a[href*="pp-"]')
            .each((_k, a) => {
              const info = parsePlayer(a);
              if (info) (ensure(info.team)[cur as "ins"] as LineupPlayer[]).push(info);
            });
        });
    });

    // 2) On-field grid — rows shaped [position, name, name, name].
    $("tr").each((_i, tr) => {
      const cells = $(tr).find("td");
      const label = $(cells[0]).text().trim();
      if (!POSITIONS.has(label)) return;
      $(tr)
        .find('a[href*="pp-"]')
        .each((_k, a) => {
          const info = parsePlayer(a);
          if (info) ensure(info.team).onfield.push({ ...info, pos: label });
        });
    });

    if (Object.keys(teams).length > 0) games.push({ home, away, venue, teams });
  }

  return games;
}
