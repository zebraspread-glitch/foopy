import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { readJsonObject } from "@/app/lib/http";

function auth(req: Request) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function POST(req: Request) {
  const token = auth(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pass_type, pass_id, pattern } = await readJsonObject(req) as {
    pass_type?: "player" | "team";
    pass_id?: string;
    pattern?: string | null;
  };

  if (pass_type !== "player" && pass_type !== "team") {
    return NextResponse.json({ error: "pass_type must be 'player' or 'team'" }, { status: 400 });
  }
  if (!pass_id) {
    return NextResponse.json({ error: "pass_id is required" }, { status: 400 });
  }

  if (pattern) {
    const { data: cosmetic } = await supabaseServer
      .from("cosmetics")
      .select("id, asset, slot")
      .eq("slot", "card_back")
      .eq("asset", pattern)
      .maybeSingle();

    if (!cosmetic) return NextResponse.json({ error: "Unknown pattern" }, { status: 400 });

    const { data: owned } = await supabaseServer
      .from("user_cosmetics")
      .select("id")
      .eq("user_id", user.id)
      .eq("cosmetic_id", cosmetic.id)
      .maybeSingle();

    if (!owned) return NextResponse.json({ error: "Pattern not owned" }, { status: 403 });
  }

  const table = pass_type === "player" ? "user_player_passes" : "user_team_passes";

  const { data, error: upErr } = await supabaseServer
    .from(table)
    .update({ pattern: pattern ?? null })
    .eq("id", pass_id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ pass: data });
}
