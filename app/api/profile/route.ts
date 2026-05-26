import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

// PATCH /api/profile  — update allowed profile fields (service role, bypasses RLS)
export async function PATCH(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the user from their JWT
  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Only allow updating safe fields
  const allowed = ["featured_cards", "featured_passes", "bio", "display_name", "favourites"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  console.log(`[profile PATCH] user=${user.id} fields=${Object.keys(updates).join(",")}`);

  const { error } = await supabaseServer
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("[profile PATCH] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[profile PATCH] saved ok`);
  return NextResponse.json({ ok: true });
}
