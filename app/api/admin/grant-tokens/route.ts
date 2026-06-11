import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/app/lib/admin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const dynamic = "force-dynamic";

// POST /api/admin/grant-tokens  { user_id, amount, reason? }
// Admin-only. Grants (or removes, if amount is negative) Foopy Tokens.
// Used for promos, compensation, and testing — NOT a real-money purchase path.
export async function POST(req: Request) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const userId = body?.user_id as string | undefined;
  const amount = body?.amount;
  const reason = (body?.reason as string | undefined) ?? "grant";
  if (!userId || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "Missing user_id or integer amount" }, { status: 400 });
  }

  const { data: profile, error: readErr } = await supabaseAdmin
    .from("profiles")
    .select("tokens")
    .eq("id", userId)
    .single();
  if (readErr || !profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const newBalance = Math.max(0, (profile.tokens ?? 0) + amount);

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ tokens: newBalance })
    .eq("id", userId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabaseAdmin.from("token_transactions").insert({
    user_id: userId,
    amount,
    balance_after: newBalance,
    reason: reason === "admin" ? "admin" : "grant",
    reference: `admin:${admin.email ?? admin.id}`,
  });

  return NextResponse.json({ ok: true, tokens: newBalance });
}
