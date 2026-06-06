import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { foopyRating } from "@/app/lib/foopyRating";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const TEAM_ID_MAP: Record<number, string> = {
  1: "Adelaide", 2: "Brisbane Lions", 3: "Carlton", 4: "Collingwood",
  5: "Essendon", 6: "Fremantle", 7: "Geelong", 8: "Hawthorn",
  9: "Melbourne", 10: "North Melbourne", 11: "Port Adelaide", 12: "Richmond",
  13: "St Kilda", 14: "Sydney", 15: "West Coast", 16: "Western Bulldogs",
  17: "Gold Coast", 18: "GWS",
};

function slugTeam(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamMatches(a: string, b: string) {
  return slugTeam(a) === slugTeam(b);
}

function idList(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const id = Number(value);
  return Number.isFinite(id) ? [id] : [];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const dataDir = path.join(process.cwd(), "app", "data");

  const players = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
  const season = JSON.parse(fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8"));
  const gameStats = JSON.parse(fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8"));

  const playerInfo = players.find((p: { id: string }) => p.id === slug);
  if (!playerInfo) return NextResponse.json(null, { status: 404 });

  const seasonStats = season.find((p: { id: string }) => p.id === slug) ?? null;
  const playerIds = new Set<number>();
  if (playerInfo.apiSportsId) playerIds.add(Number(playerInfo.apiSportsId));
  for (const eventId of idList(playerInfo.eventIds)) playerIds.add(eventId);
  for (const statsId of idList(playerInfo.statsIds)) playerIds.add(statsId);

  const recentGames: {
    gameId: number; date: string; goals: number; goalAssists: number;
    behinds: number; disposals: number; kicks: number; handballs: number;
    marks: number; tackles: number; hitouts: number; clearances: number;
    foopy: number;
  }[] = [];

  if (playerIds.size > 0) {
    const allGames = Object.values(gameStats as Record<string, {
      gameId: number;
      date: string;
      teams: {
        team?: { id: number; name?: string };
        players: {
          player: { id: number };
          goals: { total: number; assists: number };
          behinds: number;
          disposals: number;
          kicks: number;
          handballs: number;
          marks: number;
          tackles: number;
          hitouts: number;
          clearances: number;
          free_kicks: { for: number; against: number };
        }[];
      }[];
    }>);

    const matchesPlayer = (pid: number, teamId?: number) => {
      if (!playerIds.has(pid)) return false;
      const statTeam = teamId ? TEAM_ID_MAP[teamId] : "";
      return !statTeam || teamMatches(statTeam, playerInfo.team ?? "");
    };

    const matching = allGames
      .filter(g => g.teams?.some(t => t.players?.some(p => matchesPlayer(p.player?.id, t.team?.id))))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    for (const game of matching) {
      for (const teamData of game.teams ?? []) {
        const ps = teamData.players?.find(p => matchesPlayer(p.player?.id, teamData.team?.id));
        if (!ps) continue;

        recentGames.push({
          gameId: game.gameId,
          date: game.date,
          goals: num(ps.goals?.total),
          goalAssists: num(ps.goals?.assists),
          behinds: num(ps.behinds),
          disposals: num(ps.disposals),
          kicks: num(ps.kicks),
          handballs: num(ps.handballs),
          marks: num(ps.marks),
          tackles: num(ps.tackles),
          hitouts: num(ps.hitouts),
          clearances: num(ps.clearances),
          foopy: foopyRating({
            goals: num(ps.goals?.total),
            goalAssists: num(ps.goals?.assists),
            behinds: num(ps.behinds),
            kicks: num(ps.kicks),
            handballs: num(ps.handballs),
            marks: num(ps.marks),
            tackles: num(ps.tackles),
            hitouts: num(ps.hitouts),
            disposals: num(ps.disposals),
            clearances: num(ps.clearances),
            freesFor: num(ps.free_kicks?.for),
            freesAgainst: num(ps.free_kicks?.against),
          }),
        });
      }
    }
  }

  return NextResponse.json({ player: playerInfo, season: seasonStats, recentGames });
}
