import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isCosmeticAvailable } from "@/app/lib/cosmetics";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

// POST /api/cosmetics/purchase  { cosmetic_key }
// Buys a cosmetic with the user's Foopy Tokens.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const cosmeticKey = body?.cosmetic_key as string | undefined;
  if (!cosmeticKey) return NextResponse.json({ error: "Missing cosmetic_key" }, { status: 400 });

  // Look up the cosmetic + the user's balance + existing ownership in parallel.
  const [cosmeticRes, profileRes] = await Promise.all([
    supabaseAdmin.from("cosmetics").select("*").eq("key", cosmeticKey).maybeSingle(),
    supabaseAdmin.from("profiles").select("tokens").eq("id", user.id).single(),
  ]);

  const cosmetic = cosmeticRes.data;
  if (!cosmetic) return NextResponse.json({ error: "Cosmetic not found" }, { status: 404 });
  if (!isCosmeticAvailable(cosmetic)) return NextResponse.json({ error: "Cosmetic not available" }, { status: 400 });
  if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });

  // Already owned?
  const { data: owned } = await supabaseAdmin
    .from("user_cosmetics")
    .select("id")
    .eq("user_id", user.id)
    .eq("cosmetic_id", cosmetic.id)
    .maybeSingle();
  if (owned) return NextResponse.json({ error: "Already owned" }, { status: 409 });

  const balance = profileRes.data?.tokens ?? 0;
  if (balance < cosmetic.token_price) {
    return NextResponse.json({ error: "Not enough Tokens" }, { status: 402 });
  }

  // Deduct with optimistic concurrency (only succeeds if balance is unchanged).
  const newBalance = balance - cosmetic.token_price;
  const { error: deductErr, count } = await supabaseAdmin
    .from("profiles")
    .update({ tokens: newBalance }, { count: "exact" })
    .eq("id", user.id)
    .eq("tokens", balance);
  if (deductErr || count !== 1) {
    return NextResponse.json({ error: "Purchase failed — try again" }, { status: 409 });
  }

  // Grant ownership. If the ownership insert somehow fails, refund the tokens.
  const { error: grantErr } = await supabaseAdmin
    .from("user_cosmetics")
    .insert({ user_id: user.id, cosmetic_id: cosmetic.id });
  if (grantErr) {
    await supabaseAdmin.from("profiles").update({ tokens: balance }).eq("id", user.id);
    return NextResponse.json({ error: "Purchase failed — try again" }, { status: 500 });
  }

  await supabaseAdmin.from("token_transactions").insert({
    user_id: user.id,
    amount: -cosmetic.token_price,
    balance_after: newBalance,
    reason: "spend",
    reference: cosmetic.key,
  });

  return NextResponse.json({ ok: true, tokens: newBalance, cosmetic_id: cosmetic.id });
}
