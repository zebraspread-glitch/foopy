// ============================================================
// Report & Block — client helpers
// Backed by supabase/report-block-schema.sql
// ============================================================
import { supabase } from "./supabase";

export type ReportTargetType = "user" | "comment" | "dm_message" | "group_message";

export const REPORT_REASONS = [
  "Harassment or bullying",
  "Hate speech",
  "Spam or scam",
  "Inappropriate content",
  "Impersonation",
  "Self-harm or dangerous behaviour",
  "Other",
] as const;

// ── Change notifications ──────────────────────────────────────
// Surfaces (feed, DMs, search…) subscribe so they can re-filter when the
// signed-in user blocks or unblocks someone.
type Listener = () => void;
const listeners = new Set<Listener>();

export const blocksChanged = {
  emit() { listeners.forEach(l => l()); },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

// ── Caches (cleared on change) ────────────────────────────────
let hiddenCache: Set<string> | null = null;
let myBlockedCache: Set<string> | null = null;

function invalidate() {
  hiddenCache = null;
  myBlockedCache = null;
}

/** Users the current user should not see, and who should not see them
 *  (people I blocked ∪ people who blocked me). Used to filter feeds. */
export async function getHiddenUserIds(force = false): Promise<Set<string>> {
  if (hiddenCache && !force) return hiddenCache;
  const { data, error } = await supabase.rpc("foopy_hidden_user_ids");
  if (error) { return hiddenCache ?? new Set(); }
  hiddenCache = new Set<string>((data ?? []).map((r: { foopy_hidden_user_ids?: string } | string) =>
    typeof r === "string" ? r : r.foopy_hidden_user_ids!).filter(Boolean));
  return hiddenCache;
}

/** Only the users *I* have blocked — for button state and search filtering. */
export async function getMyBlockedIds(force = false): Promise<Set<string>> {
  if (myBlockedCache && !force) return myBlockedCache;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id);
  if (error) return myBlockedCache ?? new Set();
  myBlockedCache = new Set<string>((data ?? []).map(r => r.blocked_id));
  return myBlockedCache;
}

/** True if either side has blocked the other (used to gate DMs). */
export async function isBlockedBetween(otherId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("foopy_block_between", { other: otherId });
  if (error) return false;
  return Boolean(data);
}

/** Block a user: record the block and tear down any friendship between them. */
export async function blockUser(otherId: string): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (user.id === otherId) return { error: "You can't block yourself" };

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_id: user.id, blocked_id: otherId }, { onConflict: "blocker_id,blocked_id" });
  if (error) return { error: error.message };

  // Remove any friendship in either direction (best-effort).
  await supabase
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`);

  invalidate();
  blocksChanged.emit();
  return {};
}

export async function unblockUser(otherId: string): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", otherId);
  if (error) return { error: error.message };
  invalidate();
  blocksChanged.emit();
  return {};
}

/** File a report. `reportedUserId` is the offending user; the rest is context. */
export async function submitReport(input: {
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId?: string | null;
  context?: string | null;
  reason: string;
  details?: string | null;
}): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: input.reportedUserId,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    context: input.context ?? null,
    reason: input.reason,
    details: input.details ?? null,
  });
  if (error) return { error: error.message };
  return {};
}
