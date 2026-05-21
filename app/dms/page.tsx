"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";

/* ── Types ── */
type Profile = { id: string; username: string; display_name: string; avatar_url?: string | null };
type InboxEntry = {
  id: string; other: Profile; convId: string | null;
  preview: string; last_at: string | null; unread: number;
};
type Msg = { id: string; sender_id: string; content: string; created_at: string; conversation_id?: string };
type GroupChat = {
  id: string; team_name: string; is_public: boolean;
  created_by: string | null; description: string | null;
  image_url?: string | null;
  member_count: number;
  last_message: { content: string; created_at: string; sender_id: string } | null;
  unread: number; last_read_at: string | null;
};
type GroupMsg = {
  id: string; sender_id: string; content: string; created_at: string;
  sender: { username: string; display_name: string; avatar_url: string | null } | null;
};
type GroupInvite = {
  id: string; group_chat_id: string; group_name: string;
  inviter_username: string; inviter_avatar_url: string | null; created_at: string;
};

/* ── Team logos & colours (mirrors passes/page.tsx) ── */
const TEAM_LOGOS: Record<string, string> = {
  "Adelaide Crows": "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  "Geelong Cats": "/team-logos/cats.png", "Gold Coast Suns": "/team-logos/suns.png",
  "GWS Giants": "/team-logos/giants.png", Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png", "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png", Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png", "Sydney Swans": "/team-logos/swans.png",
  "West Coast Eagles": "/team-logos/eagles.png", "Western Bulldogs": "/team-logos/bulldogs.png",
};
const TEAM_COLORS: Record<string, string> = {
  "Adelaide Crows": "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1a1a1a", Essendon: "#cc0000", Fremantle: "#7c3aed",
  "Geelong Cats": "#1e3a8a", "Gold Coast Suns": "#ef4444", "GWS Giants": "#f97316",
  Hawthorn: "#78350f", Melbourne: "#1e40af", "North Melbourne": "#1e3a8a",
  "Port Adelaide": "#1e293b", Richmond: "#f59e0b", "St Kilda": "#dc2626",
  "Sydney Swans": "#dc2626", "West Coast Eagles": "#1d4ed8", "Western Bulldogs": "#1e40af",
};
const AFL_TEAM_NAMES = new Set(Object.keys(TEAM_LOGOS));

/* ── Helpers ── */
const PALETTE: [string, string][] = [
  ["#1a3a5c","#60a5fa"],["#2d1b4e","#c084fc"],["#1a3d2e","#4ade80"],
  ["#3d2a10","#fb923c"],["#3d1a1a","#f87171"],["#1a3d3a","#2dd4bf"],
  ["#2a2a10","#facc15"],["#1a2a3d","#38bdf8"],
];
function pal(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function ago(iso: string | null) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.floor(mo / 12)}y`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string) {
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

/* ── Avatar ── */
function Avatar({ name, url, size = 46 }: { name: string; url?: string | null; size?: number }) {
  const [bg, fg] = pal(name || "?");
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.38), fontWeight: 900 }}>
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ── Sign-in gate ── */
function SignInGate() {
  const router = useRouter();
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px calc(90px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 340, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface-1)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>💬</div>
        <h2 style={{ fontSize: 22, fontWeight: 950, color: "var(--text-1)", margin: "0 0 6px" }}>Sign in to message</h2>
        <button onClick={() => router.push("/login")} style={{ display: "block", width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "var(--text-1)", fontWeight: 900, fontSize: 16, border: "none", cursor: "pointer" }}>Sign In</button>
      </div>
    </main>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
export default function DMsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>}>
      <DMsPageInner />
    </Suspense>
  );
}

function DMsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* ── Core state ── */
  const [user,      setUser]      = useState<User | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [ready,     setReady]     = useState(false);
  const [inbox,     setInbox]     = useState<InboxEntry[]>([]);
  const [search,    setSearch]    = useState("");
  const [tab,       setTab]       = useState<"users" | "groups">("users");

  /* ── DM thread state ── */
  const [activeConv,    setActiveConv]    = useState<InboxEntry | null>(null);
  const [messages,      setMessages]      = useState<Msg[]>([]);
  const [text,          setText]          = useState("");
  const [sendError,     setSendError]     = useState("");
  const [deletingIds,   setDeletingIds]   = useState<Set<string>>(() => new Set());
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  /* ── Group state ── */
  const [groupChats,         setGroupChats]         = useState<GroupChat[]>([]);
  const [activeGroup,        setActiveGroup]        = useState<GroupChat | null>(null);
  const [groupMessages,      setGroupMessages]      = useState<GroupMsg[]>([]);
  const [groupText,          setGroupText]          = useState("");
  const [groupSendError,     setGroupSendError]     = useState("");
  const [groupSelectedMsgId, setGroupSelectedMsgId] = useState<string | null>(null);
  const [groupDeletingIds,   setGroupDeletingIds]   = useState<Set<string>>(() => new Set());
  const [pendingInvites,     setPendingInvites]     = useState<GroupInvite[]>([]);
  const [respondingId,       setRespondingId]       = useState<string | null>(null);

  /* ── Members modal state ── */
  const [membersModalOpen,    setMembersModalOpen]    = useState(false);
  const [membersModalList,    setMembersModalList]    = useState<{ id: string; username: string; display_name: string; avatar_url: string | null }[]>([]);
  const [membersModalLoading, setMembersModalLoading] = useState(false);
  const [membersSearch,       setMembersSearch]       = useState("");

  /* ── Discover state ── */
  const [discoverOpen,    setDiscoverOpen]    = useState(false);
  const [discoverSearch,  setDiscoverSearch]  = useState("");
  const [discoverResults, setDiscoverResults] = useState<GroupChat[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError,   setDiscoverError]   = useState("");
  const [joiningId,       setJoiningId]       = useState<string | null>(null);

  /* ── Create chat state ── */
  const [createOpen,         setCreateOpen]         = useState(false);
  const [createName,         setCreateName]         = useState("");
  const [createDesc,         setCreateDesc]         = useState("");
  const [createPublic,       setCreatePublic]       = useState(false);
  const [creating,           setCreating]           = useState(false);
  const [createError,        setCreateError]        = useState("");
  const [createImageDataUrl, setCreateImageDataUrl] = useState<string | null>(null);
  const createImageInputRef = useRef<HTMLInputElement>(null);

  /* ── Invite modal state ── */
  const [inviteOpen,        setInviteOpen]        = useState(false);
  const [inviteSearch,      setInviteSearch]      = useState("");
  const [inviteFriends,     setInviteFriends]     = useState<Profile[]>([]);
  const [groupMemberIds,    setGroupMemberIds]    = useState<Set<string>>(() => new Set());
  const [sentInviteIds,     setSentInviteIds]     = useState<Set<string>>(() => new Set());
  const [sendingInviteId,   setSendingInviteId]   = useState<string | null>(null);

  const bottomRef     = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const profileCache  = useRef<Record<string, Profile>>({});

  /* ── Token helper ── */
  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  /* ── Auth ── */
  useEffect(() => {
    const fallback = setTimeout(() => setReady(true), 6000);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", u.id).single();
        setMyProfile(data ?? null);
        if (data) profileCache.current[(data as any).id] = data as Profile;
      }
    }).catch(() => {}).finally(() => { clearTimeout(fallback); setReady(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        try {
          const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", u.id).single();
          setMyProfile(data ?? null);
          if (data) profileCache.current[(data as any).id] = data as Profile;
        } catch {}
      } else {
        setMyProfile(null);
      }
    });
    return () => { clearTimeout(fallback); subscription.unsubscribe(); };
  }, []);

  /* ── Load inbox ── */
  const loadInbox = useCallback(async () => {
    if (!myProfile) return;
    const [friendsRes, convosRes] = await Promise.all([
      supabase.from("friendships").select("requester_id,addressee_id").eq("status", "accepted").or(`requester_id.eq.${myProfile.id},addressee_id.eq.${myProfile.id}`),
      supabase.from("dm_conversations").select("*").or(`participant_a.eq.${myProfile.id},participant_b.eq.${myProfile.id}`).order("last_message_at", { ascending: false }),
    ]);
    const friendIds = (friendsRes.data ?? []).map(r => r.requester_id === myProfile.id ? r.addressee_id : r.requester_id);
    const convos = convosRes.data ?? [];
    const convoOtherIds = convos.map(r => r.participant_a === myProfile.id ? r.participant_b : r.participant_a);
    const allIds = [...new Set([...friendIds, ...convoOtherIds])];
    if (!allIds.length) { setInbox([]); return; }
    const [profilesRes, unreadRes] = await Promise.all([
      supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", allIds),
      convos.length
        ? supabase.from("dm_messages").select("conversation_id").in("conversation_id", convos.map(r => r.id)).neq("sender_id", myProfile.id).is("read_at", null)
        : Promise.resolve({ data: [] }),
    ]);
    const pm: Record<string, Profile> = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const um: Record<string, number> = {};
    (unreadRes.data ?? []).forEach((m: any) => { um[m.conversation_id] = (um[m.conversation_id] ?? 0) + 1; });
    const entries: InboxEntry[] = convos.map(r => {
      const oid = r.participant_a === myProfile.id ? r.participant_b : r.participant_a;
      return { id: oid, other: pm[oid], convId: r.id, preview: r.last_message_preview ?? "", last_at: r.last_message_at, unread: um[r.id] ?? 0 };
    }).filter(e => e.other);
    const seenIds = new Set(entries.map(e => e.id));
    for (const fid of friendIds) {
      if (!seenIds.has(fid) && pm[fid]) entries.push({ id: fid, other: pm[fid], convId: null, preview: "", last_at: null, unread: 0 });
    }
    setInbox(entries);
  }, [myProfile]);

  /* ── Load group chats ── */
  const loadGroupChats = useCallback(async () => {
    if (!myProfile) return;
    const { data: memberships } = await supabase.from("group_chat_members").select("group_chat_id, last_read_at").eq("user_id", myProfile.id);
    if (!memberships?.length) { setGroupChats([]); return; }
    const chatIds = memberships.map((m: any) => m.group_chat_id);
    const [chatsRes, allMembersRes, recentMsgsRes] = await Promise.all([
      // Try with all columns; falls back below if migration columns don't exist yet
      supabase.from("group_chats").select("id, team_name, is_public, created_by, description").in("id", chatIds),
      supabase.from("group_chat_members").select("group_chat_id").in("group_chat_id", chatIds),
      supabase.from("group_chat_messages").select("id, group_chat_id, content, created_at, sender_id").in("group_chat_id", chatIds).order("created_at", { ascending: false }).limit(200),
    ]);
    // If the group-chats-update.sql migration hasn't been run yet, is_public etc. won't exist —
    // fall back to the base columns so existing members still see their chats.
    let chatsData: any[] = chatsRes.data ?? [];
    if (!chatsRes.data && chatsRes.error) {
      const { data: fallback } = await supabase.from("group_chats").select("id, team_name").in("id", chatIds);
      chatsData = (fallback ?? []).map((c: any) => ({ ...c, is_public: true, created_by: null, description: null }));
    }
    const membershipMap: Record<string, string | null> = {};
    for (const m of memberships) membershipMap[(m as any).group_chat_id] = (m as any).last_read_at;
    const memberCounts: Record<string, number> = {};
    for (const m of allMembersRes.data ?? []) {
      const cid = (m as any).group_chat_id;
      memberCounts[cid] = (memberCounts[cid] ?? 0) + 1;
    }
    const lastMsgMap: Record<string, { content: string; created_at: string; sender_id: string }> = {};
    const unreadMap: Record<string, number> = {};
    for (const msg of recentMsgsRes.data ?? []) {
      const m = msg as any;
      if (!lastMsgMap[m.group_chat_id]) lastMsgMap[m.group_chat_id] = { content: m.content, created_at: m.created_at, sender_id: m.sender_id };
      const lastRead = membershipMap[m.group_chat_id];
      if (m.sender_id !== myProfile.id && (!lastRead || new Date(m.created_at) > new Date(lastRead)))
        unreadMap[m.group_chat_id] = (unreadMap[m.group_chat_id] ?? 0) + 1;
    }
    setGroupChats(chatsData.map((c: any) => ({
      id: c.id, team_name: c.team_name, is_public: c.is_public ?? true, created_by: c.created_by ?? null, description: c.description ?? null,
      member_count: memberCounts[c.id] ?? 0, last_message: lastMsgMap[c.id] ?? null,
      unread: unreadMap[c.id] ?? 0, last_read_at: membershipMap[c.id] ?? null,
    })).sort((a, b) => {
      const at = a.last_message?.created_at ?? ""; const bt = b.last_message?.created_at ?? "";
      return bt > at ? 1 : -1;
    }));
  }, [myProfile]);

  /* ── Retroactive default memberships ── */
  // Ensures the user is in (a) the General chat and (b) their team chat if they
  // have a team pass. Runs silently when the Groups tab opens so existing
  // accounts that pre-date these features get caught up automatically.
  const ensureTeamPassGroupMembership = useCallback(async () => {
    if (!myProfile) return;

    // Determine which chats we need to check
    const chatNamesToJoin: string[] = ["General"];

    const { data: teamPass } = await supabase
      .from("user_team_passes")
      .select("team_name")
      .eq("user_id", myProfile.id)
      .eq("active", true)
      .maybeSingle();
    if (teamPass?.team_name) chatNamesToJoin.push(teamPass.team_name);

    // Load all matching group chats at once
    const { data: chats } = await supabase
      .from("group_chats")
      .select("id, team_name")
      .in("team_name", chatNamesToJoin);
    if (!chats?.length) return;

    // Load current memberships for those chats
    const chatIds = chats.map((c: any) => c.id);
    const { data: existing } = await supabase
      .from("group_chat_members")
      .select("group_chat_id")
      .in("group_chat_id", chatIds)
      .eq("user_id", myProfile.id);
    const memberOf = new Set((existing ?? []).map((m: any) => m.group_chat_id));

    // Insert any missing memberships
    const missing = chats.filter((c: any) => !memberOf.has(c.id));
    if (!missing.length) return;

    await supabase
      .from("group_chat_members")
      .insert(missing.map((c: any) => ({ group_chat_id: c.id, user_id: myProfile.id })));

    await loadGroupChats();
  }, [myProfile, loadGroupChats]);

  /* ── Load pending invites ── */
  const loadPendingInvites = useCallback(async () => {
    if (!myProfile) return;
    const { data: invites } = await supabase
      .from("group_chat_invites")
      .select("id, group_chat_id, inviter_id, created_at")
      .eq("invitee_id", myProfile.id)
      .eq("status", "pending");
    if (!invites?.length) { setPendingInvites([]); return; }
    const chatIds = [...new Set(invites.map((i: any) => i.group_chat_id))];
    const inviterIds = [...new Set(invites.map((i: any) => i.inviter_id))];
    const [chatsRes, profilesRes] = await Promise.all([
      supabase.from("group_chats").select("id, team_name").in("id", chatIds),
      supabase.from("profiles").select("id, username, avatar_url").in("id", inviterIds),
    ]);
    const chatMap: Record<string, string> = Object.fromEntries((chatsRes.data ?? []).map((c: any) => [c.id, c.team_name]));
    const profileMap: Record<string, any> = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    setPendingInvites(invites.map((i: any) => ({
      id: i.id, group_chat_id: i.group_chat_id,
      group_name: chatMap[i.group_chat_id] ?? "Unknown chat",
      inviter_username: profileMap[i.inviter_id]?.username ?? "someone",
      inviter_avatar_url: profileMap[i.inviter_id]?.avatar_url ?? null,
      created_at: i.created_at,
    })));
  }, [myProfile]);

  useEffect(() => {
    if (!myProfile) return;
    loadInbox();
    const ch = supabase.channel("dmi_" + myProfile.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_conversations" }, loadInbox)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myProfile, loadInbox]);

  useEffect(() => {
    if (!myProfile || tab !== "groups") return;
    loadGroupChats();
    loadPendingInvites();
  }, [myProfile, tab, loadGroupChats, loadPendingInvites]);

  useEffect(() => {
    if (!myProfile || tab !== "groups") return;
    ensureTeamPassGroupMembership();
  }, [myProfile, tab, ensureTeamPassGroupMembership]);

  /* ── Auto-open from ?open= ── */
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || autoOpened || !myProfile || inbox.length === 0) return;
    const existing = inbox.find(e => e.other.id === openId);
    if (existing) { setAutoOpened(true); openEntry(existing); return; }
    supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", openId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAutoOpened(true);
        openEntry({ id: (data as any).id, other: data as Profile, convId: null, preview: "", last_at: null, unread: 0 });
      });
  }, [searchParams, inbox, myProfile, autoOpened]);

  /* ── Open DM ── */
  async function openEntry(entry: InboxEntry) {
    setActiveConv(entry); setMessages([]); setSelectedMsgId(null);
    if (!entry.convId || !myProfile) return;
    const { data } = await supabase.from("dm_messages").select("*").eq("conversation_id", entry.convId).order("created_at", { ascending: true });
    setMessages(data ?? []);
    await supabase.from("dm_messages").update({ read_at: new Date().toISOString() }).eq("conversation_id", entry.convId).neq("sender_id", myProfile.id).is("read_at", null);
    loadInbox();
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  /* ── Open group ── */
  async function openGroup(group: GroupChat) {
    setActiveGroup(group); setGroupMessages([]); setGroupSelectedMsgId(null);
    const { data: msgs } = await supabase.from("group_chat_messages").select("id, sender_id, content, created_at").eq("group_chat_id", group.id).order("created_at", { ascending: true }).limit(200);
    if (msgs?.length) {
      const senderIds = [...new Set((msgs as any[]).map(m => m.sender_id as string))];
      const uncached = senderIds.filter(id => !profileCache.current[id]);
      if (uncached.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", uncached);
        for (const p of profiles ?? []) profileCache.current[(p as any).id] = p as Profile;
      }
      setGroupMessages((msgs as any[]).map(m => ({ ...m, sender: profileCache.current[m.sender_id] ?? null })));
    }
    if (myProfile) {
      await supabase.from("group_chat_members").update({ last_read_at: new Date().toISOString() }).eq("group_chat_id", group.id).eq("user_id", myProfile.id);
    }
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  /* ── Open invite modal ── */
  async function openInviteModal() {
    if (!myProfile || !activeGroup) return;
    setInviteOpen(true); setInviteSearch(""); setSentInviteIds(new Set());
    const [friendsRes, membersRes, existingInvitesRes] = await Promise.all([
      supabase.from("friendships").select("requester_id,addressee_id").eq("status", "accepted").or(`requester_id.eq.${myProfile.id},addressee_id.eq.${myProfile.id}`),
      supabase.from("group_chat_members").select("user_id").eq("group_chat_id", activeGroup.id),
      supabase.from("group_chat_invites").select("invitee_id").eq("group_chat_id", activeGroup.id).eq("status", "pending"),
    ]);
    const memberIds = new Set((membersRes.data ?? []).map((m: any) => m.user_id as string));
    const alreadyInvited = new Set((existingInvitesRes.data ?? []).map((i: any) => i.invitee_id as string));
    setGroupMemberIds(memberIds);
    setSentInviteIds(alreadyInvited);
    const friendIds = (friendsRes.data ?? []).map(r => r.requester_id === myProfile.id ? r.addressee_id : r.requester_id).filter(id => !memberIds.has(id));
    if (!friendIds.length) { setInviteFriends([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", friendIds);
    setInviteFriends((profiles ?? []) as Profile[]);
  }

  /* ── Realtime DM ── */
  const activeConvId = activeConv?.convId ?? null;
  const myProfileId  = myProfile?.id ?? null;
  useEffect(() => {
    if (!activeConvId || !myProfileId) return;
    const ch = supabase.channel("dmc_" + activeConvId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${activeConvId}` }, payload => {
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new as Msg]);
        if (payload.new.sender_id !== myProfileId) supabase.from("dm_messages").update({ read_at: new Date().toISOString() }).eq("id", payload.new.id);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${activeConvId}` }, payload => {
        const id = (payload.old as Msg).id;
        setMessages(prev => prev.filter(m => m.id !== id));
        setSelectedMsgId(prev => prev === id ? null : prev);
      }).subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("dm_messages").select("*").eq("conversation_id", activeConvId).order("created_at", { ascending: true });
      if (!data) return;
      setMessages(prev => {
        const stillSending = prev.filter(m => m.id.startsWith("t"));
        const prevIds = prev.filter(m => !m.id.startsWith("t")).map(m => m.id).join("|");
        if (prevIds === data.map(m => m.id).join("|")) return prev;
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
        return [...data, ...stillSending];
      });
    }, 3000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [activeConvId, myProfileId]);

  /* ── Realtime group ── */
  const activeGroupId = activeGroup?.id ?? null;
  useEffect(() => {
    if (!activeGroupId || !myProfileId) return;
    const ch = supabase.channel("gc_" + activeGroupId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_chat_messages", filter: `group_chat_id=eq.${activeGroupId}` }, async payload => {
        const msg = payload.new as any;
        if (!profileCache.current[msg.sender_id]) {
          const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", msg.sender_id).maybeSingle();
          if (data) profileCache.current[(data as any).id] = data as Profile;
        }
        setGroupMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender: profileCache.current[msg.sender_id] ?? null }]);
        if (msg.sender_id !== myProfileId) supabase.from("group_chat_members").update({ last_read_at: new Date().toISOString() }).eq("group_chat_id", activeGroupId).eq("user_id", myProfileId);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_chat_messages", filter: `group_chat_id=eq.${activeGroupId}` }, payload => {
        const id = (payload.old as any).id;
        setGroupMessages(prev => prev.filter(m => m.id !== id));
        setGroupSelectedMsgId(prev => prev === id ? null : prev);
      }).subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("group_chat_messages").select("id, sender_id, content, created_at").eq("group_chat_id", activeGroupId).order("created_at", { ascending: true }).limit(200);
      if (!data) return;
      setGroupMessages(prev => {
        const stillSending = prev.filter(m => m.id.startsWith("t"));
        const prevIds = prev.filter(m => !m.id.startsWith("t")).map(m => m.id).join("|");
        if (prevIds === (data as any[]).map(m => m.id).join("|")) return prev;
        const cache = profileCache.current;
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
        return [...(data as any[]).map(m => ({ ...m, sender: cache[m.sender_id] ?? null })), ...stillSending];
      });
    }, 3000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [activeGroupId, myProfileId]);

  /* ── Send DM ── */
  async function send() {
    if (!text.trim() || !activeConv || !myProfile) return;
    const content = text.trim(); setText(""); setSendError("");
    let convId = activeConv.convId;
    if (!convId) {
      const [pA, pB] = [myProfile.id, activeConv.other.id].sort();
      const { data: existing } = await supabase.from("dm_conversations").select("id").or(`and(participant_a.eq.${pA},participant_b.eq.${pB}),and(participant_a.eq.${pB},participant_b.eq.${pA})`).maybeSingle();
      convId = existing?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase.from("dm_conversations").insert({ participant_a: pA, participant_b: pB }).select("id").single();
        convId = created?.id ?? null;
      }
      if (convId) setActiveConv(prev => prev ? { ...prev, convId } : prev);
    }
    if (!convId) { setText(content); setSendError("Could not create conversation."); return; }
    const tempId = `t${Date.now()}`;
    setMessages(p => [...p, { id: tempId, sender_id: myProfile.id, content, created_at: new Date().toISOString() }]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const { data: msg, error: msgErr } = await supabase.from("dm_messages").insert({ conversation_id: convId, sender_id: myProfile.id, content }).select().single();
    if (msgErr || !msg) { setMessages(p => p.filter(m => m.id !== tempId)); setText(content); setSendError(msgErr?.message ?? "Failed to send"); return; }
    setMessages(p => p.map(m => m.id === tempId ? msg : m));
    await supabase.from("dm_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: content.length > 60 ? content.slice(0, 60) + "…" : content }).eq("id", convId);
    loadInbox(); inputRef.current?.focus();
  }

  /* ── Send group message ── */
  async function sendGroupMessage() {
    if (!groupText.trim() || !activeGroup || !myProfile) return;
    const content = groupText.trim(); setGroupText(""); setGroupSendError("");
    const tempId = `t${Date.now()}`;
    setGroupMessages(p => [...p, { id: tempId, sender_id: myProfile.id, content, created_at: new Date().toISOString(), sender: { username: myProfile.username, display_name: myProfile.display_name, avatar_url: myProfile.avatar_url ?? null } }]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    const { data: msg, error } = await supabase.from("group_chat_messages").insert({ group_chat_id: activeGroup.id, sender_id: myProfile.id, content }).select().single();
    if (error || !msg) { setGroupMessages(p => p.filter(m => m.id !== tempId)); setGroupText(content); setGroupSendError(error?.message ?? "Failed to send"); return; }
    setGroupMessages(p => p.map(m => m.id === tempId ? { ...(msg as any), sender: { username: myProfile.username, display_name: myProfile.display_name, avatar_url: myProfile.avatar_url ?? null } } : m));
    await supabase.from("group_chat_members").update({ last_read_at: new Date().toISOString() }).eq("group_chat_id", activeGroup.id).eq("user_id", myProfile.id);
    groupInputRef.current?.focus();
  }

  async function syncDMPreview(convId: string, nextMessages: Msg[]) {
    const latest = nextMessages[nextMessages.length - 1] ?? null;
    await supabase.from("dm_conversations").update({ last_message_at: latest?.created_at ?? null, last_message_preview: latest ? (latest.content.length > 60 ? latest.content.slice(0, 60) + "..." : latest.content) : "" }).eq("id", convId);
    loadInbox();
  }

  async function deleteMessage(message: Msg) {
    if (!myProfile || message.sender_id !== myProfile.id || message.id.startsWith("t")) return;
    const convId = activeConv?.convId ?? message.conversation_id;
    if (!convId || !confirm("Delete this message?")) return;
    const before = messages; const next = before.filter(m => m.id !== message.id);
    setSendError(""); setSelectedMsgId(null); setDeletingIds(prev => new Set(prev).add(message.id)); setMessages(next);
    const { error } = await supabase.from("dm_messages").delete().eq("id", message.id).eq("sender_id", myProfile.id);
    setDeletingIds(prev => { const c = new Set(prev); c.delete(message.id); return c; });
    if (error) { setMessages(before); setSelectedMsgId(message.id); setSendError(error.message); return; }
    await syncDMPreview(convId, next);
  }

  async function deleteGroupMessage(message: GroupMsg) {
    if (!myProfile || message.sender_id !== myProfile.id || message.id.startsWith("t") || !confirm("Delete this message?")) return;
    const before = groupMessages; const next = before.filter(m => m.id !== message.id);
    setGroupSendError(""); setGroupSelectedMsgId(null); setGroupDeletingIds(prev => new Set(prev).add(message.id)); setGroupMessages(next);
    const { error } = await supabase.from("group_chat_messages").delete().eq("id", message.id).eq("sender_id", myProfile.id);
    setGroupDeletingIds(prev => { const c = new Set(prev); c.delete(message.id); return c; });
    if (error) { setGroupMessages(before); setGroupSelectedMsgId(message.id); setGroupSendError(error.message); }
  }

  /* ── Create group ── */
  async function createGroup() {
    if (!createName.trim() || creating) return;
    setCreating(true); setCreateError("");
    const token = await getToken();

    // Use the already-resized data URL directly (no storage upload needed)
    const imageUrl = createImageDataUrl ?? undefined;

    const res = await fetch("/api/group-chats", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        is_public: createPublic,
        image_url: imageUrl,
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(json.error ?? "Failed to create"); return; }
    setCreateOpen(false);
    setCreateName(""); setCreateDesc(""); setCreatePublic(false);
    setCreateImageDataUrl(null);
    await loadGroupChats();
    openGroup(json.chat);
    setTab("groups");
  }

  /* ── Join public chat ── */
  async function joinChat(chatId: string) {
    if (joiningId) return;
    setJoiningId(chatId);
    const token = await getToken();
    const res = await fetch(`/api/group-chats/${chatId}/join`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const json = await res.json();
    setJoiningId(null);
    if (!res.ok) { alert(json.error ?? "Could not join"); return; }
    setDiscoverOpen(false);
    await loadGroupChats();
    const joined = discoverResults.find(g => g.id === chatId);
    if (joined) { setTab("groups"); openGroup(joined); }
  }

  /* ── Respond to invite ── */
  async function respondInvite(invite: GroupInvite, action: "accept" | "decline") {
    setRespondingId(invite.id);
    const token = await getToken();
    const res = await fetch(`/api/group-chats/invites/${invite.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action }) });
    const json = await res.json();
    setRespondingId(null);
    if (!res.ok) { alert(json.error ?? "Failed"); return; }
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
    if (action === "accept") { await loadGroupChats(); }
  }

  /* ── Send invite ── */
  async function sendInvite(friendId: string) {
    if (!myProfile || !activeGroup || sendingInviteId) return;
    setSendingInviteId(friendId);
    const { error } = await supabase.from("group_chat_invites").insert({ group_chat_id: activeGroup.id, inviter_id: myProfile.id, invitee_id: friendId });
    setSendingInviteId(null);
    if (!error) setSentInviteIds(prev => new Set(prev).add(friendId));
  }

  /* ── Group members modal ── */
  async function openMembersModal() {
    if (!activeGroup) return;
    setMembersModalOpen(true);
    setMembersModalLoading(true);
    setMembersModalList([]);
    setMembersSearch("");
    const { data: members } = await supabase
      .from("group_chat_members")
      .select("user_id")
      .eq("group_chat_id", activeGroup.id);
    if (!members?.length) { setMembersModalLoading(false); return; }
    const userIds = members.map((m: any) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    setMembersModalList((profiles ?? []).map((p: any) => ({
      id: p.id, username: p.username ?? "", display_name: p.display_name ?? "", avatar_url: p.avatar_url ?? null,
    })));
    setMembersModalLoading(false);
  }

  /* ── Delete group ── */
  async function deleteGroup() {
    if (!myProfile || !activeGroup) return;
    if (!confirm(`Delete "${activeGroup.team_name}"? This will remove all messages and members permanently.`)) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const res = await fetch(`/api/group-chats/${activeGroup.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Failed to delete group"); return; }
    setActiveGroup(null); setTab("groups");
    await loadGroupChats();
  }

  /* ── Leave group ── */
  async function leaveGroup() {
    if (!myProfile || !activeGroup || !confirm(`Leave ${activeGroup.team_name}?`)) return;
    await supabase.from("group_chat_members").delete().eq("group_chat_id", activeGroup.id).eq("user_id", myProfile.id);
    setActiveGroup(null); setTab("groups");
    await loadGroupChats();
  }

  /* ── Discover groups ── */
  const allPublicGroupsRef = useRef<GroupChat[]>([]);

  // Load groups whenever the modal opens.
  useEffect(() => {
    if (!discoverOpen) {
      setDiscoverLoading(false);
      setDiscoverError("");
      return;
    }
    let cancelled = false;

    const load = async () => {
      setDiscoverLoading(true);
      setDiscoverError("");
      try {
        const token = await getToken();
        const res = await fetch("/api/group-chats", {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || json?.setupRequired) {
          console.error("[discover groups] API error:", json?.error);
          setDiscoverResults([]);
          setDiscoverError(json?.error ?? "failed");
          return;
        }

        const allGroups: GroupChat[] = (json.groups ?? []).map((c: any) => ({
          id: c.id, team_name: c.team_name, is_public: c.is_public ?? true,
          created_by: c.created_by ?? null, description: c.description ?? null,
          image_url: c.image_url ?? null,
          member_count: c.member_count ?? 0,
          last_message: null, unread: 0, last_read_at: null,
        }));

        allPublicGroupsRef.current = allGroups;
        if (!cancelled) setDiscoverResults(allGroups);
      } catch (err) {
        console.error("[discover groups]", err);
        if (!cancelled) {
          setDiscoverResults([]);
          setDiscoverError("failed");
        }
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [discoverOpen]);

  // Filter cached groups when search changes (no extra fetch needed)
  useEffect(() => {
    const q = discoverSearch.trim().toLowerCase();
    if (!q) {
      setDiscoverResults(allPublicGroupsRef.current);
    } else {
      setDiscoverResults(allPublicGroupsRef.current.filter(g => g.team_name.toLowerCase().includes(q)));
    }
  }, [discoverSearch]);

  /* ── Day grouping ── */
  const grouped: { day: string; msgs: Msg[] }[] = [];
  messages.forEach(m => { const d = fmtDay(m.created_at); const last = grouped[grouped.length - 1]; if (last?.day === d) last.msgs.push(m); else grouped.push({ day: d, msgs: [m] }); });
  const groupedGroup: { day: string; msgs: GroupMsg[] }[] = [];
  groupMessages.forEach(m => { const d = fmtDay(m.created_at); const last = groupedGroup[groupedGroup.length - 1]; if (last?.day === d) last.msgs.push(m); else groupedGroup.push({ day: d, msgs: [m] }); });

  const filteredInbox = inbox.filter(e => !search || e.other?.username?.toLowerCase().includes(search.toLowerCase()) || e.other?.display_name?.toLowerCase().includes(search.toLowerCase()));
  const filteredGroups = groupChats.filter(g => !search || g.team_name.toLowerCase().includes(search.toLowerCase()));
  const filteredInviteFriends = inviteFriends.filter(f => !inviteSearch || f.username.toLowerCase().includes(inviteSearch.toLowerCase()) || f.display_name.toLowerCase().includes(inviteSearch.toLowerCase()));
  const myGroupIds = new Set(groupChats.map(g => g.id));

  /* ── Guards ── */
  if (!ready) return <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;
  if (!user) return <SignInGate />;
  if (!myProfile?.username) return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ textAlign: "center", color: "var(--text-3)" }}>
        <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Set up your profile first</p>
        <a href="/profile" style={{ color: "#22c55e", fontWeight: 800 }}>Go to Profile →</a>
      </div>
    </main>
  );

  /* ═══════════ GROUP THREAD VIEW ═══════════ */
  if (activeGroup) return (
    <main style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", justifyContent: "center", zIndex: 110 }}>
    <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", height: "100%", borderInline: "0.5px solid var(--border-2)" }}>

      {/* ── Group members modal ── */}
      {membersModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
          <div onClick={() => setMembersModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: 420, maxHeight: "80dvh", background: "var(--surface-1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 20px 16px", borderBottom: "1px solid var(--border-2)" }}>
              {(activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name])
                ? <img src={activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name]!} alt={activeGroup.team_name} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", background: TEAM_COLORS[activeGroup.team_name] ?? "#1a1a1a" }} />
                : <div style={{ width: 64, height: 64, borderRadius: "50%", background: activeGroup.team_name === "General" ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "linear-gradient(135deg,#1a3d2e,#063d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{activeGroup.team_name === "General" ? "💬" : "🏉"}</div>
              }
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-1)", textAlign: "center" }}>{activeGroup.team_name}</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>{activeGroup.member_count} member{activeGroup.member_count !== 1 ? "s" : ""}</div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: 4, width: "100%" }}>
                <button onClick={() => { setMembersModalOpen(false); openInviteModal(); }} style={{ flex: 1, padding: "9px 20px", borderRadius: 999, background: "var(--surface-3)", border: "none", color: "var(--text-1)", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>Invite</button>
                {activeGroup.created_by === myProfile.id
                  ? <button onClick={() => { setMembersModalOpen(false); deleteGroup(); }} style={{ flex: 1, padding: "9px 20px", borderRadius: 999, background: "#ef4444", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>Delete group</button>
                  : <button onClick={() => { setMembersModalOpen(false); leaveGroup(); }} style={{ flex: 1, padding: "9px 20px", borderRadius: 999, background: "#ef4444", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>Leave group</button>
                }
              </div>
            </div>
            {!membersModalLoading && membersModalList.length > 0 && (
              <div style={{ padding: "10px 16px 4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", borderRadius: 12, padding: "8px 12px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="var(--text-3)" strokeWidth="2.2"/><path d="m21 21-4.35-4.35" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round"/></svg>
                  <input
                    placeholder="Search members…"
                    value={membersSearch}
                    onChange={e => setMembersSearch(e.target.value)}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 14, fontFamily: "inherit" }}
                  />
                  {membersSearch && <button onClick={() => setMembersSearch("")} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>}
                </div>
              </div>
            )}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {membersModalLoading ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading members…</div>
              ) : membersModalList.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No members found.</div>
              ) : membersModalList.filter(m => !membersSearch || m.username.toLowerCase().includes(membersSearch.toLowerCase()) || m.display_name.toLowerCase().includes(membersSearch.toLowerCase())).map((member, i) => (
                <button key={member.id} onClick={() => { setMembersModalOpen(false); router.push(`/profile/${member.username}`); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", background: "none", border: "none", borderTop: i > 0 ? "1px solid var(--border-2)" : "none", cursor: "pointer", textAlign: "left" }}>
                  <Avatar name={member.username} url={member.avatar_url} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.display_name || member.username}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>@{member.username}</div>
                  </div>
                  {member.id === activeGroup.created_by && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "rgba(59,130,246,0.12)", borderRadius: 20, padding: "3px 9px", flexShrink: 0 }}>Admin</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)" }} onClick={() => setInviteOpen(false)} />
          <div style={{ position: "relative", background: "var(--surface-1)", borderRadius: 20, padding: "20px 0", width: "100%", maxWidth: 460, maxHeight: "70dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "0 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Invite people</span>
              <button onClick={() => setInviteOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-3)", borderRadius: 12, border: "1px solid var(--border-2)", padding: "9px 12px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="var(--text-3)" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"/></svg>
                <input placeholder="Search friends…" value={inviteSearch} onChange={e => setInviteSearch(e.target.value)} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 14, fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom)" }}>
              {filteredInviteFriends.length === 0 && (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13, fontWeight: 700 }}>
                  {inviteFriends.length === 0 ? "No friends to invite (all friends are already in this group)" : "No results"}
                </div>
              )}
              {filteredInviteFriends.map(f => {
                const alreadySent = sentInviteIds.has(f.id);
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px" }}>
                    <Avatar name={f.username} url={f.avatar_url} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-1)" }}>@{f.username}</div>
                    </div>
                    <button onClick={() => sendInvite(f.id)} disabled={alreadySent || sendingInviteId === f.id} style={{ padding: "7px 16px", borderRadius: 10, border: "none", fontWeight: 900, fontSize: 13, cursor: alreadySent || sendingInviteId === f.id ? "default" : "pointer", background: alreadySent ? "var(--surface-3)" : "#22c55e", color: alreadySent ? "var(--text-3)" : "#000", opacity: sendingInviteId === f.id ? 0.6 : 1 }}>
                      {sendingInviteId === f.id ? "…" : alreadySent ? "Invited" : "Invite"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "calc(12px + env(safe-area-inset-top))", paddingBottom: 12, paddingInline: 8, background: "var(--bottom-nav-bg)", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", borderBottom: "0.5px solid var(--border-2)", flexShrink: 0 }}>
        <button onClick={() => { setActiveGroup(null); setTab("groups"); loadGroupChats(); }} style={{ background: "none", border: "none", padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <svg width="10" height="17" viewBox="0 0 10 17" fill="none"><path d="M9 1.5L1.5 8.5L9 15.5" stroke="var(--text-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={openMembersModal} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, lineHeight: 0 }}>
          {(activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name])
            ? <img src={activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name]!} alt={activeGroup.team_name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", background: TEAM_COLORS[activeGroup.team_name] ?? "#1a1a1a" }} />
            : <div style={{ width: 38, height: 38, borderRadius: "50%", background: activeGroup.team_name === "General" ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "linear-gradient(135deg,#1a3d2e,#063d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{activeGroup.team_name === "General" ? "💬" : "🏉"}</div>
          }
        </button>
        <button onClick={openMembersModal} style={{ flex: 1, minWidth: 0, padding: "0 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeGroup.team_name}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>{activeGroup.member_count} member{activeGroup.member_count !== 1 ? "s" : ""}</div>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 4px" }}>
        {groupMessages.length === 0 && (
          <div style={{ padding: "80px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {(activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name])
              ? <img src={activeGroup.image_url || TEAM_LOGOS[activeGroup.team_name]!} alt={activeGroup.team_name} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", background: TEAM_COLORS[activeGroup.team_name] ?? "#1a1a1a" }} />
              : <div style={{ fontSize: 52 }}>{activeGroup.team_name === "General" ? "💬" : "🏉"}</div>
            }
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-1)" }}>{activeGroup.team_name}</div>
            {activeGroup.description && <div style={{ fontSize: 13.5, color: "var(--text-3)" }}>{activeGroup.description}</div>}
            <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 400 }}>{activeGroup.member_count} member{activeGroup.member_count !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 16, padding: "8px 18px", marginTop: 4 }}>Be the first to say something 👋</div>
          </div>
        )}
        {groupedGroup.map(g => (
          <div key={g.day}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--surface-3)" }} />
              <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>{g.day}</span>
              <div style={{ flex: 1, height: 1, background: "var(--surface-3)" }} />
            </div>
            {g.msgs.map((m, i) => {
              const mine = m.sender_id === myProfile.id;
              const samePrev = g.msgs[i - 1]?.sender_id === m.sender_id;
              const sameNext = g.msgs[i + 1]?.sender_id === m.sender_id;
              const r = 18, s = 5;
              const br = mine ? `${r}px ${samePrev ? s : r}px ${sameNext ? r : s}px ${r}px` : `${samePrev ? s : r}px ${r}px ${r}px ${sameNext ? r : s}px`;
              const sn = m.sender?.username ?? "unknown";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, paddingInline: 12, marginBottom: sameNext ? 2 : 8 }}>
                  {!mine && <div style={{ width: 28, flexShrink: 0 }}>{!sameNext && <button onClick={() => router.push(`/profile/${sn}`)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Avatar name={sn} url={m.sender?.avatar_url} size={28} /></button>}</div>}
                  <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    {!mine && !samePrev && <button onClick={() => router.push(`/profile/${sn}`)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 3, alignSelf: "flex-start" }}><span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>@{sn}</span></button>}
                    <div onClick={() => { if (!mine || m.id.startsWith("t")) return; setGroupSelectedMsgId(prev => prev === m.id ? null : m.id); }} role={mine && !m.id.startsWith("t") ? "button" : undefined} tabIndex={mine && !m.id.startsWith("t") ? 0 : undefined} onKeyDown={e => { if (mine && !m.id.startsWith("t") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setGroupSelectedMsgId(prev => prev === m.id ? null : m.id); } }} style={{ padding: "10px 14px", borderRadius: br, background: mine ? "#22c55e" : "var(--surface-2)", color: mine ? "#000" : "var(--text-1)", fontSize: 15, lineHeight: 1.5, wordBreak: "break-word", opacity: m.id.startsWith("t") || groupDeletingIds.has(m.id) ? 0.55 : 1, cursor: mine && !m.id.startsWith("t") ? "pointer" : "default" }}>{m.content}</div>
                    {mine && groupSelectedMsgId === m.id && !m.id.startsWith("t") && <div style={{ marginTop: 6, padding: 4, borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border-2)", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}><button onClick={e => { e.stopPropagation(); deleteGroupMessage(m); }} disabled={groupDeletingIds.has(m.id)} style={{ border: "none", background: "transparent", color: groupDeletingIds.has(m.id) ? "#64748b" : "#f87171", fontWeight: 700, fontSize: 13, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>Delete</button></div>}
                    {!sameNext && <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400, marginTop: 4, paddingInline: 4 }}>{fmtTime(m.created_at)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {groupSendError && <div style={{ padding: "8px 16px", background: "rgba(239,68,68,.12)", borderTop: "1px solid rgba(239,68,68,.25)", color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>⚠️ {groupSendError}</div>}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 12px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: "0.5px solid var(--border-1)", background: "var(--bg)", flexShrink: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "var(--surface-2)", borderRadius: 24, border: "1px solid var(--border-2)", padding: "2px 6px 2px 16px", minHeight: 44 }}>
          <input ref={groupInputRef} value={groupText} onChange={e => setGroupText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendGroupMessage(); } }} placeholder={`Message ${activeGroup.team_name}…`} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 15, fontFamily: "inherit", padding: "8px 0" }} />
          {groupText.trim() && (
            <button onClick={sendGroupMessage} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "#22c55e", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
    </main>
  );

  /* ═══════════ DM THREAD VIEW ═══════════ */
  if (activeConv) return (
    <main style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", justifyContent: "center", zIndex: 110 }}>
    <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", height: "100%", borderInline: "0.5px solid var(--border-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: "calc(12px + env(safe-area-inset-top))", paddingBottom: 12, paddingInline: 8, background: "var(--bottom-nav-bg)", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", borderBottom: "0.5px solid var(--border-2)", flexShrink: 0 }}>
        <button onClick={() => setActiveConv(null)} style={{ background: "none", border: "none", padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <svg width="10" height="17" viewBox="0 0 10 17" fill="none"><path d="M9 1.5L1.5 8.5L9 15.5" stroke="var(--text-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={() => router.push(`/profile/${activeConv.other?.username}`)} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, background: "none", border: "none", cursor: "pointer", padding: "0 4px", textAlign: "left", minWidth: 0 }}>
          <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={38} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeConv.other?.display_name || activeConv.other?.username}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>@{activeConv.other?.username}</div>
          </div>
        </button>
        <button onClick={() => router.push(`/profile/${activeConv.other?.username}`)} style={{ background: "none", border: "none", padding: "6px 10px", cursor: "pointer", color: "var(--text-2)", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 4px" }}>
        {messages.length === 0 && (
          <div style={{ padding: "80px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={80} />
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-1)" }}>{activeConv.other?.display_name || activeConv.other?.username}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 400 }}>@{activeConv.other?.username}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 16, padding: "8px 16px", marginTop: 4 }}>Send a message to start chatting 👋</div>
          </div>
        )}
        {grouped.map(g => (
          <div key={g.day}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--surface-3)" }} />
              <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>{g.day}</span>
              <div style={{ flex: 1, height: 1, background: "var(--surface-3)" }} />
            </div>
            {g.msgs.map((m, i) => {
              const mine = m.sender_id === myProfile.id;
              const samePrev = g.msgs[i - 1]?.sender_id === m.sender_id;
              const sameNext = g.msgs[i + 1]?.sender_id === m.sender_id;
              const r = 18, s = 5;
              const br = mine ? `${r}px ${samePrev ? s : r}px ${sameNext ? r : s}px ${r}px` : `${samePrev ? s : r}px ${r}px ${r}px ${sameNext ? r : s}px`;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, paddingInline: 12, marginBottom: sameNext ? 2 : 8 }}>
                  {!mine && <div style={{ width: 28, flexShrink: 0 }}>{!sameNext && <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={28} />}</div>}
                  <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    <div onClick={() => { if (!mine || m.id.startsWith("t")) return; setSelectedMsgId(prev => prev === m.id ? null : m.id); }} role={mine && !m.id.startsWith("t") ? "button" : undefined} tabIndex={mine && !m.id.startsWith("t") ? 0 : undefined} onKeyDown={e => { if (mine && !m.id.startsWith("t") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedMsgId(prev => prev === m.id ? null : m.id); } }} style={{ padding: "10px 14px", borderRadius: br, background: mine ? "#22c55e" : "var(--surface-2)", color: mine ? "#000" : "var(--text-1)", fontSize: 15, lineHeight: 1.5, wordBreak: "break-word", opacity: m.id.startsWith("t") || deletingIds.has(m.id) ? 0.55 : 1, cursor: mine && !m.id.startsWith("t") ? "pointer" : "default" }}>{m.content}</div>
                    {mine && selectedMsgId === m.id && !m.id.startsWith("t") && <div style={{ marginTop: 6, padding: 4, borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border-2)", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}><button onClick={e => { e.stopPropagation(); deleteMessage(m); }} disabled={deletingIds.has(m.id)} style={{ border: "none", background: "transparent", color: deletingIds.has(m.id) ? "#64748b" : "#f87171", fontWeight: 700, fontSize: 13, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>Delete</button></div>}
                    {!sameNext && <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 400, marginTop: 4, paddingInline: 4 }}>{fmtTime(m.created_at)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {sendError && <div style={{ padding: "8px 16px", background: "rgba(239,68,68,.12)", borderTop: "1px solid rgba(239,68,68,.25)", color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>⚠️ {sendError}</div>}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 12px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: "0.5px solid var(--border-1)", background: "var(--bg)", flexShrink: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "var(--surface-2)", borderRadius: 24, border: "1px solid var(--border-2)", padding: "2px 6px 2px 16px", minHeight: 44 }}>
          <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 15, fontFamily: "inherit", padding: "8px 0" }} />
          {text.trim() && (
            <button onClick={send} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "#22c55e", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
    </main>
  );

  /* ═══════════ INBOX VIEW ═══════════ */
  const hasConvos = filteredInbox.some(e => e.convId);
  const noConvoFriends = filteredInbox.filter(e => !e.convId);

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(80px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center" }} className="page-enter">
    <div style={{ width: "100%", maxWidth: 680, borderInline: "0.5px solid var(--border-2)", minHeight: "100dvh" }}>
      {/* ── Explore groups modal ── */}
      {discoverOpen && (() => {
        const officialGroups = discoverResults.filter(g => g.team_name === "General");
        const teamGroups     = discoverResults.filter(g => AFL_TEAM_NAMES.has(g.team_name));
        const otherGroups    = discoverResults.filter(g => g.team_name !== "General" && !AFL_TEAM_NAMES.has(g.team_name));
        const isSearching    = discoverSearch.trim().length > 0;
        const fmtCount = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1).replace(/\.0$/,"")}m` : n >= 1000 ? `${(n/1000).toFixed(1).replace(/\.0$/,"")}k` : String(n);

        // Avatar for a group — team logo image or emoji fallback
        const GroupAvatar = ({ group, size = 48 }: { group: GroupChat; size?: number }) => {
          const logo = group.image_url || TEAM_LOGOS[group.team_name];
          const color = TEAM_COLORS[group.team_name];
          if (logo) return <img src={logo} alt={group.team_name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", background: color ?? "#1a1a1a", flexShrink: 0 }} />;
          const isGeneral = group.team_name === "General";
          return (
            <div style={{ width: size, height: size, borderRadius: "50%", background: isGeneral ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "linear-gradient(135deg,#1a3d2e,#063d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.44, flexShrink: 0 }}>
              {isGeneral ? "💬" : "🏉"}
            </div>
          );
        };

        // Blue verified badge SVG (official foopy groups only — created_by IS NULL)
        const VerifiedBadge = ({ size = 14 }: { size?: number }) => (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l2.4 3.2L18 4.2l.8 3.8 3.8.8-1 3.6L24 15l-3.2 2.4.8 3.8-3.8-.8L15 24l-3-2.4L9 24l-2.8-3.6-3.8.8.8-3.8L0 15l2.4-3.4-1-3.6 3.8-.8L6 4.2l3.6 1L12 2z" fill="#3b82f6"/>
            <path d="M8 12.5l2.5 2.5 5.5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );

        // Grid card (browse view)
        const renderGridCard = (group: GroupChat) => {
          const isMember = myGroupIds.has(group.id);
          const isOfficial = group.created_by === null;
          return (
            <div key={group.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px 12px", background: "var(--surface-2)", borderRadius: 14, minWidth: 0 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <GroupAvatar group={group} size={52} />
                {isOfficial && <div style={{ position: "absolute", bottom: 0, right: 0, background: "var(--surface-2)", borderRadius: "50%", padding: 1, lineHeight: 0 }}><VerifiedBadge size={16} /></div>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)", textAlign: "center", lineHeight: 1.3, wordBreak: "break-word", paddingInline: 4 }}>{group.team_name}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 3 }}>
                {isMember && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                <span>{fmtCount(group.member_count)}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="var(--text-3)" strokeWidth="2"/><circle cx="9" cy="7" r="4" stroke="var(--text-3)" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              {isMember
                ? <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>Joined ✓</span>
                : <button onClick={() => joinChat(group.id)} disabled={joiningId === group.id} style={{ padding: "5px 16px", borderRadius: 20, background: "#22c55e", color: "#000", border: "none", fontWeight: 700, fontSize: 12, cursor: joiningId === group.id ? "default" : "pointer", opacity: joiningId === group.id ? 0.6 : 1 }}>{joiningId === group.id ? "…" : "Join"}</button>
              }
            </div>
          );
        };

        // List row (search results)
        const renderListRow = (group: GroupChat) => {
          const isMember = myGroupIds.has(group.id);
          const isOfficial = group.created_by === null;
          return (
            <div key={group.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 16px" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <GroupAvatar group={group} size={46} />
                {isOfficial && <div style={{ position: "absolute", bottom: 0, right: 0, background: "var(--surface-2)", borderRadius: "50%", padding: 1, lineHeight: 0 }}><VerifiedBadge size={15} /></div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>{group.team_name}</span>
                  {isOfficial && <VerifiedBadge size={15} />}
                </div>
                {group.description && <div style={{ fontSize: 12, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.description}</div>}
                <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 1 }}>{fmtCount(group.member_count)} members</div>
              </div>
              {isMember
                ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", padding: "6px 12px", background: "var(--surface-2)", borderRadius: 20 }}>Joined</span>
                : <button onClick={() => joinChat(group.id)} disabled={joiningId === group.id} style={{ padding: "6px 16px", borderRadius: 20, background: "#22c55e", color: "#000", border: "none", fontWeight: 700, fontSize: 13, cursor: joiningId === group.id ? "default" : "pointer", opacity: joiningId === group.id ? 0.6 : 1 }}>{joiningId === group.id ? "…" : "Join"}</button>
              }
            </div>
          );
        };

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)" }} onClick={() => { setDiscoverOpen(false); setDiscoverSearch(""); }} />
            <div style={{ position: "relative", background: "var(--surface-1)", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "82dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", flexShrink: 0, borderBottom: "0.5px solid var(--border-2)" }}>
                <button onClick={() => { setDiscoverOpen(false); setDiscoverSearch(""); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-2)", fontWeight: 600, fontSize: 15 }}>Cancel</button>
                <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>Explore groups</span>
                <span style={{ width: 52 }} />
              </div>

              {/* Search + Create */}
              <div style={{ padding: "12px 16px 10px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", borderRadius: 12, padding: "9px 13px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="var(--text-3)" strokeWidth="2.2"/><path d="m21 21-4.35-4.35" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round"/></svg>
                  <input placeholder="Search groups…" value={discoverSearch} onChange={e => setDiscoverSearch(e.target.value)} autoFocus style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 15, fontFamily: "inherit" }} />
                  {discoverSearch && <button onClick={() => setDiscoverSearch("")} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14 }}>✕</button>}
                </div>
                <button onClick={() => { setDiscoverOpen(false); setCreateOpen(true); setCreateError(""); }} style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "#22c55e", color: "#000", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  Create group
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {discoverError ? (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>Couldn't load groups.</div>
                    <button
                      onClick={() => { setDiscoverError(""); setDiscoverOpen(false); setTimeout(() => setDiscoverOpen(true), 50); }}
                      style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Retry
                    </button>
                  </div>
                ) : isSearching ? (
                  /* ── Search results list ── */
                  discoverLoading
                    ? <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading...</div>
                    : discoverResults.length === 0
                    ? <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No groups matched "{discoverSearch}"</div>
                    : discoverResults.map(g => renderListRow(g))
                ) : (
                  /* ── Categorised browse view ── */
                  <div style={{ padding: "4px 0 16px" }}>
                    {/* Official */}
                    {officialGroups.length > 0 && (
                      <div style={{ padding: "10px 16px 8px" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>Official</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                          {officialGroups.map(g => renderGridCard(g))}
                        </div>
                      </div>
                    )}
                    {/* AFL Teams */}
                    {teamGroups.length > 0 && (
                      <div style={{ padding: "10px 16px 8px" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>AFL Teams</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                          {teamGroups.map(g => renderGridCard(g))}
                        </div>
                      </div>
                    )}
                    {/* Other public groups */}
                    {otherGroups.length > 0 && (
                      <div style={{ padding: "10px 16px 8px" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>Community</span>
                        <div style={{ marginTop: 6 }}>{otherGroups.map(g => renderListRow(g))}</div>
                      </div>
                    )}
                    {discoverLoading && (
                      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading...</div>
                    )}
                    {!discoverLoading && discoverResults.length === 0 && (
                      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No public groups yet.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create group modal */}
      {createOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)" }} onClick={() => { setCreateOpen(false); setCreateError(""); setCreateImageDataUrl(null); }} />
          <div style={{ position: "relative", background: "var(--surface-1)", borderRadius: 20, padding: "24px 20px", width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 20 }}>Create group</span>
              <button onClick={() => { setCreateOpen(false); setCreateError(""); setCreateImageDataUrl(null); }} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
            </div>

            {/* Icon picker */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <input
                ref={createImageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const src = ev.target?.result as string;
                    const img = new Image();
                    img.onload = () => {
                      const SIZE = 200;
                      const canvas = document.createElement("canvas");
                      canvas.width = SIZE; canvas.height = SIZE;
                      const ctx = canvas.getContext("2d")!;
                      // crop to square then draw
                      const min = Math.min(img.width, img.height);
                      const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
                      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
                      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
                      setCreateImageDataUrl(dataUrl);
                    };
                    img.src = src;
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                onClick={() => createImageInputRef.current?.click()}
                style={{ position: "relative", width: 80, height: 80, borderRadius: "50%", border: "2px dashed rgba(255,255,255,.2)", background: createImageDataUrl ? "transparent" : "var(--surface-3)", cursor: "pointer", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {createImageDataUrl ? (
                  <img src={createImageDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                )}
                {/* Edit overlay */}
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", opacity: createImageDataUrl ? 0 : 0, transition: "opacity .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
                  </svg>
                </div>
              </button>
              <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
                {createImageDataUrl ? (
                  <button onClick={() => { setCreateImageDataUrl(null); if (createImageInputRef.current) createImageInputRef.current.value = ""; }} style={{ background: "none", border: "none", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Remove photo</button>
                ) : "Add group icon"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Group Name</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)} maxLength={60} placeholder="e.g. Footy Friday Squad" style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 12, padding: "12px 14px", color: "var(--text-1)", fontSize: 15, outline: "none", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Description <span style={{ fontWeight: 600, opacity: 0.6 }}>(optional)</span></label>
              <input value={createDesc} onChange={e => setCreateDesc(e.target.value)} maxLength={200} placeholder="What's this group about?" style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 12, padding: "12px 14px", color: "var(--text-1)", fontSize: 15, outline: "none", fontFamily: "inherit" }} />
            </div>

            <button onClick={() => setCreatePublic(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, background: "var(--surface-3)", border: "1px solid var(--border-2)", cursor: "pointer" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)", marginBottom: 2 }}>Public group</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Anyone can find and join via Discover</div>
              </div>
              <div style={{ width: 44, height: 26, borderRadius: 13, background: createPublic ? "#22c55e" : "var(--surface-4, #333)", transition: "background .2s", flexShrink: 0, position: "relative" }}>
                <div style={{ position: "absolute", top: 3, left: createPublic ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </div>
            </button>

            {createError && <div style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>{createError}</div>}

            <button onClick={createGroup} disabled={!createName.trim() || creating} style={{ padding: "16px", borderRadius: 14, background: createName.trim() && !creating ? "#22c55e" : "var(--surface-3)", color: createName.trim() && !creating ? "#000" : "var(--text-3)", fontWeight: 900, fontSize: 16, border: "none", cursor: createName.trim() && !creating ? "pointer" : "default" }}>
              {creating ? "Creating…" : "Create Group"}
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>
        {/* Sticky header */}
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--bottom-nav-bg)", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", borderBottom: "0.5px solid var(--border-2)", paddingTop: "env(safe-area-inset-top)" }}>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{myProfile.display_name || myProfile.username}</h1>
            {tab === "groups" ? (
              /* + button opens the discover/create sheet */
              <button onClick={() => setDiscoverOpen(true)} title="Create or join a group" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--text-1)", display: "flex", alignItems: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </button>
            ) : (
              /* Pencil/compose icon for DMs */
              <button onClick={() => { setTab("users"); setSearch(""); }} title="New message" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--text-1)", display: "flex", alignItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", borderRadius: 12, padding: "9px 13px", margin: "0 16px 10px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="var(--text-3)" strokeWidth="2.2"/><path d="m21 21-4.35-4.35" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round"/></svg>
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-1)", fontSize: 15, fontFamily: "inherit" }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14 }}>✕</button>}
          </div>

          {/* Users / Groups segmented control */}
          <div style={{ display: "flex", gap: 0, padding: "0 16px 12px" }}>
            <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 10, padding: 3, width: "100%" }}>
              {(["users", "groups"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: tab === t ? "var(--surface-4, #2a2a2a)" : "transparent", color: tab === t ? "var(--text-1)" : "var(--text-3)", transition: "background .15s, color .15s", position: "relative" }}>
                  {t === "users" ? "Users" : "Groups"}
                  {t === "groups" && pendingInvites.length > 0 && (
                    <span style={{ position: "absolute", top: 5, right: 16, width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <>
            {filteredInbox.length === 0 && (
              <div style={{ padding: "72px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{search ? "🔍" : "👥"}</div>
                <p style={{ fontWeight: 900, fontSize: 18, margin: "0 0 6px" }}>{search ? "No results" : "No friends yet"}</p>
                <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>{search ? `Nothing matched "${search}"` : "Add friends on your profile to start chatting."}</p>
                {!search && <button onClick={() => router.push("/profile")} style={{ padding: "12px 28px", borderRadius: 14, background: "#22c55e", color: "var(--text-1)", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Find Friends</button>}
              </div>
            )}
            {filteredInbox.filter(e => e.convId).map((entry, i, arr) => <InboxRow key={entry.id} entry={entry} myId={myProfile.id} isLast={i === arr.length - 1 && noConvoFriends.length === 0} onClick={() => openEntry(entry)} />)}
            {noConvoFriends.length > 0 && (
              <>
                {hasConvos && <div style={{ padding: "18px 20px 8px" }}><span style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)", letterSpacing: ".08em", textTransform: "uppercase" }}>Friends</span></div>}
                {noConvoFriends.map((entry, i) => <InboxRow key={entry.id} entry={entry} myId={myProfile.id} isLast={i === noConvoFriends.length - 1} onClick={() => openEntry(entry)} />)}
              </>
            )}
          </>
        )}

        {/* ── GROUPS TAB ── */}
        {tab === "groups" && (
          <>
            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div style={{ margin: "8px 16px", borderRadius: 14, border: "1px solid rgba(34,197,94,.2)", background: "rgba(34,197,94,.05)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px 6px", fontSize: 11, fontWeight: 900, color: "#22c55e", letterSpacing: ".08em", textTransform: "uppercase" }}>Group Invites</div>
                {pendingInvites.map((inv, i) => (
                  <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i > 0 ? "1px solid rgba(34,197,94,.1)" : "none" }}>
                    {TEAM_LOGOS[inv.group_name]
                      ? <img src={TEAM_LOGOS[inv.group_name]} alt={inv.group_name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", background: TEAM_COLORS[inv.group_name] ?? "#1a1a1a", flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: "50%", background: inv.group_name === "General" ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "linear-gradient(135deg,#1a3d2e,#063d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{inv.group_name === "General" ? "💬" : "🏉"}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.group_name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>from @{inv.inviter_username}</div>
                    </div>
                    <button onClick={() => respondInvite(inv, "accept")} disabled={respondingId === inv.id} style={{ padding: "6px 14px", borderRadius: 20, background: "#22c55e", color: "#000", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: respondingId === inv.id ? 0.6 : 1 }}>
                      {respondingId === inv.id ? "…" : "Accept"}
                    </button>
                    <button onClick={() => respondInvite(inv, "decline")} disabled={respondingId === inv.id} style={{ padding: "6px 14px", borderRadius: 20, background: "var(--surface-3)", color: "var(--text-3)", border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", opacity: respondingId === inv.id ? 0.6 : 1 }}>
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Group list */}
            {filteredGroups.length === 0 && pendingInvites.length === 0 && (
              <div style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{search ? "🔍" : "🏉"}</div>
                <p style={{ fontWeight: 900, fontSize: 18, margin: "0 0 6px" }}>{search ? "No results" : "No group chats yet"}</p>
                <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>{search ? `Nothing matched "${search}"` : "Create your own or get a team pass to join a team chat."}</p>
              </div>
            )}
            {filteredGroups.map((group, i) => (
              <GroupRow key={group.id} group={group} isLast={i === filteredGroups.length - 1} onClick={() => openGroup(group)} />
            ))}
          </>
        )}
      </div>
    </div>
    </main>
  );
}

/* ── Inbox row ── */
function InboxRow({ entry, myId, isLast, onClick }: { entry: InboxEntry; myId: string; isLast: boolean; onClick: () => void }) {
  const username = entry.other?.username ?? "?";
  const displayName = entry.other?.display_name || entry.other?.username || "?";
  const hasUnread = entry.unread > 0;
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "10px 16px", background: "none", cursor: "pointer", textAlign: "left", border: "none", color: "var(--text-1)" }}>
      {/* Story-ring avatar */}
      <div style={{ flexShrink: 0, padding: hasUnread ? 2.5 : 0, borderRadius: "50%", background: hasUnread ? "#22c55e" : "transparent", transition: "background .2s" }}>
        <div style={{ padding: hasUnread ? 2 : 0, borderRadius: "50%", background: hasUnread ? "var(--bg)" : "transparent" }}>
          <Avatar name={username} url={entry.other?.avatar_url} size={54} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <span style={{ fontWeight: hasUnread ? 700 : 600, fontSize: 15, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
          {entry.last_at && <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400, flexShrink: 0, marginLeft: 8 }}>{ago(entry.last_at)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: hasUnread ? "var(--text-2)" : "var(--text-3)", fontWeight: hasUnread ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {entry.convId ? (entry.preview || "Tap to say hi 👋") : <span style={{ fontStyle: "italic" }}>Say hi 👋</span>}
          </span>
          {hasUnread && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
        </div>
      </div>
    </button>
  );
}

/* ── Group row ── */
function GroupRow({ group, isLast, onClick }: { group: GroupChat; isLast: boolean; onClick: () => void }) {
  const hasUnread = group.unread > 0;
  const logo = group.image_url || TEAM_LOGOS[group.team_name];
  const color = TEAM_COLORS[group.team_name];
  const isGeneral = group.team_name === "General";
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "10px 16px", background: "none", cursor: "pointer", textAlign: "left", border: "none", color: "var(--text-1)" }}>
      <div style={{ flexShrink: 0, padding: hasUnread ? 2.5 : 0, borderRadius: "50%", background: hasUnread ? "#22c55e" : "transparent", transition: "background .2s" }}>
        <div style={{ padding: hasUnread ? 2 : 0, borderRadius: "50%", background: hasUnread ? "var(--bg)" : "transparent" }}>
          {logo
            ? <img src={logo} alt={group.team_name} style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", background: color ?? "#1a1a1a", display: "block" }} />
            : <div style={{ width: 54, height: 54, borderRadius: "50%", background: isGeneral ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "linear-gradient(135deg,#1a3d2e,#063d22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{isGeneral ? "💬" : "🏉"}</div>
          }
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <span style={{ fontWeight: hasUnread ? 700 : 600, fontSize: 15, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.team_name}{!group.is_public && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".06em", verticalAlign: "middle" }}>Private</span>}
          </span>
          {group.last_message && <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400, flexShrink: 0, marginLeft: 8 }}>{ago(group.last_message.created_at)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: hasUnread ? "var(--text-2)" : "var(--text-3)", fontWeight: hasUnread ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {group.last_message ? (group.last_message.content.length > 50 ? group.last_message.content.slice(0, 50) + "…" : group.last_message.content) : <span style={{ fontStyle: "italic" }}>{group.member_count} member{group.member_count !== 1 ? "s" : ""}</span>}
          </span>
          {hasUnread && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
        </div>
      </div>
    </button>
  );
}
