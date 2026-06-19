import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// Canonical team key that folds historical / relocated names onto the
// modern club so head-to-head history lines up across eras.
//   Footscray        → Western Bulldogs
//   South Melbourne  → Sydney
//   Brisbane Bears   → Brisbane Lions
//   Kangaroos        → North Melbourne
// Fitzroy is kept separate (the club folded; its lineage is contested).
function canonicalTeamKey(team: string) {
  const key = String(team || "").toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    adelaide: "adelaide",
    adelaidecrows: "adelaide",
    brisbane: "brisbane",
    brisbanelions: "brisbane",
    brisbanebears: "brisbane",
    carlton: "carlton",
    carltonblues: "carlton",
    collingwood: "collingwood",
    collingwoodmagpies: "collingwood",
    essendon: "essendon",
    essendonbombers: "essendon",
    fremantle: "fremantle",
    fremantledockers: "fremantle",
    geelong: "geelong",
    geelongcats: "geelong",
    goldcoast: "goldcoast",
    goldcoastsuns: "goldcoast",
    gws: "gws",
    gwsgiants: "gws",
    greaterwesternsydney: "gws",
    greaterwesternsydneygiants: "gws",
    hawthorn: "hawthorn",
    hawthornhawks: "hawthorn",
    melbourne: "melbourne",
    melbournedemons: "melbourne",
    northmelbourne: "northmelbourne",
    northmelbournekangaroos: "northmelbourne",
    kangaroos: "northmelbourne",
    portadelaide: "portadelaide",
    portadelaidepower: "portadelaide",
    power: "portadelaide",
    richmond: "richmond",
    richmondtigers: "richmond",
    stkilda: "stkilda",
    stkildasaints: "stkilda",
    sydney: "sydney",
    sydneyswans: "sydney",
    southmelbourne: "sydney",
    westcoast: "westcoast",
    westcoasteagles: "westcoast",
    westernbulldogs: "westernbulldogs",
    footscray: "westernbulldogs",
    bulldogs: "westernbulldogs",
    fitzroy: "fitzroy",
    university: "university",
  };
  return aliases[key] ?? key;
}

type CacheGame = {
  id: number;
  year: number;
  round: number;
  roundname: string;
  hteam: string;
  ateam: string;
  hscore: number | null;
  ascore: number | null;
  venue: string;
  date: string;
  winner: string | null;
  complete: number;
  is_final?: number;
  is_grand_final?: number;
};

type Meeting = {
  id: number;
  year: number;
  roundname: string;
  hteam: string;
  ateam: string;
  hscore: number;
  ascore: number;
  venue: string;
  date: string;
  winner: string | null;
  isFinal: boolean;
  isGrandFinal: boolean;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") ?? "";
  const away = searchParams.get("away") ?? "";

  const keyA = canonicalTeamKey(home);
  const keyB = canonicalTeamKey(away);

  if (!keyA || !keyB || keyA === keyB) {
    return Response.json({ error: "Two distinct teams required" }, { status: 400 });
  }

  const cacheDir = path.join(process.cwd(), "app/data/season-cache");
  let files: string[] = [];
  try {
    files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  } catch {
    return Response.json({ meetings: [], summary: null });
  }

  // Newest season first.
  files.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

  const meetings: Meeting[] = [];
  for (const file of files) {
    let data: { games?: CacheGame[] };
    try {
      data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), "utf-8"));
    } catch {
      continue;
    }
    for (const g of data.games ?? []) {
      if (Number(g.complete) < 100) continue;
      if (g.hscore == null || g.ascore == null) continue;
      const kh = canonicalTeamKey(g.hteam);
      const ka = canonicalTeamKey(g.ateam);
      const isMatch = (kh === keyA && ka === keyB) || (kh === keyB && ka === keyA);
      if (!isMatch) continue;
      meetings.push({
        id: g.id,
        year: g.year,
        roundname: g.roundname,
        hteam: g.hteam,
        ateam: g.ateam,
        hscore: Number(g.hscore),
        ascore: Number(g.ascore),
        venue: g.venue,
        date: g.date,
        winner: g.winner,
        isFinal: Boolean(g.is_final) || Boolean(g.is_grand_final),
        isGrandFinal: Boolean(g.is_grand_final),
      });
    }
  }

  // Most recent meeting first.
  meetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Head-to-head tally (by canonical key of the two requested teams).
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  for (const m of meetings) {
    if (!m.winner || m.hscore === m.ascore) {
      draws++;
      continue;
    }
    const wk = canonicalTeamKey(m.winner);
    if (wk === keyA) winsA++;
    else if (wk === keyB) winsB++;
    else draws++;
  }

  return Response.json(
    {
      meetings,
      summary: {
        total: meetings.length,
        home: { name: home, key: keyA, wins: winsA },
        away: { name: away, key: keyB, wins: winsB },
        draws,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    }
  );
}
