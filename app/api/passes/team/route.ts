import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { AFL_TEAMS, teamsMatch, TEAM_PASS_COST } from "@/app/lib/passes";

function auth(req: Request) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

// POST /api/passes/team — buy/switch the user's team pass
export async function POST(req: Request) {
  const token = auth(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { team_name } = await req.json() as { team_name?: string };
  if (!team_name?.trim()) {
    return NextResponse.json({ error: "team_name is required" }, { status: 400 });
  }

  const canonical = AFL_TEAMS.find((t) => teamsMatch(t, team_name));
  if (!canonical) {
    return NextResponse.json({ error: "Unknown AFL team" }, { status: 400 });
  }

  // Check if user has ever bought a team pass (any row, active or not)
  const { count: everBought } = await supabaseServer
    .from("user_team_passes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((everBought ?? 0) === 0) {
    // First purchase — fetch and deduct coins
    const { data: profile, error: profileErr } = await supabaseServer
      .from("profiles")
      .select("coins")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      console.error("[passes/team profile]", profileErr.message);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const currentCoins = profile?.coins ?? 0;
    if (currentCoins < TEAM_PASS_COST) {
      return NextResponse.json({ error: "Not enough coins" }, { status: 402 });
    }

    const { error: deductErr, count: deductCount } = await supabaseServer
      .from("profiles")
      .update({ coins: currentCoins - TEAM_PASS_COST }, { count: "exact" })
      .eq("id", user.id)
      .eq("coins", currentCoins);

    if (deductErr || deductCount === 0) {
      if (deductErr) console.error("[passes/team deduct]", deductErr.message);
      return NextResponse.json({ error: "Failed to deduct coins — try again" }, { status: 500 });
    }
  }

  // Deactivate any currently active team pass
  await supabaseServer
    .from("user_team_passes")
    .update({ active: false })
    .eq("user_id", user.id)
    .eq("active", true);

  // Restore existing pass for this team (preserves XP), or create fresh
  const { data: existingForTeam } = await supabaseServer
    .from("user_team_passes")
    .select("id")
    .eq("user_id", user.id)
    .eq("team_name", canonical)
    .maybeSingle();

  let data;
  if (existingForTeam) {
    const { data: restored } = await supabaseServer
      .from("user_team_passes")
      .update({ active: true })
      .eq("id", existingForTeam.id)
      .select()
      .single();
    data = restored;
  } else {
    const { data: inserted, error: insertErr } = await supabaseServer
      .from("user_team_passes")
      .insert({ user_id: user.id, team_name: canonical, active: true, xp: 0 })
      .select()
      .single();
    if (insertErr) {
      console.error("[passes/team POST]", insertErr.message);
      return NextResponse.json({ error: "Failed to set team pass" }, { status: 500 });
    }
    data = inserted;
  }

  // Auto-join the team's group chat
  const { data: groupChat } = await supabaseServer
    .from("group_chats")
    .select("id")
    .eq("team_name", canonical)
    .maybeSingle();

  if (groupChat) {
    await supabaseServer
      .from("group_chat_members")
      .upsert(
        { group_chat_id: groupChat.id, user_id: user.id },
        { onConflict: "group_chat_id,user_id", ignoreDuplicates: true }
      );
  }

  return NextResponse.json({ teamPass: data });
}

// DELETE /api/passes/team — deactivate team pass
export async function DELETE(req: Request) {
  const token = auth(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabaseServer
    .from("user_team_passes")
    .update({ active: false })
    .eq("user_id", user.id)
    .eq("active", true);

  return NextResponse.json({ ok: true });
}
