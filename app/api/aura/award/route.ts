import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { awardAura } from "@/app/lib/aura";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { event_type, related_id, recipient_id } = body as {
    event_type: string;
    related_id: string;
    recipient_id?: string;
  };

  if (!event_type || !related_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // like_received is awarded to the comment author, everything else to the caller
  const targetUserId =
    event_type === "like_received" && recipient_id ? recipient_id : user.id;

  const result = await awardAura(targetUserId, event_type, related_id);
  return NextResponse.json(result);
}
