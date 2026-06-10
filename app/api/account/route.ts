import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const dynamic = "force-dynamic";

// DELETE /api/account — permanently delete the authenticated user's account.
// Required by App Store Guideline 5.1.1(v): account creation must be matched
// by in-app account deletion.
export async function DELETE(req: Request) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = user.id;

  // Best-effort cleanup of core user-owned rows first, so the auth deletion
  // below can't fail on a foreign key that wasn't declared ON DELETE CASCADE.
  // Tables that DO cascade are removed automatically by deleteUser().
  await Promise.allSettled([
    supabaseAdmin.from("profiles").delete().eq("id", uid),
    supabaseAdmin.from("user_cards").delete().eq("user_id", uid),
    supabaseAdmin.from("user_currency").delete().eq("user_id", uid),
  ]);

  // Delete the auth user itself — removes their identity/email and cascades to
  // every table with a `references auth.users(id) on delete cascade` link.
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error("[account DELETE] failed:", delErr.message);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
