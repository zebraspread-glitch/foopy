import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { EquippedCosmetics } from "@/app/lib/cosmetics";

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

// POST /api/cosmetics/equip  { cosmetic_id, equip: boolean }
// Equips (or unequips) an owned cosmetic. One active cosmetic per slot.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const cosmeticId = body?.cosmetic_id as string | undefined;
  const equip = body?.equip !== false; // default true
  if (!cosmeticId) return NextResponse.json({ error: "Missing cosmetic_id" }, { status: 400 });

  // Must own the cosmetic, and it must have an equip slot.
  const [ownedRes, cosmeticRes, profileRes] = await Promise.all([
    supabaseAdmin.from("user_cosmetics").select("id").eq("user_id", user.id).eq("cosmetic_id", cosmeticId).maybeSingle(),
    supabaseAdmin.from("cosmetics").select("slot, asset").eq("id", cosmeticId).maybeSingle(),
    supabaseAdmin.from("profiles").select("equipped_cosmetics").eq("id", user.id).single(),
  ]);

  if (!ownedRes.data) return NextResponse.json({ error: "You don't own this cosmetic" }, { status: 403 });
  const slot = cosmeticRes.data?.slot as string | null | undefined;
  if (!slot) return NextResponse.json({ error: "This cosmetic can't be equipped" }, { status: 400 });
  if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });

  const equipped: EquippedCosmetics = (profileRes.data?.equipped_cosmetics ?? {}) as EquippedCosmetics;
  const slotKey = slot as keyof EquippedCosmetics;

  if (equip) {
    equipped[slotKey] = cosmeticId; // replaces whatever was in this slot
  } else if (equipped[slotKey] === cosmeticId) {
    delete equipped[slotKey];
  }

  // Denormalise render-from-data slots onto the profile so any query that
  // reads a profile can show them without joining the cosmetics catalog.
  const updatePayload: Record<string, unknown> = { equipped_cosmetics: equipped };
  if (slot === "name_color") {
    updatePayload.name_color = equip ? (cosmeticRes.data?.asset ?? null) : null;
  }
  if (slot === "profile_frame") {
    updatePayload.avatar_frame = equip ? (cosmeticRes.data?.asset ?? null) : null;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, equipped });
}
