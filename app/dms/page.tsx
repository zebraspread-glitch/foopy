"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";
import { useXP } from "@/app/context/XPContext";

/* ── Types ── */
type Profile = { id: string; username: string; display_name: string; avatar_url?: string | null };
type InboxEntry = {
  id: string;           // other user's id (used as key)
  other: Profile;
  convId: string | null; // null = friend but no convo yet
  preview: string;
  last_at: string | null;
  unread: number;
};
type Msg = { id: string; sender_id: string; content: string; created_at: string; conversation_id?: string };

/* ── Avatar palette ── */
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

/* ── Time helpers ── */
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
  if (url) return (
    <img src={url} alt={name}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: bg, color: fg, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: Math.round(size * 0.38), fontWeight: 900,
    }}>
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ── Sign-in gate ── */
function SignInGate() {
  const router = useRouter();
  return (
    <main style={{ minHeight: "100dvh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px calc(90px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 340, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#111", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>💬</div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 950, color: "#fff", margin: "0 0 6px" }}>Sign in to message</h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.6 }}>Create a Foopy account to DM other users.</p>
        </div>
        <button onClick={() => router.push("/login")} style={{ display: "block", width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", fontWeight: 900, fontSize: 16, border: "none", cursor: "pointer", boxShadow: "0 4px 20px rgba(59,130,246,0.4)" }}>Sign In</button>
        <button onClick={() => router.push("/login")} style={{ display: "block", width: "100%", padding: "15px", borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "#94a3b8", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Create Account</button>
      </div>
    </main>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function DMsPage() {
  const router = useRouter();
  const { awardXP } = useXP();
  const [user,      setUser]      = useState<User | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [ready,     setReady]     = useState(false);
  const [inbox,     setInbox]     = useState<InboxEntry[]>([]);
  const [search,    setSearch]    = useState("");

  /* thread state */
  const [activeConv, setActiveConv] = useState<InboxEntry | null>(null);
  const [messages,   setMessages]   = useState<Msg[]>([]);
  const [text,       setText]       = useState("");
  const [sendError,  setSendError]  = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  /* ── Auth ── */
  useEffect(() => {
    // Safety net: never hang on the loading screen longer than 6 seconds
    const fallback = setTimeout(() => setReady(true), 6000);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", u.id).single();
          setMyProfile(data ?? null);
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(fallback); setReady(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        try {
          const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", u.id).single();
          setMyProfile(data ?? null);
        } catch {}
      } else {
        setMyProfile(null);
      }
    });
    return () => { clearTimeout(fallback); subscription.unsubscribe(); };
  }, []);

  /* ── Load inbox (friends + conversations merged) ── */
  const loadInbox = useCallback(async () => {
    if (!myProfile) return;

    const [friendsRes, convosRes] = await Promise.all([
      supabase.from("friendships")
        .select("requester_id,addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${myProfile.id},addressee_id.eq.${myProfile.id}`),
      supabase.from("dm_conversations")
        .select("*")
        .or(`participant_a.eq.${myProfile.id},participant_b.eq.${myProfile.id}`)
        .order("last_message_at", { ascending: false }),
    ]);

    const friendIds = (friendsRes.data ?? []).map(r =>
      r.requester_id === myProfile.id ? r.addressee_id : r.requester_id
    );
    const convos = convosRes.data ?? [];
    const convoOtherIds = convos.map(r =>
      r.participant_a === myProfile.id ? r.participant_b : r.participant_a
    );

    const allIds = [...new Set([...friendIds, ...convoOtherIds])];
    if (!allIds.length) { setInbox([]); return; }

    const [profilesRes, unreadRes] = await Promise.all([
      supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", allIds),
      convos.length
        ? supabase.from("dm_messages")
            .select("conversation_id")
            .in("conversation_id", convos.map(r => r.id))
            .neq("sender_id", myProfile.id)
            .is("read_at", null)
        : Promise.resolve({ data: [] }),
    ]);

    const pm: Record<string, Profile> = Object.fromEntries(
      (profilesRes.data ?? []).map((p: any) => [p.id, p])
    );
    const um: Record<string, number> = {};
    (unreadRes.data ?? []).forEach((m: any) => {
      um[m.conversation_id] = (um[m.conversation_id] ?? 0) + 1;
    });

    // Build from conversations first (sorted by recency)
    const entries: InboxEntry[] = convos.map(r => {
      const oid = r.participant_a === myProfile.id ? r.participant_b : r.participant_a;
      return {
        id: oid, other: pm[oid],
        convId: r.id,
        preview: r.last_message_preview ?? "",
        last_at: r.last_message_at,
        unread: um[r.id] ?? 0,
      };
    }).filter(e => e.other); // guard against deleted profiles

    // Append friends who don't have a convo yet
    const seenIds = new Set(entries.map(e => e.id));
    for (const fid of friendIds) {
      if (!seenIds.has(fid) && pm[fid]) {
        entries.push({ id: fid, other: pm[fid], convId: null, preview: "", last_at: null, unread: 0 });
      }
    }

    setInbox(entries);
  }, [myProfile]);

  useEffect(() => {
    if (!myProfile) return;
    loadInbox();
    const ch = supabase.channel("dmi_" + myProfile.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_conversations" }, loadInbox)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myProfile, loadInbox]);

  /* ── Open conversation ── */
  async function openEntry(entry: InboxEntry) {
    // Open thread immediately — no waiting for DB, so clicks always respond
    setActiveConv(entry);
    setMessages([]);
    setSelectedMsgId(null);

    if (!entry.convId || !myProfile) return;

    const { data } = await supabase.from("dm_messages").select("*")
      .eq("conversation_id", entry.convId).order("created_at", { ascending: true });
    setMessages(data ?? []);

    await supabase.from("dm_messages").update({ read_at: new Date().toISOString() })
      .eq("conversation_id", entry.convId).neq("sender_id", myProfile.id).is("read_at", null);

    loadInbox();
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  /* ── Realtime messages ── */
  // Only depend on the IDs — not the full objects — so the subscription
  // doesn't tear down every time activeConv.convId is set after first send.
  const activeConvId = activeConv?.convId ?? null;
  const myProfileId  = myProfile?.id ?? null;

  useEffect(() => {
    if (!activeConvId || !myProfileId) return;

    // Realtime subscription (fires instantly when the other person sends)
    const ch = supabase.channel("dmc_" + activeConvId)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "dm_messages",
        filter: `conversation_id=eq.${activeConvId}`,
      }, payload => {
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new as Msg]);
        if (payload.new.sender_id !== myProfileId)
          supabase.from("dm_messages").update({ read_at: new Date().toISOString() }).eq("id", payload.new.id);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "dm_messages",
        filter: `conversation_id=eq.${activeConvId}`,
      }, payload => {
        const deletedId = (payload.old as Msg).id;
        setMessages(prev => prev.filter(m => m.id !== deletedId));
        setSelectedMsgId(prev => prev === deletedId ? null : prev);
      })
      .subscribe();

    // Polling fallback — catches any messages the realtime sub missed
    // (e.g. if REPLICA IDENTITY FULL isn't set in Supabase, the filter silently fails)
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("dm_messages")
        .select("*")
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: true });
      if (!data) return;
      setMessages(prev => {
        const stillSending = prev.filter(m => m.id.startsWith("t"));
        const prevIds = prev.filter(m => !m.id.startsWith("t")).map(m => m.id).join("|");
        const nextIds = data.map(m => m.id).join("|");
        if (prevIds === nextIds) return prev;
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
        return [...data, ...stillSending];
      });
    }, 3000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [activeConvId, myProfileId]);

  /* ── Send message ── */
  async function send() {
    if (!text.trim() || !activeConv || !myProfile) return;
    const content = text.trim(); setText(""); setSendError("");

    // Resolve or create the conversation row on first send
    let convId = activeConv.convId;
    if (!convId) {
      const [pA, pB] = [myProfile.id, activeConv.other.id].sort();
      // Check both orderings in case a row already exists
      const { data: existing } = await supabase.from("dm_conversations")
        .select("id")
        .or(`and(participant_a.eq.${pA},participant_b.eq.${pB}),and(participant_a.eq.${pB},participant_b.eq.${pA})`)
        .maybeSingle();
      if (existing) {
        convId = existing.id;
      } else {
        const { data: created } = await supabase.from("dm_conversations")
          .insert({ participant_a: pA, participant_b: pB }).select("id").single();
        convId = created?.id ?? null;
      }
      if (convId) {
        // Persist the resolved convId into state so realtime sub wires up
        setActiveConv(prev => prev ? { ...prev, convId } : prev);
      }
    }

    if (!convId) { setText(content); setSendError("Could not create conversation — check Supabase permissions."); return; }

    const tempId = `t${Date.now()}`;
    const temp: Msg = { id: tempId, sender_id: myProfile.id, content, created_at: new Date().toISOString() };
    setMessages(p => [...p, temp]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);

    const { data: msg, error: msgErr } = await supabase.from("dm_messages")
      .insert({ conversation_id: convId, sender_id: myProfile.id, content })
      .select().single();

    if (msgErr || !msg) {
      setMessages(p => p.filter(m => m.id !== tempId));
      setText(content);
      setSendError(msgErr?.message ?? "Failed to send — check Supabase permissions.");
      inputRef.current?.focus();
      return;
    }

    setMessages(p => p.map(m => m.id === tempId ? msg : m));
    await supabase.from("dm_conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.length > 60 ? content.slice(0, 60) + "…" : content,
    }).eq("id", convId);
    awardXP("send_message");
    loadInbox();
    inputRef.current?.focus();
  }

  async function syncConversationPreview(convId: string, nextMessages: Msg[]) {
    const latest = nextMessages[nextMessages.length - 1] ?? null;
    await supabase.from("dm_conversations").update({
      last_message_at: latest?.created_at ?? null,
      last_message_preview: latest
        ? latest.content.length > 60 ? latest.content.slice(0, 60) + "..." : latest.content
        : "",
    }).eq("id", convId);
    loadInbox();
  }

  async function deleteMessage(message: Msg) {
    if (!myProfile || message.sender_id !== myProfile.id || message.id.startsWith("t")) return;
    const convId = activeConv?.convId ?? message.conversation_id;
    if (!convId) return;
    if (!confirm("Delete this message?")) return;

    const before = messages;
    const next = before.filter(m => m.id !== message.id);
    setSendError("");
    setSelectedMsgId(null);
    setDeletingIds(prev => new Set(prev).add(message.id));
    setMessages(next);

    const { error } = await supabase
      .from("dm_messages")
      .delete()
      .eq("id", message.id)
      .eq("sender_id", myProfile.id);

    setDeletingIds(prev => {
      const copy = new Set(prev);
      copy.delete(message.id);
      return copy;
    });

    if (error) {
      setMessages(before);
      setSelectedMsgId(message.id);
      setSendError(error.message || "Could not delete message.");
      return;
    }

    await syncConversationPreview(convId, next);
  }

  /* ── Group messages by day ── */
  const grouped: { day: string; msgs: Msg[] }[] = [];
  messages.forEach(m => {
    const d = fmtDay(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.day === d) last.msgs.push(m); else grouped.push({ day: d, msgs: [m] });
  });

  const filteredInbox = inbox.filter(e =>
    !search ||
    e.other?.username?.toLowerCase().includes(search.toLowerCase()) ||
    e.other?.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Guards ── */
  if (!ready) return (
    <div style={{ minHeight: "100dvh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="spinner" />
    </div>
  );
  if (!user)  return <SignInGate />;
  if (!myProfile?.username) return (
    <main style={{ minHeight: "100dvh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 24px calc(90px + env(safe-area-inset-bottom))" }}>
      <div style={{ textAlign: "center", color: "#64748b" }}>
        <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Set up your profile first</p>
        <a href="/profile" style={{ color: "#22c55e", fontWeight: 800 }}>Go to Profile →</a>
      </div>
    </main>
  );

  /* ═══════════════════ THREAD VIEW ═══════════════════ */
  if (activeConv) return (
    <main style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", zIndex: 110 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: "calc(14px + env(safe-area-inset-top))", paddingBottom: "14px", paddingLeft: "16px", paddingRight: "16px", background: "rgba(0,0,0,0.92)", backdropFilter: "blur(28px) saturate(200%)", WebkitBackdropFilter: "blur(28px) saturate(200%)", borderBottom: "0.5px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
        <button onClick={() => setActiveConv(null)} style={{ background: "none", border: "none", padding: "4px 8px 4px 0", cursor: "pointer", display: "flex", alignItems: "center" }}>
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none">
            <path d="M9.5 1.5L1.5 9.5L9.5 17.5" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button onClick={() => router.push(`/profile/${activeConv.other?.username}`)}
          style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", minWidth: 0 }}>
          <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={42} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              @{activeConv.other?.username}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>tap to view profile</div>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {messages.length === 0 && (
          <div style={{ padding: "80px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={72} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#fff", marginBottom: 4 }}>@{activeConv.other?.username}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#475569", fontWeight: 700, background: "#111", borderRadius: 12, padding: "8px 16px" }}>
              Start the conversation 👋
            </div>
          </div>
        )}

        {grouped.map(g => (
          <div key={g.day}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
              <span style={{ fontSize: 11, color: "#475569", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>{g.day}</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
            </div>
            {g.msgs.map((m, i) => {
              const mine = m.sender_id === myProfile.id;
              const samePrev = g.msgs[i - 1]?.sender_id === m.sender_id;
              const sameNext = g.msgs[i + 1]?.sender_id === m.sender_id;
              const r = 18, s = 5;
              const br = mine
                ? `${r}px ${samePrev ? s : r}px ${sameNext ? r : s}px ${r}px`
                : `${samePrev ? s : r}px ${r}px ${r}px ${sameNext ? r : s}px`;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, paddingInline: 14, marginBottom: sameNext ? 2 : 10 }}>
                  {!mine && <div style={{ width: 28, flexShrink: 0 }}>{!sameNext && <Avatar name={activeConv.other?.username ?? "?"} url={activeConv.other?.avatar_url} size={28} />}</div>}
                  <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                      <div
                        onClick={() => {
                          if (!mine || m.id.startsWith("t")) return;
                          setSelectedMsgId(prev => prev === m.id ? null : m.id);
                        }}
                        role={mine && !m.id.startsWith("t") ? "button" : undefined}
                        tabIndex={mine && !m.id.startsWith("t") ? 0 : undefined}
                        onKeyDown={e => {
                          if (!mine || m.id.startsWith("t")) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedMsgId(prev => prev === m.id ? null : m.id);
                          }
                        }}
                        style={{ padding: "9px 13px", borderRadius: br, background: mine ? "#22c55e" : "#1c1c1e", border: mine ? "none" : "1px solid rgba(255,255,255,.07)", color: "#fff", fontSize: 15, lineHeight: 1.45, wordBreak: "break-word", opacity: m.id.startsWith("t") || deletingIds.has(m.id) ? 0.6 : 1, cursor: mine && !m.id.startsWith("t") ? "pointer" : "default", outline: selectedMsgId === m.id ? "2px solid rgba(255,255,255,.18)" : "none", outlineOffset: 2 }}
                      >
                        {m.content}
                      </div>
                    </div>
                    {mine && selectedMsgId === m.id && !m.id.startsWith("t") && (
                      <div style={{ marginTop: 6, padding: 4, borderRadius: 12, background: "#111", border: "1px solid rgba(255,255,255,.09)", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
                        <button
                          onClick={e => { e.stopPropagation(); deleteMessage(m); }}
                          disabled={deletingIds.has(m.id)}
                          style={{ border: "none", background: "transparent", color: deletingIds.has(m.id) ? "#64748b" : "#f87171", fontWeight: 900, fontSize: 13, padding: "7px 10px", cursor: deletingIds.has(m.id) ? "default" : "pointer", fontFamily: "inherit" }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                    {!sameNext && <span style={{ fontSize: 11, color: "#475569", fontWeight: 700, marginTop: 4, paddingInline: 4 }}>{fmtTime(m.created_at)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* Send error */}
      {sendError && (
        <div style={{ padding: "8px 16px", background: "rgba(239,68,68,.12)", borderTop: "1px solid rgba(239,68,68,.25)", color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>
          ⚠️ {sendError}
        </div>
      )}

      {/* Composer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,.07)", background: "#000", flexShrink: 0 }}>
        <input
          ref={inputRef} value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message…"
          style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,.1)", borderRadius: 24, padding: "11px 18px", color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={send} disabled={!text.trim()} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", flexShrink: 0, cursor: text.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", background: text.trim() ? "#22c55e" : "#1a1a1a" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke={text.trim() ? "#fff" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={text.trim() ? "#fff" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </main>
  );

  /* ═══════════════════ INBOX VIEW ═══════════════════ */
  const hasConvos = filteredInbox.some(e => e.convId);
  const noConvoFriends = filteredInbox.filter(e => !e.convId);

  return (
  <main style={{ minHeight: "100dvh", background: "#000", color: "#fff", paddingBottom: "calc(90px + env(safe-area-inset-bottom))" }} className="page-enter">
    <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>

      {/* Sticky header */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(28px) saturate(200%)",
        WebkitBackdropFilter: "blur(28px) saturate(200%)",
        borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        paddingTop: "env(safe-area-inset-top)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 0 58px" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em" }}>Messages</h1>
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", borderRadius: 14, border: "1px solid rgba(255,255,255,.08)", padding: "10px 14px", margin: "12px 20px 12px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#475569" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="#475569" strokeWidth="2" strokeLinecap="round"/></svg>
          <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 15, fontFamily: "inherit" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>}
        </div>
      </div>

      {/* Empty state */}
      {filteredInbox.length === 0 && (
        <div style={{ padding: "72px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
            {search ? "🔍" : "👥"}
          </div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 18, margin: "0 0 6px" }}>
              {search ? "No results" : "No friends yet"}
            </p>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
              {search ? `Nothing matched "${search}"` : "Add friends on your profile to start chatting."}
            </p>
            {!search && (
              <button onClick={() => router.push("/profile")}
                style={{ padding: "12px 28px", borderRadius: 14, background: "#22c55e", color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Find Friends
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversation rows */}
      {filteredInbox.filter(e => e.convId).length > 0 && (
        <div>
          {filteredInbox.filter(e => e.convId).map((entry, i, arr) => (
            <InboxRow
              key={entry.id}
              entry={entry}
              myId={myProfile.id}
              isLast={i === arr.length - 1 && noConvoFriends.length === 0}
              onClick={() => openEntry(entry)}
            />
          ))}
        </div>
      )}

      {/* Friends without conversations */}
      {noConvoFriends.length > 0 && (
        <div>
          {hasConvos && (
            <div style={{ padding: "18px 20px 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: "#475569", letterSpacing: ".08em", textTransform: "uppercase" }}>Friends</span>
            </div>
          )}
          {noConvoFriends.map((entry, i) => (
            <InboxRow
              key={entry.id}
              entry={entry}
              myId={myProfile.id}
              isLast={i === noConvoFriends.length - 1}
              onClick={() => openEntry(entry)}
            />
          ))}
        </div>
      )}
    </div>
</main>
  );
}

/* ── Inbox row ── */
function InboxRow({ entry, myId, isLast, onClick }: {
  entry: InboxEntry; myId: string; isLast: boolean; onClick: () => void;
}) {
  const name = entry.other?.username ?? "?";
  const hasConvo = !!entry.convId;

  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 14,
      padding: "13px 20px", background: "none", cursor: "pointer",
      textAlign: "left", border: "none", color: "#fff",
      borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,.05)",
    }}>
      {/* Avatar with unread dot */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={name} url={entry.other?.avatar_url} size={54} />
        {entry.unread > 0 && (
          <div style={{ position: "absolute", top: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: "#22c55e", border: "2px solid #000" }} />
        )}
      </div>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontWeight: entry.unread > 0 ? 900 : 800, fontSize: 16, color: "#fff" }}>
            @{name}
          </span>
          {entry.last_at && (
            <span style={{ fontSize: 12, color: entry.unread > 0 ? "#22c55e" : "#475569", fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
              {ago(entry.last_at)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 14, lineHeight: 1.4,
            color: entry.unread > 0 ? "#cbd5e1" : "#64748b",
            fontWeight: entry.unread > 0 ? 600 : 400,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}>
            {hasConvo
              ? (entry.preview || "Tap to say hi 👋")
              : <span style={{ color: "#334155", fontStyle: "italic" }}>Say hi 👋</span>
            }
          </span>
          {entry.unread > 0 && (
            <span style={{ background: "#22c55e", color: "#000", borderRadius: 99, fontSize: 11, fontWeight: 900, padding: "2px 7px", flexShrink: 0, minWidth: 20, textAlign: "center" }}>
              {entry.unread > 99 ? "99+" : entry.unread}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ flexShrink: 0, opacity: 0.15 }}>
        <path d="M1 1.5l5 5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
