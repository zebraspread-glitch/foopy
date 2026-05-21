import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

const MAX_GROUP_CHATS = 30;
const MAX_NAME_LEN = 60;

function getToken(req: Request) {
  return req.headers.get("authorization")?.slice(7) ?? null;
}

// POST /api/group-chats — create a new group chat
export async function POST(req: Request) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, is_public } = await req.json() as {
    name?: string; description?: string; is_public?: boolean;
  };

  const trimmedName = name?.trim();
  if (!trimmedName) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (trimmedName.length > MAX_NAME_LEN)
    return NextResponse.json({ error: `Name must be ${MAX_NAME_LEN} characters or fewer` }, { status: 400 });

  // Enforce 30-chat limit
  const { count } = await supabaseServer
    .from("group_chat_members")
    .select("group_chat_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_GROUP_CHATS) {
    return NextResponse.json({ error: `You can be in at most ${MAX_GROUP_CHATS} group chats` }, { status: 400 });
  }

  // Create the chat
  const { data: chat, error: chatErr } = await supabaseServer
    .from("group_chats")
    .insert({
      team_name:   trimmedName,
      description: description?.trim() || null,
      is_public:   !!is_public,
      created_by:  user.id,
    })
    .select()
    .single();

  if (chatErr || !chat) {
    console.error("[group-chats POST]", chatErr?.message);
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
  }

  // Auto-join creator
  await supabaseServer
    .from("group_chat_members")
    .insert({ group_chat_id: chat.id, user_id: user.id });

  return NextResponse.json({ chat });
}
