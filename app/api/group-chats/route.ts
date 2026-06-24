import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { readJsonObject } from "@/app/lib/http";

export const dynamic = "force-dynamic";

const MAX_GROUP_CHATS = 30;
const MAX_NAME_LEN = 60;

const AFL_TEAMS = [
  "Adelaide Crows", "Brisbane Lions", "Carlton", "Collingwood",
  "Essendon", "Fremantle", "Geelong Cats", "Gold Coast Suns",
  "GWS Giants", "Hawthorn", "Melbourne", "North Melbourne",
  "Port Adelaide", "Richmond", "St Kilda", "Sydney Swans",
  "West Coast Eagles", "Western Bulldogs",
];

function getToken(req: Request) {
  return req.headers.get("authorization")?.slice(7) ?? null;
}

// GET /api/group-chats — list public groups
export async function GET() {
  const { data, error } = await supabaseServer
    .from("group_chats")
    .select("id, team_name, is_public, created_by, description, image_url")
    .eq("is_public", true)
    .order("team_name");

  if (error) {
    // Fallback: basic columns only (pre-migration schema)
    const { data: basic, error: basicErr } = await supabaseServer
      .from("group_chats")
      .select("id, team_name")
      .order("team_name");

    if (basicErr) {
      return NextResponse.json({ groups: [], setupRequired: true, error: basicErr.message });
    }

    return NextResponse.json({
      groups: (basic ?? []).map((c: any) => ({
        ...c, is_public: true, created_by: null, description: null, image_url: null, member_count: 0,
      })),
    });
  }

  const chats = data ?? [];
  const groupIds = chats.map((c: any) => c.id);

  // Fetch member counts only for the groups we already have (safe, filtered query)
  const counts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: members } = await supabaseServer
      .from("group_chat_members")
      .select("group_chat_id")
      .in("group_chat_id", groupIds);
    for (const m of members ?? []) {
      counts[(m as any).group_chat_id] = (counts[(m as any).group_chat_id] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    groups: chats.map((c: any) => ({ ...c, member_count: counts[c.id] ?? 0 })),
  });
}

// POST /api/group-chats — create a new group chat
export async function POST(req: Request) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, is_public, image_url } = await readJsonObject(req) as {
    name?: string; description?: string; is_public?: boolean; image_url?: string;
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

  // Create the chat (try full schema first, fallback for pre-migration)
  let chat: any = null;
  const { data: fullChat, error: chatErr } = await supabaseServer
    .from("group_chats")
    .insert({
      team_name:   trimmedName,
      description: description?.trim() || null,
      is_public:   !!is_public,
      created_by:  user.id,
      image_url:   image_url ?? null,
    })
    .select()
    .single();

  if (chatErr) {
    // Columns may not exist yet — insert with just team_name
    const { data: basicChat, error: basicErr } = await supabaseServer
      .from("group_chats")
      .insert({ team_name: trimmedName })
      .select()
      .single();
    if (basicErr || !basicChat) {
      console.error("[group-chats POST]", basicErr?.message ?? chatErr.message);
      return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
    }
    chat = basicChat;
  } else {
    chat = fullChat;
  }

  if (!chat) {
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
  }

  // Auto-join creator
  await supabaseServer
    .from("group_chat_members")
    .insert({ group_chat_id: chat.id, user_id: user.id });

  return NextResponse.json({ chat });
}
