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

const USER_CARDS_PAGE_SIZE = 1000;

const PLAYERS_BY_PASS_ID = new Map(
  (playersRaw as PlayerJsonRow[]).map((player) => [
    String(player.id ?? "").toLowerCase(),
    player,
  ])
);

export function nameToPassPlayerId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "_");
}

function cardIdForName(name: string): string {
  return name.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "");
}

function sumCards(cards: { rating: number | null; duplicate_count: number | null }[]): number {
  return cards.reduce((sum, c) => sum + (c.rating ?? 0) * (c.duplicate_count ?? 1), 0);
}

async function fetchAllUserCards(userId: string): Promise<UserCardRow[]> {
  const cards: UserCardRow[] = [];

  for (let from = 0; ; from += USER_CARDS_PAGE_SIZE) {
    const { data, error } = await supabaseServer
      .from("user_cards")
      .select("player_id, player_name, team, rating, duplicate_count")
      .eq("user_id", userId)
      .order("player_id", { ascending: true })
      .order("rarity", { ascending: true })
      .range(from, from + USER_CARDS_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    cards.push(...((data ?? []) as UserCardRow[]));
    if (!data || data.length < USER_CARDS_PAGE_SIZE) break;
  }

  return cards;
}

async function xpForPlayerPass(userId: string, pass: PlayerPassRow): Promise<number> {
  const passId   = String(pass.player_id ?? "").toLowerCase();
  const passName = String(pass.player_name ?? "");

  // Strategy 1: ilike on player_name using pass.player_name
  if (passName) {
    const { data } = await supabaseServer
      .from("user_cards")
      .select("rating, duplicate_count")
      .eq("user_id", userId)
      .ilike("player_name", passName);
    if (data?.length) return sumCards(data);
  }

  // Strategy 2: eq on player_id using cardIdForName(passName)
  if (passName) {
    const slug = cardIdForName(passName);
    if (slug) {
      const { data } = await supabaseServer
        .from("user_cards")
        .select("rating, duplicate_count")
        .eq("user_id", userId)
        .eq("player_id", slug);
      if (data?.length) return sumCards(data);
    }
  }

  // Strategy 3: look up canonical name from players.json and ilike by that
  const player = PLAYERS_BY_PASS_ID.get(passId);
  if (player?.name && player.name !== passName) {
    const { data } = await supabaseServer
      .from("user_cards")
      .select("rating, duplicate_count")
      .eq("user_id", userId)
      .ilike("player_name", player.name);
    if (data?.length) return sumCards(data);

    const slug = cardIdForName(player.name);
    if (slug) {
      const { data: byId } = await supabaseServer
        .from("user_cards")
        .select("rating, duplicate_count")
        .eq("user_id", userId)
        .eq("player_id", slug);
      if (byId?.length) return sumCards(byId);
    }
  }

  // Strategy 4: ilike on player_name using pass.player_id as a last resort
  if (passId) {
    const { data } = await supabaseServer
      .from("user_cards")
      .select("rating, duplicate_count")
      .eq("user_id", userId)
      .ilike("player_id", passId);
    if (data?.length) return sumCards(data);
  }

  return 0;
}

export async function syncPassXpFromCards(userId: string) {
  const [playerPassResult, teamPassResult, userCards] =
    await Promise.all([
      supabaseServer
        .from("user_player_passes")
        .select("id, player_id, player_name, xp")
        .eq("user_id", userId),
      supabaseServer
        .from("user_team_passes")
        .select("id, team_name, xp")
        .eq("user_id", userId),
      fetchAllUserCards(userId),
    ]);

  const { data: playerPasses, error: playerError } = playerPassResult;
  const { data: teamPasses, error: teamError } = teamPassResult;

  if (playerError) throw new Error(playerError.message);
  if (teamError) throw new Error(teamError.message);

  const updates: Promise<void>[] = [];

  for (const pass of ((playerPasses ?? []) as PlayerPassRow[])) {
    const xp = await xpForPlayerPass(userId, pass);

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
          (sum, card) => sum + (card.team && teamsMatch(card.team, teamName) ? (card.rating ?? 0) * (card.duplicate_count ?? 1) : 0),
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
