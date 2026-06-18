import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { AFL_TEAMS, teamsMatch, TEAM_PASS_COST, MAX_TEAM_PASSES } from "@/app/lib/passes";
import { syncPassXpFromCards } from "@/app/lib/passCardXp";
import { logCoinEvent } from "@/app/lib/coins";

function auth(req: Request) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

// POST /api/passes/team — buy a team pass (up to MAX_TEAM_PASSES active at once)
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

  // Check if user already has an ACTIVE pass for this team
  const { data: alreadyActive } = await supabaseServer
    .from("user_team_passes")
    .select("id")
    .eq("user_id", user.id)
    .eq("team_name", canonical)
    .eq("active", true)
    .maybeSingle();

  if (alreadyActive) {
    return NextResponse.json({ error: "Already have an active pass for this team" }, { status: 400 });
  }

  // Check current active count against the maximum
  const { count: activeCount } = await supabaseServer
    .from("user_team_passes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("active", true);

  if ((activeCount ?? 0) >= MAX_TEAM_PASSES) {
    return NextResponse.json({ error: `Maximum ${MAX_TEAM_PASSES} team passes reached` }, { status: 400 });
  }

  // Check if user already owns an inactive pass for this team (reactivate for free, XP preserved)
  const { data: existingForTeam } = await supabaseServer
    .from("user_team_passes")
    .select("id")
    .eq("user_id", user.id)
    .eq("team_name", canonical)
    .maybeSingle();

  // Only charge coins when creating a brand-new pass slot
  if (!existingForTeam) {
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

    // Ledger entry for the coins-history page (spend; balance already deducted).
    await logCoinEvent(user.id, "team_pass", `team_pass:${canonical}:${Date.now()}`, -TEAM_PASS_COST);
  }

  // Reactivate existing (inactive) pass or insert fresh one
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

  try {
    await syncPassXpFromCards(user.id);
  } catch (err) {
    console.error("[passes/team sync xp]", err instanceof Error ? err.message : err);
  }
  const { data: syncedPass } = await supabaseServer
    .from("user_team_passes")
    .select("*")
    .eq("id", data.id)
    .single();
  if (syncedPass) data = syncedPass;

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

// DELETE /api/passes/team — deactivate a specific team pass by team_name
export async function DELETE(req: Request) {
  const token = auth(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let teamNameToRemove: string | undefined;
  try {
    const body = await req.json();
    teamNameToRemove = body?.team_name;
  } catch {}

  if (teamNameToRemove) {
    const canonical = AFL_TEAMS.find((t) => teamsMatch(t, teamNameToRemove!));
    if (canonical) {
      await supabaseServer
        .from("user_team_passes")
        .update({ active: false })
        .eq("user_id", user.id)
        .eq("team_name", canonical);
    }
  } else {
    // Fallback: deactivate all
    await supabaseServer
      .from("user_team_passes")
      .update({ active: false })
      .eq("user_id", user.id)
      .eq("active", true);
  }

  return NextResponse.json({ ok: true });
}
