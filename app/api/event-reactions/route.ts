import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

const db = supabaseServer;
const EVENT_REACTION_EMOJI_SECTIONS = [
  ["🔥", "🐐", "😭", "🤣", "😮", "🧊", "🎯", "🚨", "🤡", "📈", "💀", "👏", "❤️", "😤", "👀", "🤯"],
  ["😀", "😆", "😂", "🥲", "😬", "😡", "😎", "😍", "😈", "😴", "🙃", "😇", "😱", "🥶", "😵"],
  ["👍", "👎", "🙌", "🙏", "🤝", "💪", "🫡", "🤌", "👌", "🫶", "🤲", "🫵"],
  ["🏉", "🏆", "🥇", "⚡", "💥", "⭐", "🚀", "🫠", "🍿", "🛎️", "🚩", "🏁"],
] as const;
const EVENT_REACTION_EMOJIS: string[] = Array.from(new Set(EVENT_REACTION_EMOJI_SECTIONS.flat()));

type ReactionRow = {
  event_key: string;
  emoji: string;
  visitor_id: string;
};

function emojiRank(emoji: string) {
  const index = EVENT_REACTION_EMOJIS.indexOf(emoji);
  return index === -1 ? 999 : index;
}

function cleanVisitorId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function cleanEventKey(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function summarise(rows: ReactionRow[], visitorId = "") {
  const reactions: Record<string, { emoji: string; count: number }[]> = {};
  const mine: Record<string, string> = {};
  const counts: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    if (!row.event_key || !row.emoji) continue;
    counts[row.event_key] ??= {};
    counts[row.event_key][row.emoji] = (counts[row.event_key][row.emoji] ?? 0) + 1;
    if (visitorId && row.visitor_id === visitorId) mine[row.event_key] = row.emoji;
  }

  for (const [eventKey, emojiCounts] of Object.entries(counts)) {
    reactions[eventKey] = Object.entries(emojiCounts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count || emojiRank(a.emoji) - emojiRank(b.emoji));
  }

  return { reactions, mine };
}

async function loadSummary(gameId: number, visitorId = "") {
  const { data, error } = await db
    .from("feed_event_reactions")
    .select("event_key, emoji, visitor_id")
    .eq("game_id", gameId);

  if (error) {
    console.error("[event-reactions]", error.message);
    return { reactions: {}, mine: {}, unavailable: true };
  }

  return summarise((data ?? []) as ReactionRow[], visitorId);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = Number(searchParams.get("gameId"));
  const visitorId = cleanVisitorId(searchParams.get("visitorId"));

  if (!Number.isFinite(gameId) || gameId <= 0) {
    return NextResponse.json({ reactions: {}, mine: {} });
  }

  return NextResponse.json(await loadSummary(gameId, visitorId));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const gameId = Number(body?.gameId);
  const eventKey = cleanEventKey(body?.eventKey);
  const visitorId = cleanVisitorId(body?.visitorId);
  const emoji = typeof body?.emoji === "string" ? body.emoji : null;

  if (!Number.isFinite(gameId) || gameId <= 0 || !eventKey || !visitorId) {
    return NextResponse.json({ error: "Missing reaction fields" }, { status: 400 });
  }

  if (emoji == null || emoji === "") {
    const { error } = await db
      .from("feed_event_reactions")
      .delete()
      .eq("game_id", gameId)
      .eq("event_key", eventKey)
      .eq("visitor_id", visitorId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ...(await loadSummary(gameId, visitorId)) });
  }

  if (!EVENT_REACTION_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Unsupported reaction" }, { status: 400 });
  }

  const { data: existingRows, error: existingError } = await db
    .from("feed_event_reactions")
    .select("emoji")
    .eq("game_id", gameId)
    .eq("event_key", eventKey)
    .eq("visitor_id", visitorId);

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const hasSameReaction = (existingRows ?? []).some((row: { emoji: string }) => row.emoji === emoji);

  const { error: deleteError } = await db
    .from("feed_event_reactions")
    .delete()
    .eq("game_id", gameId)
    .eq("event_key", eventKey)
    .eq("visitor_id", visitorId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (hasSameReaction) {
    return NextResponse.json({ ok: true, ...(await loadSummary(gameId, visitorId)) });
  }

  const { error } = await db.from("feed_event_reactions").insert({
    game_id: gameId,
    event_key: eventKey,
    visitor_id: visitorId,
    emoji,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await loadSummary(gameId, visitorId)) });
}
