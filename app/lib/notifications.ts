import { supabase } from "./supabase";

export type NotifType =
  | "like_comment"
  | "reply_comment"
  | "mention_comment"
  | "friend_request"
  | "friend_accepted"
  | "poll_win"
  | "level_up";

export interface NotifData {
  comment_body?: string;
  comment_id?: string;
  event_key?: string | null;
  game_id?: number;
  poll_title?: string;
  level?: number;
  [key: string]: unknown;
}

/** Insert a notification. Silently ignores errors & never notifies yourself. */
export async function createNotification(
  recipientId: string,
  type: NotifType,
  actorId: string | null,
  data: NotifData = {}
) {
  if (!recipientId) return;
  if (actorId && actorId === recipientId) return; // no self-notifications

  const { error } = await supabase.from("notifications").insert({
    user_id: recipientId,
    type,
    actor_id: actorId ?? null,
    data,
    read: false,
  });
  if (error) console.error("[notifications] insert failed:", error.message, error);
}

/**
 * Parse @username mentions from text, resolve them to user IDs,
 * and fire a mention_comment notification for each unique mentioned user.
 */
export async function notifyMentions(
  text: string,
  actorId: string,
  data: NotifData
) {
  const usernames = [...new Set((text.match(/@(\w+)/g) ?? []).map(m => m.slice(1)))];
  if (usernames.length === 0) return;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", usernames);

  for (const profile of profiles ?? []) {
    await createNotification(profile.id, "mention_comment", actorId, data);
  }
}
