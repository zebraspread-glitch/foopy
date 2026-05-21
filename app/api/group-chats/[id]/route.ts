import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

function getToken(req: Request) {
  return req.headers.get("authorization")?.slice(7) ?? null;
}

// DELETE /api/group-chats/[id] — delete a group (creator only)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the requester is the creator
  const { data: chat, error: fetchErr } = await supabaseServer
    .from("group_chats")
    .select("id, created_by")
    .eq("id", id)
    .single();

  if (fetchErr || !chat) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (chat.created_by !== user.id) return NextResponse.json({ error: "Only the group creator can delete it" }, { status: 403 });

  // Delete — cascade removes members, messages, invites automatically
  const { error: delErr } = await supabaseServer
    .from("group_chats")
    .delete()
    .eq("id", id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
