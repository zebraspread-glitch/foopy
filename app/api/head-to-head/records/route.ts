import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// Canonical key folding historical / relocated names onto the modern club.
function canonicalTeamKey(team: string) {
  const key = String(team || "").toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    adelaide: "adelaide", adelaidecrows: "adelaide",
    brisbane: "brisbane", brisbanelions: "brisbane", brisbanebears: "brisbane",
    carlton: "carlton", carltonblues: "carlton",
    collingwood: "collingwood", collingwoodmagpies: "collingwood",
    essendon: "essendon", essendonbombers: "essendon",
    fremantle: "fremantle", fremantledockers: "fremantle",
    geelong: "geelong", geelongcats: "geelong",
    goldcoast: "goldcoast", goldcoastsuns: "goldcoast",
    gws: "gws", gwsgiants: "gws", greaterwesternsydney: "gws", greaterwesternsydneygiants: "gws",
    hawthorn: "hawthorn", hawthornhawks: "hawthorn",
    melbourne: "melbourne", melbournedemons: "melbourne",
    northmelbourne: "northmelbourne", northmelbournekangaroos: "northmelbourne", kangaroos: "northmelbourne",
    portadelaide: "portadelaide", portadelaidepower: "portadelaide", power: "portadelaide",
    richmond: "richmond", richmondtigers: "richmond",
    stkilda: "stkilda", stkildasaints: "stkilda",
    sydney: "sydney", sydneyswans: "sydney", southmelbourne: "sydney",
    westcoast: "westcoast", westcoasteagles: "westcoast",
    westernbulldogs: "westernbulldogs", footscray: "westernbulldogs", bulldogs: "westernbulldogs",
  };
  return aliases[key] ?? key;
}

// Modern clubs only — keeps records meaningful and logos available.
const NAME: Record<string, string> = {
  adelaide: "Adelaide", brisbane: "Brisbane Lions", carlton: "Carlton",
  collingwood: "Collingwood", essendon: "Essendon", fremantle: "Fremantle",
  geelong: "Geelong", goldcoast: "Gold Coast", gws: "Greater Western Sydney",
  hawthorn: "Hawthorn", melbourne: "Melbourne", northmelbourne: "North Melbourne",
  portadelaide: "Port Adelaide", richmond: "Richmond", stkilda: "St Kilda",
  sydney: "Sydney", westcoast: "West Coast", westernbulldogs: "Western Bulldogs",
};

// Minimum meetings for a win-% record to count (avoids tiny-sample noise).
const MIN_MEETINGS_FOR_PCT = 20;

type CacheGame = {
  hteam: string; ateam: string; hscore: number | null; ascore: number | null;
  date: string; year: number; complete: number;
};

type PairGame = { date: string; year: number; winKey: string | null };

export async function GET() {
  const pairs = new Map<string, { a: string; b: string; games: PairGame[] }>();

  const collect = (games: CacheGame[] | undefined) => {
    for (const g of games ?? []) {
      if (Number(g.complete) < 100) continue;
      if (g.hscore == null || g.ascore == null) continue;
      const kh = canonicalTeamKey(g.hteam);
      const ka = canonicalTeamKey(g.ateam);
      if (!NAME[kh] || !NAME[ka] || kh === ka) continue;
      const [a, b] = [kh, ka].sort();
      const id = `${a}|${b}`;
      let bucket = pairs.get(id);
      if (!bucket) { bucket = { a, b, games: [] }; pairs.set(id, bucket); }
      const hs = Number(g.hscore), as = Number(g.ascore);
      bucket.games.push({ date: g.date, year: g.year, winKey: hs === as ? null : hs > as ? kh : ka });
    }
  };

  // Past seasons from cache.
  const cacheDir = path.join(process.cwd(), "app/data/season-cache");
  let files: string[] = [];
  try { files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json")); } catch { files = []; }
  for (const file of files) {
    try { collect(JSON.parse(fs.readFileSync(path.join(cacheDir, file), "utf-8")).games); } catch { /* skip */ }
  }

  // Current season from the live feed.
  const currentYear = new Date().getFullYear();
  if (!files.includes(`${currentYear}.json`)) {
    try {
      const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${currentYear}`, {
        headers: { "User-Agent": "Foopy AFL App (foopy.app)" }, next: { revalidate: 3600 },
      });
      if (res.ok) collect((await res.json()).games);
    } catch { /* fall back to cache */ }
  }

  const longestCurrent: { team: string; opponent: string; len: number; since: number }[] = [];
  const longestEver: { team: string; opponent: string; len: number; fromYear: number; toYear: number }[] = [];
  const highestWinPct: { team: string; opponent: string; pct: number; wins: number; losses: number; total: number }[] = [];
  const mostPlayed: { teamA: string; teamB: string; total: number }[] = [];
  const mostWins: { team: string; opponent: string; wins: number; losses: number }[] = [];
  const mostDraws: { teamA: string; teamB: string; draws: number }[] = [];
  const closest: { teamA: string; teamB: string; winsA: number; winsB: number; total: number }[] = [];

  for (const { a, b, games } of pairs.values()) {
    games.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
    const total = games.length;

    // Most played.
    mostPlayed.push({ teamA: NAME[a], teamB: NAME[b], total });

    // Per-pair tallies.
    let winsA = 0, winsB = 0, draws = 0;
    for (const g of games) {
      if (g.winKey === a) winsA++;
      else if (g.winKey === b) winsB++;
      else draws++;
    }

    // Most wins by one team over a single opponent (both directions).
    mostWins.push({ team: NAME[a], opponent: NAME[b], wins: winsA, losses: winsB });
    mostWins.push({ team: NAME[b], opponent: NAME[a], wins: winsB, losses: winsA });

    // Most draws in a rivalry.
    if (draws > 0) mostDraws.push({ teamA: NAME[a], teamB: NAME[b], draws });

    // Closest rivalry — smallest win gap among well-played pairs.
    if (total >= MIN_MEETINGS_FOR_PCT) {
      closest.push({ teamA: NAME[a], teamB: NAME[b], winsA, winsB, total });
    }

    // Longest ever streak for this pair (best run in either direction).
    let runKey: string | null = null, runLen = 0, runFrom = 0;
    let pairBest: { team: string; opponent: string; len: number; fromYear: number; toYear: number } | null = null;
    for (const g of games) {
      if (g.winKey == null) { runKey = null; runLen = 0; continue; }
      if (g.winKey === runKey) runLen++;
      else { runKey = g.winKey; runLen = 1; runFrom = g.year; }
      if (!pairBest || runLen > pairBest.len) {
        pairBest = { team: NAME[g.winKey], opponent: NAME[g.winKey === a ? b : a], len: runLen, fromYear: runFrom, toYear: g.year };
      }
    }
    if (pairBest) longestEver.push(pairBest);

    // Current streak (from most recent game backward).
    let curKey: string | null = null, curLen = 0, curFrom = 0;
    for (let i = games.length - 1; i >= 0; i--) {
      const g = games[i];
      if (g.winKey == null) break;
      if (curLen === 0) { curKey = g.winKey; curLen = 1; curFrom = g.year; }
      else if (g.winKey === curKey) { curLen++; curFrom = g.year; }
      else break;
    }
    if (curKey && curLen >= 2) {
      longestCurrent.push({ team: NAME[curKey], opponent: NAME[curKey === a ? b : a], len: curLen, since: curFrom });
    }

    // Highest win % (min meetings), both directions.
    if (total >= MIN_MEETINGS_FOR_PCT) {
      for (const c of [
        { team: NAME[a], opponent: NAME[b], wins: winsA, losses: winsB },
        { team: NAME[b], opponent: NAME[a], wins: winsB, losses: winsA },
      ]) {
        highestWinPct.push({ ...c, pct: Math.round((c.wins / total) * 1000) / 10, total });
      }
    }
  }

  const TOP = 10;
  longestEver.sort((x, y) => y.len - x.len || y.toYear - x.toYear);
  longestCurrent.sort((x, y) => y.len - x.len || y.since - x.since);
  highestWinPct.sort((x, y) => y.pct - x.pct || y.total - x.total);
  mostWins.sort((x, y) => y.wins - x.wins || x.losses - y.losses);
  mostDraws.sort((x, y) => y.draws - x.draws);
  mostPlayed.sort((x, y) => y.total - x.total);
  closest.sort((x, y) => (Math.abs(x.winsA - x.winsB) - Math.abs(y.winsA - y.winsB)) || (y.total - x.total));

  return Response.json(
    {
      longestCurrent: longestCurrent.slice(0, TOP),
      longestEver: longestEver.slice(0, TOP),
      highestWinPct: highestWinPct.slice(0, TOP),
      mostWins: mostWins.slice(0, TOP),
      mostDraws: mostDraws.slice(0, TOP),
      closest: closest.slice(0, TOP),
      mostPlayed: mostPlayed.slice(0, TOP),
      minMeetings: MIN_MEETINGS_FOR_PCT,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
