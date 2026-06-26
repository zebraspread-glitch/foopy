import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getUserFromRequest(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data: { user }, error } = await supabaseServer.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user;
}

// POST /api/push/register — { token, platform }
// Upserts the device's push token, tied to the verified signed-in user.
// If the same device token was previously tied to a different account
// (e.g. a shared device, different user signed in), this re-points it to
// the current user so the old account stops receiving pushes for it.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = typeof body?.platform === "string" ? body.platform.slice(0, 20) : "ios";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { error } = await supabaseServer
    .from("push_tokens")
    .upsert(
      { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "token" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/push/register — { token }
// Removes this device's token row, called on sign-out so a shared device
// doesn't keep receiving push notifications for the account that just left.
export async function DELETE(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Only delete if it still belongs to this user — never let one account
  // delete another's token row.
  await supabaseServer.from("push_tokens").delete().eq("token", token).eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
