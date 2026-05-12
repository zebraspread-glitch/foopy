import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function foopyRating(p: {
  goals: number; goalAssists: number; behinds: number;
  kicks: number; handballs: number; marks: number; tackles: number;
  hitouts: number; disposals: number; clearances: number;
  freesFor: number; freesAgainst: number;
}): number {
  let score =
    p.goals * 5.5 + p.goalAssists * 1.5 + p.behinds * 1.2 +
    p.kicks * 0.75 + p.handballs * 0.55 + p.marks * 1.0 +
    p.tackles * 1.8 + p.hitouts * 0.35 + p.clearances * 0.5 +
    p.freesFor * 0.3 - p.freesAgainst * 0.4;
  if (p.goals >= 3)        score += 3;
  if (p.goals >= 5)        score += 5;
  if (p.goals >= 7)        score += 10;
  if (p.goals >= 10)       score += 18;
  if (p.goalAssists >= 3)  score += 1;
  if (p.disposals >= 25)   score += 3;
  if (p.disposals >= 30)   score += 4;
  if (p.tackles >= 8)      score += 4;
  if (p.clearances >= 7)   score += 1;
  if (p.marks >= 10)       score += 3;
  if (p.hitouts >= 25)     score += 3;
  if (p.freesAgainst >= 4) score -= 1;
  if (score <= 0) return 0;
  return Number(Math.max(1, Math.min(10, 10 * (1 - Math.exp(-score / 65)))).toFixed(2));
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const dataDir = path.join(process.cwd(), "app", "data");

  const players   = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const season    = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const gameStats = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  const playerInfo = players.find((p: { id: string }) => p.id === slug);
  if (!playerInfo) return NextResponse.json(null, { status: 404 });

  const seasonStats = season.find((p: { id: string }) => p.id === slug) ?? null;
  const apiSportsId = playerInfo.apiSportsId as number | null;

  const recentGames: {
    gameId: number; date: string; goals: number; goalAssists: number;
    behinds: number; disposals: number; kicks: number; handballs: number;
    marks: number; tackles: number; hitouts: number; clearances: number;
    foopy: number;
  }[] = [];

  if (apiSportsId) {
    const allGames = Object.values(gameStats as Record<string, {
      gameId: number; date: string;
      teams: { players: { player: { id: number }; goals: { total: number; assists: number };
        behinds: number; disposals: number; kicks: number; handballs: number;
        marks: number; tackles: number; hitouts: number; clearances: number;
        free_kicks: { for: number; against: number } }[] }[];
    }>);

    const matching = allGames
      .filter(g => g.teams?.some(t => t.players?.some(p => p.player?.id === apiSportsId)))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    for (const game of matching) {
      for (const teamData of game.teams ?? []) {
        const ps = teamData.players?.find(p => p.player?.id === apiSportsId);
        if (!ps) continue;
        recentGames.push({
          gameId:      game.gameId,
          date:        game.date,
          goals:       num(ps.goals?.total),
          goalAssists: num(ps.goals?.assists),
          behinds:     num(ps.behinds),
          disposals:   num(ps.disposals),
          kicks:       num(ps.kicks),
          handballs:   num(ps.handballs),
          marks:       num(ps.marks),
          tackles:     num(ps.tackles),
          hitouts:     num(ps.hitouts),
          clearances:  num(ps.clearances),
          foopy: foopyRating({
            goals:        num(ps.goals?.total),
            goalAssists:  num(ps.goals?.assists),
            behinds:      num(ps.behinds),
            kicks:        num(ps.kicks),
            handballs:    num(ps.handballs),
            marks:        num(ps.marks),
            tackles:      num(ps.tackles),
            hitouts:      num(ps.hitouts),
            disposals:    num(ps.disposals),
            clearances:   num(ps.clearances),
            freesFor:     num(ps.free_kicks?.for),
            freesAgainst: num(ps.free_kicks?.against),
          }),
        });
      }
    }
  }

  return NextResponse.json({ player: playerInfo, season: seasonStats, recentGames });
}
