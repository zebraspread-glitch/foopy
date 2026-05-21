import playersRaw from "@/app/data/players.json";
import { teamsMatch } from "./passes";
import { supabaseServer } from "./supabase-server";

type UserCardRow = {
  player_id: string | null;
  player_name: string | null;
  team: string | null;
  rating: number | null;
  duplicate_count: number | null;
};

type PlayerPassRow = {
  id: string;
  player_id: string | null;
  player_name: string | null;
  xp: number | null;
};

type TeamPassRow = {
  id: string;
  team_name: string | null;
  xp: number | null;
};

type PlayerJsonRow = {
  id?: string;
  name?: string;
  team?: string;
  club?: string;
};

const PLAYERS_BY_PASS_ID = new Map(
  (playersRaw as PlayerJsonRow[]).map((player) => [
    String(player.id ?? "").toLowerCase(),
    player,
  ])
);

export function nameToPassPlayerId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "_");
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cardIdForName(name: string): string {
  return name.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "");
}

function cardXp(card: UserCardRow): number {
  const rating = Number(card.rating ?? 0);
  const copies = Number(card.duplicate_count ?? 1);
  if (!Number.isFinite(rating) || !Number.isFinite(copies)) return 0;
  return Math.max(0, rating) * Math.max(0, copies);
}

function cardMatchesPlayerPass(card: UserCardRow, pass: PlayerPassRow): boolean {
  const passId = String(pass.player_id ?? "").toLowerCase();
  const cardName = String(card.player_name ?? "");
  if (!passId) return false;

  if (cardName && nameToPassPlayerId(cardName) === passId) return true;

  const passName = String(pass.player_name ?? "");
  if (passName && normaliseName(cardName) === normaliseName(passName)) return true;

  const cardPlayerId = String(card.player_id ?? "").toLowerCase();
  const player = PLAYERS_BY_PASS_ID.get(passId);
  const playerTeam = String(player?.team ?? player?.club ?? "");
  const cardTeam = String(card.team ?? "");

  return Boolean(
    cardPlayerId &&
      player?.name &&
      cardIdForName(player.name) === cardPlayerId &&
      (!playerTeam || !cardTeam || teamsMatch(playerTeam, cardTeam))
  );
}

export async function syncPassXpFromCards(userId: string) {
  const [{ data: cards, error: cardsError }, { data: playerPasses, error: playerError }, { data: teamPasses, error: teamError }] =
    await Promise.all([
      supabaseServer
        .from("user_cards")
        .select("player_id, player_name, team, rating, duplicate_count")
        .eq("user_id", userId),
      supabaseServer
        .from("user_player_passes")
        .select("id, player_id, player_name, xp")
        .eq("user_id", userId),
      supabaseServer
        .from("user_team_passes")
        .select("id, team_name, xp")
        .eq("user_id", userId),
    ]);

  if (cardsError) throw new Error(cardsError.message);
  if (playerError) throw new Error(playerError.message);
  if (teamError) throw new Error(teamError.message);

  const userCards = (cards ?? []) as UserCardRow[];
  const updates: Promise<void>[] = [];

  for (const pass of ((playerPasses ?? []) as PlayerPassRow[])) {
    const xp = userCards.reduce(
      (sum, card) => sum + (cardMatchesPlayerPass(card, pass) ? cardXp(card) : 0),
      0
    );

    if (Number(pass.xp ?? 0) !== xp) {
      updates.push(
        (async () => {
          const { error } = await supabaseServer
            .from("user_player_passes")
            .update({ xp })
            .eq("id", pass.id);

          if (error) throw new Error(error.message);
        })()
      );
    }
  }

  for (const pass of ((teamPasses ?? []) as TeamPassRow[])) {
    const teamName = String(pass.team_name ?? "");
    const xp = teamName
      ? userCards.reduce(
          (sum, card) => sum + (card.team && teamsMatch(card.team, teamName) ? cardXp(card) : 0),
          0
        )
      : 0;

    if (Number(pass.xp ?? 0) !== xp) {
      updates.push(
        (async () => {
          const { error } = await supabaseServer
            .from("user_team_passes")
            .update({ xp })
            .eq("id", pass.id);

          if (error) throw new Error(error.message);
        })()
      );
    }
  }

  const results = await Promise.allSettled(updates);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;

  return { updated: updates.length };
}
