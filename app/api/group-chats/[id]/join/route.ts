import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

const MAX_GROUP_CHATS = 30;

// POST /api/group-chats/[id]/join — join a public group chat
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.slice(7) ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the chat is public
  const { data: chat } = await supabaseServer
    .from("group_chats")
    .select("id, is_public")
    .eq("id", id)
    .maybeSingle();

  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  if (!chat.is_public) return NextResponse.json({ error: "This chat is private" }, { status: 403 });

  // Already a member?
  const { data: existing } = await supabaseServer
    .from("group_chat_members")
    .select("group_chat_id")
    .eq("group_chat_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ ok: true, alreadyMember: true });

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
    .insert({ group_chat_id: id, user_id: user.id });

  return NextResponse.json({ ok: true });
}
