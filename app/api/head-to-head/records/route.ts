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

  let longestCurrent: { team: string; opponent: string; len: number; since: number } | null = null;
  let longestEver: { team: string; opponent: string; len: number; fromYear: number; toYear: number } | null = null;
  let highestWinPct: { team: string; opponent: string; pct: number; wins: number; losses: number; total: number } | null = null;
  let mostPlayed: { teamA: string; teamB: string; total: number } | null = null;
  let mostWins: { team: string; opponent: string; wins: number; losses: number } | null = null;
  let mostDraws: { teamA: string; teamB: string; draws: number } | null = null;
  let closest: { teamA: string; teamB: string; winsA: number; winsB: number; total: number } | null = null;

  for (const { a, b, games } of pairs.values()) {
    games.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
    const total = games.length;

    // Most played.
    if (!mostPlayed || total > mostPlayed.total) mostPlayed = { teamA: NAME[a], teamB: NAME[b], total };

    // Per-pair tallies.
    let winsA = 0, winsB = 0, draws = 0;
    for (const g of games) {
      if (g.winKey === a) winsA++;
      else if (g.winKey === b) winsB++;
      else draws++;
    }

    // Most wins by one team over a single opponent.
    if (!mostWins || winsA > mostWins.wins) mostWins = { team: NAME[a], opponent: NAME[b], wins: winsA, losses: winsB };
    if (!mostWins || winsB > mostWins.wins) mostWins = { team: NAME[b], opponent: NAME[a], wins: winsB, losses: winsA };

    // Most draws in a rivalry.
    if (draws > 0 && (!mostDraws || draws > mostDraws.draws)) mostDraws = { teamA: NAME[a], teamB: NAME[b], draws };

    // Closest rivalry — smallest win gap among well-played pairs (ties → more meetings).
    if (total >= MIN_MEETINGS_FOR_PCT) {
      const gap = Math.abs(winsA - winsB);
      const bestGap = closest ? Math.abs(closest.winsA - closest.winsB) : Infinity;
      if (gap < bestGap || (gap === bestGap && closest && total > closest.total)) {
        closest = { teamA: NAME[a], teamB: NAME[b], winsA, winsB, total };
      }
    }

    // Longest ever streak.
    let runKey: string | null = null, runLen = 0, runFrom = 0;
    for (const g of games) {
      if (g.winKey == null) { runKey = null; runLen = 0; continue; }
      if (g.winKey === runKey) runLen++;
      else { runKey = g.winKey; runLen = 1; runFrom = g.year; }
      if (!longestEver || runLen > longestEver.len) {
        longestEver = { team: NAME[g.winKey], opponent: NAME[g.winKey === a ? b : a], len: runLen, fromYear: runFrom, toYear: g.year };
      }
    }

    // Current streak (from most recent game backward).
    let curKey: string | null = null, curLen = 0, curFrom = 0;
    for (let i = games.length - 1; i >= 0; i--) {
      const g = games[i];
      if (g.winKey == null) break;
      if (curLen === 0) { curKey = g.winKey; curLen = 1; curFrom = g.year; }
      else if (g.winKey === curKey) { curLen++; curFrom = g.year; }
      else break;
    }
    if (curKey && (!longestCurrent || curLen > longestCurrent.len)) {
      longestCurrent = { team: NAME[curKey], opponent: NAME[curKey === a ? b : a], len: curLen, since: curFrom };
    }

    // Highest win % (min meetings).
    if (total >= MIN_MEETINGS_FOR_PCT) {
      const candidates = [
        { team: NAME[a], opponent: NAME[b], wins: winsA, losses: winsB },
        { team: NAME[b], opponent: NAME[a], wins: winsB, losses: winsA },
      ];
      for (const c of candidates) {
        const pct = Math.round((c.wins / total) * 1000) / 10;
        if (!highestWinPct || pct > highestWinPct.pct) highestWinPct = { ...c, pct, total };
      }
    }
  }

  return Response.json(
    { longestCurrent, longestEver, highestWinPct, mostWins, mostDraws, closest, mostPlayed, minMeetings: MIN_MEETINGS_FOR_PCT },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
