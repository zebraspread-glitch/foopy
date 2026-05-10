import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

function normalize(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getYearFromDate(date: string | null) {
  if (!date) return String(new Date().getFullYear());

  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? String(year) : String(new Date().getFullYear());
}

function getDateParts(date: string | null) {
  if (!date) return null;

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  return {
    year: d.getFullYear(),
    monthShort: d.toLocaleDateString("en-AU", { month: "short" }).toLowerCase(),
    monthLong: d.toLocaleDateString("en-AU", { month: "long" }).toLowerCase(),
    day: String(d.getDate()),
  };
}

function rowHasDate(rowTextRaw: string, dateRaw: string | null) {
  const parts = getDateParts(dateRaw);
  if (!parts) return true;

  const raw = rowTextRaw.toLowerCase();
  const normalized = normalize(rowTextRaw);

  const hasYear = raw.includes(String(parts.year));
  const hasDay =
    normalized.includes(`${parts.day}${parts.monthShort}`) ||
    normalized.includes(`${parts.day}${parts.monthLong}`) ||
    normalized.includes(`${parts.monthShort}${parts.day}`) ||
    normalized.includes(`${parts.monthLong}${parts.day}`) ||
    raw.includes(` ${parts.day} `) ||
    raw.includes(`${parts.day},`);

  const hasMonth =
    raw.includes(parts.monthShort) || raw.includes(parts.monthLong);

  return hasYear && hasDay && hasMonth;
}

function getTeamAliases(team: string) {
  const n = normalize(team);

  const aliases: Record<string, string[]> = {
    adelaide: ["adelaide", "crows"],
    brisbane: ["brisbane", "brisbanelions", "lions"],
    brisbanelions: ["brisbane", "brisbanelions", "lions"],
    carlton: ["carlton", "blues"],
    collingwood: ["collingwood", "magpies"],
    essendon: ["essendon", "bombers"],
    fremantle: ["fremantle", "dockers"],
    geelong: ["geelong", "geelongcats", "cats"],
    geelongcats: ["geelong", "geelongcats", "cats"],
    goldcoast: ["goldcoast", "suns"],
    gws: ["gws", "greaterwesternsydney", "giants"],
    gwsgiants: ["gws", "greaterwesternsydney", "giants"],
    greaterwesternsydney: ["gws", "greaterwesternsydney", "giants"],
    hawthorn: ["hawthorn", "hawks"],
    melbourne: ["melbourne", "demons"],
    northmelbourne: ["northmelbourne", "kangaroos"],
    portadelaide: ["portadelaide", "port", "power"],
    richmond: ["richmond", "tigers"],
    stkilda: ["stkilda", "saints"],
    sydney: ["sydney", "swans"],
    westcoast: ["westcoast", "eagles"],
    westernbulldogs: ["westernbulldogs", "bulldogs"],
  };

  return aliases[n] ?? [n];
}

function rowHasTeam(rowText: string, team: string) {
  return getTeamAliases(team).some((alias) => rowText.includes(alias));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const homeRaw = searchParams.get("home") || "";
  const awayRaw = searchParams.get("away") || "";
  const dateRaw = searchParams.get("date");

  const year = getYearFromDate(dateRaw);

  if (!homeRaw || !awayRaw) {
    return NextResponse.json({ matchId: null, error: "Missing teams" });
  }

  try {
    const url = `https://www.footywire.com/afl/footy/ft_match_list?year=${year}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Foopy AFL App - zebraspread@gmail.com",
        Accept: "text/html",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({
        matchId: null,
        error: "Failed to fetch FootyWire match list",
        status: res.status,
      });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    let matchId: string | null = null;
    const checkedRows: string[] = [];

    $("tr").each((_, row) => {
      if (matchId) return false;

      const rowTextRaw = $(row).text();
      const rowText = normalize(rowTextRaw);

      const hasHome = rowHasTeam(rowText, homeRaw);
      const hasAway = rowHasTeam(rowText, awayRaw);
      const hasDate = rowHasDate(rowTextRaw, dateRaw);

      if (hasHome && hasAway) {
        checkedRows.push(rowTextRaw.trim().replace(/\s+/g, " ").slice(0, 200));
      }

      if (!hasHome || !hasAway || !hasDate) return;

      const href =
        $(row).find('a[href*="ft_match_statistics"]').attr("href") ||
        $(row).find('a[href*="mid="]').attr("href") ||
        "";

      const found = href.match(/mid=(\d+)/);

      if (found?.[1]) {
        matchId = found[1];
        return false;
      }
    });

    return NextResponse.json({
      matchId,
      home: homeRaw,
      away: awayRaw,
      date: dateRaw,
      year,
      source: url,
      checkedRows,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { matchId: null, error: "Failed to match FootyWire game" },
      { status: 500 }
    );
  }
}