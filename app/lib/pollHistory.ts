import { supabase } from "@/app/lib/supabase";

export type PollEntry = {
  id: string;
  question: string;
  answer: string;
  teams: string;
  status: "won" | "lost" | "pending";
};

const STATUS_RANK: Record<PollEntry["status"], number> = { won: 0, lost: 1, pending: 2 };

// Builds a user's poll-pick history from the database so it works on any
// profile (own or someone else's). A pick is "won" if a poll_correct aura
// event exists for that poll, "lost" if the game is finished but no win was
// recorded, otherwise "pending".
export async function loadPollEntries(userId: string): Promise<PollEntry[]> {
  const [votesRes, wonRes, gamesRaw] = await Promise.all([
    supabase
      .from("match_poll_votes")
      .select("option_id, poll:match_polls(id, question, game_id, options:match_poll_options(id, label))")
      .eq("user_id", userId),
    supabase
      .from("aura_events")
      .select("event_key")
      .eq("user_id", userId)
      .eq("event_type", "poll_correct"),
    fetch("/api/games", { cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);

  const games: any[] = Array.isArray(gamesRaw) ? gamesRaw : (gamesRaw?.games ?? []);
  const gameById = new Map<string, any>(games.map((g) => [String(g.id), g]));
  const wonSet = new Set(
    (wonRes.data ?? []).map((e: any) => String(e.event_key).replace(/^poll_/, ""))
  );

  const entries: PollEntry[] = [];
  for (const v of (votesRes.data ?? []) as any[]) {
    const poll = v.poll;
    if (!poll) continue;
    const answer = (poll.options ?? []).find((o: any) => o.id === v.option_id)?.label ?? "—";
    const g = gameById.get(String(poll.game_id));
    const complete = g ? ((g.complete ?? 0) >= 100 || g.is_final === 1) : false;
    const won = wonSet.has(String(poll.id));
    const status: PollEntry["status"] = won ? "won" : complete ? "lost" : "pending";
    const teams = g ? `${g.hteam} v ${g.ateam}` : "";
    entries.push({ id: String(poll.id), question: poll.question, answer, teams, status });
  }

  entries.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  return entries;
}
