// Server-only helpers for applying pass reward balances to profiles.
import { supabaseServer } from "./supabase-server";
import { awardAura } from "./aura";

type ProfileCurrencyColumn = "aura" | "coins";

const PAGE_SIZE = 1000;

async function readProfileCurrencies(userId: string) {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("aura, coins")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return {
    aura: Number((data as any)?.aura ?? 0),
    coins: Number((data as any)?.coins ?? 0),
  };
}

async function setProfileCurrency(userId: string, column: ProfileCurrencyColumn, value: number) {
  const { error } = await supabaseServer
    .from("profiles")
    .update({ [column]: value })
    .eq("id", userId);

  if (error) throw error;
}

export async function incrementProfileCurrency(
  userId: string,
  column: ProfileCurrencyColumn,
  amount: number,
  rpcName?: string
) {
  if (amount <= 0) return false;

  const before = await readProfileCurrencies(userId);

  if (rpcName) {
    const { error } = await supabaseServer.rpc(rpcName, {
      user_id_param: userId,
      amount_param: amount,
    });

    if (error) {
      console.error(`[${rpcName}]`, error.message, "- using direct profile update fallback");
    }
  }

  const after = await readProfileCurrencies(userId);
  const credited = Math.max(0, after[column] - before[column]);
  const missing = Math.max(0, amount - credited);

  if (missing > 0) {
    await setProfileCurrency(userId, column, after[column] + missing);
  }

  return true;
}

export async function syncPassRewardBalances(userId: string, repairCoins = false) {
  let auraRepaired = 0;
  let coinsRepaired = 0;

  let from = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("pass_rewards")
      .select("id, pass_type, pass_id, match_id, aura_reward, coin_reward")
      .eq("user_id", userId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const reward of rows as unknown as Array<{
      id?: string;
      pass_type?: string;
      pass_id?: string;
      match_id?: string;
      aura_reward?: number | null;
      coin_reward?: number | null;
    }>) {
      const aura = Number(reward.aura_reward ?? 0);
      if (aura <= 0) continue;

      // Use composite key so dedup is consistent with the claim route
      const relatedId = `pass_reward:${reward.pass_type}:${reward.pass_id}:${reward.match_id}`;

      const result = await awardAura(userId, "pass_reward", relatedId, aura);
      if (!result.awarded) continue;

      auraRepaired += aura;

      const coins = Number(reward.coin_reward ?? 0);
      if (repairCoins && coins > 0) {
        await incrementProfileCurrency(userId, "coins", coins, "increment_coins");
        coinsRepaired += coins;
      }
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { auraRepaired, coinsRepaired };
}
