import { NextResponse } from "next/server";
import { loadSeasonGameRatings } from "@/app/lib/seasonRatings";

export const dynamic = "force-dynamic";

type Poll = { round: number | null; opponent: string; votes: number; rating: number };

type Tally = {
  name: string;
  team: string;
  image: string;
  votes: number;
  threes: number;
  twos: number;
  ones: number;
  gamesPolled: number;
  polls: Poll[];
};

export type BrownlowEntry = Tally & { rank: number };

export async function GET() {
  const games = await loadSeasonGameRatings();

  const byPlayer = new Map<number, Tally>();
  let gamesCounted = 0;
  let lastRound = 0;

  for (const game of games) {
    // Rank this game's players: Foopy rating, then goals, then disposals.
    const ranked = [...game.players].sort(
      (a, b) => b.rating - a.rating || b.goals - a.goals || b.disposals - a.disposals
    );
    if (ranked.length < 2) continue; // need a contest to award votes
    gamesCounted++;
    if (game.round != null) lastRound = Math.max(lastRound, game.round);

    const votePoints = [3, 2, 1];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const nh = norm(game.hteam);
    ranked.slice(0, 3).forEach((p, i) => {
      const votes = votePoints[i];
      // Player team names (e.g. "Brisbane") don't always exactly match Squiggle's
      // ("Brisbane Lions"), so match the home side fuzzily before picking the foe.
      const nt = norm(p.team);
      const isHome = nt === nh || nh.includes(nt) || nt.includes(nh);
      const opponent = isHome ? game.ateam : game.hteam;
      let t = byPlayer.get(p.apiPlayerId);
      if (!t) {
        t = { name: p.name, team: p.team, image: p.image, votes: 0, threes: 0, twos: 0, ones: 0, gamesPolled: 0, polls: [] };
        byPlayer.set(p.apiPlayerId, t);
      }
      t.votes += votes;
      if (votes === 3) t.threes++;
      else if (votes === 2) t.twos++;
      else t.ones++;
      t.gamesPolled++;
      t.polls.push({ round: game.round, opponent, votes, rating: p.rating });
    });
  }

  const leaderboard: BrownlowEntry[] = [...byPlayer.values()]
    .map((t) => ({ ...t, polls: t.polls.sort((a, b) => (b.round ?? 0) - (a.round ?? 0)) }))
    .sort((a, b) => b.votes - a.votes || b.threes - a.threes || b.twos - a.twos)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  return NextResponse.json(
    { leaderboard, gamesCounted, lastRound },
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" } }
  );
}
