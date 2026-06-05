import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-attendances
 *
 * Scrapes austadiums.com for AFL crowd figures and stores each game's
 * attendance in match_cache (data_type='attendance', keyed by the Squiggle
 * game_id). Matched to games by the two team names + date.
 *
 * Protected by CRON_SECRET. Fails gracefully — never throws, so a site
 * redesign can't break the venue card (it just keeps the last-known data).
 */

const SEASON = new Date().getFullYear().toString();

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Canonical team key — handles the cases where a substring match would be wrong
// (North Melbourne vs Melbourne, Port Adelaide vs Adelaide, GWS vs Sydney).
// austadiums uses long nickname forms ("Western Bulldogs", "Adelaide Crows"),
// Squiggle uses short city forms ("Western Bulldogs", "Adelaide").
function teamKey(name: string): string {
  const n = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
  if (n.includes("northmelbourne") || n.includes("kangaroo")) return "northmelbourne";
  if (n.includes("westernbulldog") || n === "bulldogs" || n === "footscray") return "bulldogs";
  if (n.includes("westcoast")) return "westcoast";
  if (n.includes("goldcoast")) return "goldcoast";
  if (n.includes("portadelaide")) return "portadelaide";
  if (n.includes("greaterwesternsydney") || n.includes("gws")) return "gws";
  if (n.includes("adelaide")) return "adelaide";
  if (n.includes("brisbane")) return "brisbane";
  if (n.includes("geelong")) return "geelong";
  if (n.includes("stkilda")) return "stkilda";
  if (n.includes("sydney")) return "sydney";
  if (n.includes("hawthorn")) return "hawthorn";
  if (n.includes("collingwood")) return "collingwood";
  if (n.includes("essendon")) return "essendon";
  if (n.includes("fremantle")) return "fremantle";
  if (n.includes("richmond")) return "richmond";
  if (n.includes("carlton")) return "carlton";
  if (n.includes("melbourne")) return "melbourne";
  return n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parse austadiums "Fri 5 Jun" → "MM-DD" (year-independent, matched within season)
function parseAusDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (!month || !day) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type AusRow = { dateKey: string; keyA: string; keyB: string; crowd: number };

function parseAustadiums(html: string): AusRow[] {
  const tbody = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
  const rows = tbody.split("<tr>").slice(1);
  const strip = (s: string) => s.replace(/<[^>]*>/g, "").trim();
  const out: AusRow[] = [];

  for (const row of rows) {
    const cells = row.split("<td>").slice(1).map(c => strip(c.split("</td>")[0]));
    if (cells.length < 4) continue;
    const [date, event, , crowd] = cells;
    const ev = event.replace(/^[A-Z]+:\s*/i, ""); // strip "AFL: " prefix
    const m = ev.match(/^(.+?)\s+(?:d|def|defeated|v|vs|drew|drew with|lost to)\s+(.+)$/i);
    if (!m) continue;
    const crowdNum = parseInt(crowd.replace(/[^0-9]/g, ""), 10);
    const dateKey = parseAusDate(date);
    if (!crowdNum || !dateKey) continue;
    out.push({ dateKey, keyA: teamKey(m[1]), keyB: teamKey(m[2]), crowd: crowdNum });
  }
  return out;
}

async function run() {
  const db = adminSupabase();

  // 1. Scrape austadiums
  let html = "";
  try {
    const res = await fetch("https://www.austadiums.com/sport/comp/afl/results", {
      headers: { "User-Agent": "Mozilla/5.0 (Foopy AFL App)" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `austadiums HTTP ${res.status}` }, { status: 502 });
    html = await res.text();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `austadiums fetch failed: ${e?.message}` }, { status: 502 });
  }

  const ausRows = parseAustadiums(html);
  if (ausRows.length === 0) {
    return NextResponse.json({ ok: false, error: "parsed 0 attendance rows" }, { status: 502 });
  }

  // 2. Fetch Squiggle games for the season to resolve game_ids
  let games: any[] = [];
  try {
    const sq = await fetch(`https://api.squiggle.com.au/?q=games;year=${SEASON}`, {
      headers: { "User-Agent": "Foopy AFL App" }, cache: "no-store",
    });
    if (sq.ok) games = (await sq.json()).games ?? [];
  } catch {}
  if (games.length === 0) {
    return NextResponse.json({ ok: false, error: "no squiggle games" }, { status: 502 });
  }

  // Lookup: "teamKeyA|teamKeyB(sorted)|MM-DD" → game_id
  const gameByKey = new Map<string, string>();
  for (const g of games) {
    const date = String(g.date ?? "").slice(0, 10); // YYYY-MM-DD
    const mmdd = date.slice(5); // MM-DD
    const pair = [teamKey(g.hteam), teamKey(g.ateam)].sort().join("|");
    gameByKey.set(`${pair}|${mmdd}`, String(g.id));
  }

  // 3. Match each austadiums row to a game and upsert attendance
  let matched = 0;
  const unmatched: string[] = [];
  const nowIso = new Date().toISOString();

  for (const r of ausRows) {
    const pair = [r.keyA, r.keyB].sort().join("|");
    const gameId = gameByKey.get(`${pair}|${r.dateKey}`);
    if (!gameId) { unmatched.push(`${pair}@${r.dateKey}`); continue; }

    const { error } = await db.from("match_cache").upsert(
      {
        game_id:    gameId,
        data_type:  "attendance",
        payload:    { attendance: r.crowd, source: "austadiums", updated_at: nowIso },
        fetched_at: nowIso,
        is_final:   true,
      },
      { onConflict: "game_id,data_type" }
    );
    if (!error) matched++;
  }

  return NextResponse.json({ ok: true, parsed: ausRows.length, matched, unmatched });
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return run();
}

// Manual trigger for testing
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const secret = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization");
  if (secret !== cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return run();
}
