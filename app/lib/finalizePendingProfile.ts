import { supabase } from "@/app/lib/supabase";

type PendingUser = { id: string; user_metadata?: Record<string, unknown> | null };

/**
 * Fills in the user's profile from the username + favourite team chosen at
 * signup.
 *
 * The values are read from localStorage (same device) OR the user's auth
 * metadata (works cross-device — e.g. when the confirmation email is opened on
 * a different phone than the one used to sign up). Only fields that are still
 * empty get written, so an existing username is never clobbered and its
 * change-cooldown isn't reset. The pending values are then cleared so this
 * never runs again.
 *
 * Returns the resulting profile row when something was applied, otherwise null.
 */
export async function finalizePendingProfile(user: PendingUser): Promise<Record<string, unknown> | null> {
  const metaUsername = (user.user_metadata?.pending_username as string) || "";
  const metaTeam     = (user.user_metadata?.pending_team as string) || "";

  let lsUsername = "";
  let lsTeam = "";
  try {
    lsUsername = localStorage.getItem("foopy_pending_username") || "";
    lsTeam     = localStorage.getItem("foopy_pending_team") || "";
  } catch {
    /* localStorage unavailable (SSR / privacy mode) — fall back to metadata */
  }

  const pendingUsername = lsUsername || metaUsername;
  const pendingTeam     = lsTeam || metaTeam;
  if (!pendingUsername && !pendingTeam) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const patch: Record<string, unknown> = { id: user.id };
  if (pendingUsername && !existing?.username) {
    patch.username            = pendingUsername;
    patch.display_name        = pendingUsername;
    patch.username_updated_at = new Date().toISOString();
  }
  if (pendingTeam && !existing?.favourite_team) {
    patch.favourite_team = pendingTeam;
  }

  let row: Record<string, unknown> | null = (existing as Record<string, unknown>) ?? null;

  // Only write when there's actually a field to fill (patch has more than `id`).
  if (Object.keys(patch).length > 1) {
    const { data } = await supabase
      .from("profiles")
      .upsert(patch, { onConflict: "id" })
      .select()
      .single();
    row = (data as Record<string, unknown>) ?? row;
  }

  // Clear the pending values so this never re-applies on later loads.
  try {
    localStorage.removeItem("foopy_pending_username");
    localStorage.removeItem("foopy_pending_team");
  } catch {
    /* ignore */
  }
  if (metaUsername || metaTeam) {
    await supabase.auth.updateUser({ data: { pending_username: null, pending_team: null } }).catch(() => {});
  }

  return row;
}
