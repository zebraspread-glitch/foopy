import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { MAX_PLAYER_PASSES, PLAYER_PASS_COST } from "@/app/lib/passes";
import playersRaw from "@/app/data/players.json";

function auth(req: Request) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function POST(req: Request) {
  const token = auth(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { player_id } = await req.json() as { player_id?: string };
  if (!player_id?.trim()) {
    return NextResponse.json({ error: "player_id is required" }, { status: 400 });
  }

  const playerData = (playersRaw as any[]).find(
    (p) => String(p.id ?? "") === player_id
  );
  if (!playerData) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Check active pass count
  const { data: activePasses, error: countErr } = await supabaseServer
    .from("user_player_passes")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true);

  if (countErr) {
    console.error("[passes/player count]", countErr.code, countErr.message);
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  if ((activePasses?.length ?? 0) >= MAX_PLAYER_PASSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PLAYER_PASSES} player passes reached` },
      { status: 409 }
    );
  }

  const player_name = String(playerData.name ?? playerData.player ?? player_id);
  const team_name   = String(playerData.club ?? playerData.team ?? "");

  // Check if a pass for this player already exists (active or inactive)
  const { data: existing } = await supabaseServer
    .from("user_player_passes")
    .select("id, active")
    .eq("user_id", user.id)
    .eq("player_id", player_id)
    .maybeSingle();

  if (existing) {
    if (existing.active) {
      return NextResponse.json({ error: "Already have a pass for this player" }, { status: 409 });
    }
    // Reactivate — XP preserved, no coin charge
    const { data, error: upErr } = await supabaseServer
      .from("user_player_passes")
      .update({ active: true, player_name, team_name })
      .eq("id", existing.id)
      .select()
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ playerPass: data });
  }

  // New pass — fetch coin balance first
  const { data: profile, error: profileErr } = await supabaseServer
    .from("profiles")
    .select("coins")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    console.error("[passes/player profile]", profileErr.message);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const currentCoins = profile?.coins ?? 0;
  if (currentCoins < PLAYER_PASS_COST) {
    return NextResponse.json({ error: "Not enough coins" }, { status: 402 });
  }

  // Deduct coins with optimistic concurrency check
  const { error: deductErr, count: deductCount } = await supabaseServer
    .from("profiles")
    .update({ coins: currentCoins - PLAYER_PASS_COST }, { count: "exact" })
    .eq("id", user.id)
    .eq("coins", currentCoins);

  if (deductErr || deductCount === 0) {
    if (deductErr) console.error("[passes/player deduct]", deductErr.message);
    return NextResponse.json({ error: "Failed to deduct coins — try again" }, { status: 500 });
  }

  // Sum XP from cards the user already owns for this player
  const { data: existingCards } = await supabaseServer
    .from("user_cards")
    .select("rating, duplicate_count")
    .eq("user_id", user.id)
    .eq("player_name", player_name);
  const initialXp = (existingCards ?? []).reduce(
    (sum, c) => sum + (c.rating ?? 0) * (c.duplicate_count ?? 1),
    0
  );

  // Insert the new pass
  const { data, error: insErr } = await supabaseServer
    .from("user_player_passes")
    .insert({ user_id: user.id, player_id, player_name, team_name, active: true, xp: initialXp })
    .select()
    .single();

  if (insErr) {
    // Refund coins on insert failure
    await supabaseServer
      .from("profiles")
      .update({ coins: currentCoins })
      .eq("id", user.id);
    console.error("[passes/player insert]", insErr.code, insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ playerPass: data });
}
