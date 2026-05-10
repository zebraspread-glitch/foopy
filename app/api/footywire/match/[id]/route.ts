import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function num(value: string) {
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const url = `https://www.footywire.com/afl/footy/ft_match_statistics?mid=${id}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Foopy AFL App",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ stats: [], teamStats: null });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const stats: any[] = [];

    let teamStats: any = null;

    $("table").each((_, table) => {
      const tableText = clean($(table).text());

      if (tableText.includes("Head to Head") && tableText.includes("Frees For")) {
        const rows = $(table).find("tr");

        let homeTeam = "";
        let awayTeam = "";
        let homeFreesFor = 0;
        let awayFreesFor = 0;
        let homeFreesAgainst = 0;
        let awayFreesAgainst = 0;

        rows.each((_, row) => {
          const cells = $(row)
            .find("td")
            .map((_, cell) => clean($(cell).text()))
            .get();

          if (cells.length < 3) return;

          if (cells[1] === "Statistic") {
            homeTeam = cells[0];
            awayTeam = cells[2];
          }

          if (cells[1] === "Frees For") {
            homeFreesFor = num(cells[0]);
            awayFreesFor = num(cells[2]);
          }

          if (cells[1] === "Frees Against") {
            homeFreesAgainst = num(cells[0]);
            awayFreesAgainst = num(cells[2]);
          }
        });

        teamStats = {
          homeTeam,
          awayTeam,
          home: {
            freesFor: homeFreesFor,
            freesAgainst: homeFreesAgainst,
          },
          away: {
            freesFor: awayFreesFor,
            freesAgainst: awayFreesAgainst,
          },
        };
      }
    });

    $("table").each((_, table) => {
      const rows = $(table).find("tr");

      rows.each((_, row) => {
        const cells = $(row)
          .find("td")
          .map((_, cell) => clean($(cell).text()))
          .get();

        if (cells.length < 10) return;

        const player = cells[0];

        if (!player || player.length > 40 || player === "Player") return;

        stats.push({
          player,
          kicks: num(cells[1]),
          handballs: num(cells[2]),
          disposals: num(cells[3]),
          marks: num(cells[4]),
          goals: num(cells[5]),
          behinds: num(cells[6]),
          tackles: num(cells[7]),
          hitouts: num(cells[8]),
          fantasy: num(cells[16] || "0"),
          supercoach: num(cells[17] || "0"),
        });
      });
    });

    return NextResponse.json({
      id,
      count: stats.length,
      stats,
      teamStats,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json({ stats: [], teamStats: null });
  }
}