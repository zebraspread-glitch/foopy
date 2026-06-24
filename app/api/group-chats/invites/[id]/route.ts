import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { readJsonObject } from "@/app/lib/http";

export const dynamic = "force-dynamic";

const MAX_GROUP_CHATS = 30;

// PATCH /api/group-chats/invites/[id] — accept or decline an invite
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await readJsonObject(req) as { action?: "accept" | "decline" };
  if (action !== "accept" && action !== "decline")
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });

  // Load the invite
  const { data: invite } = await supabaseServer
    .from("group_chat_invites")
    .select("id, group_chat_id, invitee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.invitee_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (invite.status !== "pending")
    return NextResponse.json({ error: "Invite already responded to" }, { status: 400 });

  // Mark the invite as accepted/declined
  await supabaseServer
    .from("group_chat_invites")
    .update({ status: action === "accept" ? "accepted" : "declined" })
    .eq("id", id);

  if (action === "accept") {
    // Already a member?
    const { data: existing } = await supabaseServer
      .from("group_chat_members")
      .select("group_chat_id")
      .eq("group_chat_id", invite.group_chat_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      // Enforce 30-chat limit
      const { count } = await supabaseServer
        .from("group_chat_members")
        .select("group_chat_id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if ((count ?? 0) >= MAX_GROUP_CHATS) {
        return NextResponse.json({ error: `You can be in at most ${MAX_GROUP_CHATS} group chats` }, { status: 400 });
      }

      await supabaseServer
        .from("group_chat_members")
        .insert({ group_chat_id: invite.group_chat_id, user_id: user.id });
    }
  }

  return NextResponse.json({ ok: true });
}
