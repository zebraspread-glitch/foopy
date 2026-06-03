"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { NOTIF_LAST_SEEN_KEY } from "@/app/components/TopBar";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";

/* ── Types ── */
type NotifType =
  | "like_comment"
  | "reply_comment"
  | "mention_comment"
  | "friend_request"
  | "friend_accepted"
  | "poll_win"
  | "level_up"
  | "trade_offer"
  | "trade_accepted"
  | "trade_declined";

type Actor = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
};

type Notification = {
  id: string;
  type: NotifType;
  actor_id: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
  actor?: Actor | null;
};

/* ── Helpers ── */
function relTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function notifContent(n: Notification): { icon: React.ReactNode; text: string; sub?: string } {
  const name = n.actor?.display_name || n.actor?.username || "Someone";
  const body = n.data?.comment_body as string | undefined;
  const level = n.data?.level as number | undefined;
  const pollTitle = n.data?.poll_title as string | undefined;

  switch (n.type) {
    case "like_comment":
      return {
        icon: <HeartIcon />,
        text: `${name} liked your comment`,
        sub: body ? `"${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"` : undefined,
      };
    case "reply_comment":
      return {
        icon: <ReplyIcon />,
        text: `${name} replied to your comment`,
        sub: body ? `"${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"` : undefined,
      };
    case "mention_comment":
      return {
        icon: <MentionIcon />,
        text: `${name} mentioned you in a comment`,
        sub: body ? `"${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"` : undefined,
      };
    case "friend_request":
      return {
        icon: <PersonAddIcon />,
        text: `${name} sent you a friend request`,
      };
    case "friend_accepted":
      return {
        icon: <PersonCheckIcon />,
        text: `${name} accepted your friend request`,
      };
    case "poll_win":
      return {
        icon: <TrophyIcon />,
        text: `You won a poll!`,
        sub: pollTitle ? `"${pollTitle}"` : undefined,
      };
    case "level_up":
      return {
        icon: <StarIcon />,
        text: `You reached Level ${level ?? "?"}!`,
        sub: "Keep earning XP to unlock more rewards",
      };
    case "trade_offer":
      return {
        icon: <TradeIcon />,
        text: `${name} sent you a trade offer`,
      };
    case "trade_accepted":
      return {
        icon: <TradeIcon />,
        text: `${name} accepted your trade offer`,
      };
    case "trade_declined":
      return {
        icon: <TradeIcon />,
        text: `${name} declined your trade offer`,
      };
    default:
      return { icon: <BellIcon />, text: "New notification" };
  }
}

function iconColor(type: NotifType): string {
  switch (type) {
    case "like_comment":      return "#ef4444";
    case "reply_comment":     return "#3b82f6";
    case "mention_comment":   return "#06b6d4";
    case "friend_request":    return "#8b5cf6";
    case "friend_accepted": return "#22c55e";
    case "poll_win":        return "#f59e0b";
    case "level_up":        return "#ffd700";
    case "trade_offer":     return "#a78bfa";
    case "trade_accepted":  return "#4ade80";
    case "trade_declined":  return "#f87171";
    default:                return "#64748b";
  }
}

/* ── SVG Icons ── */
function MentionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function ReplyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
function PersonAddIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
function PersonCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 17 16 21" />
      <line x1="12" y1="17" x2="12" y2="11" />
      <path d="M7 4H4a2 2 0 0 0-2 2v3c0 3.31 2.69 6 6 6 0 0 0 0 0 0" />
      <path d="M17 4h3a2 2 0 0 1 2 2v3c0 3.31-2.69 6-6 6 0 0 0 0 0 0" />
      <rect x="7" y="2" width="10" height="9" rx="2" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
    </svg>
  );
}

/* ── Main Page ── */
export default function NotificationsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("notifications")
      .select("id, type, actor_id, data, read, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(60);

    if (!rows) { setLoading(false); return; }

    // Load actors
    const actorIds = [...new Set(rows.map((r: { actor_id: string | null }) => r.actor_id).filter(Boolean))] as string[];
    const actorMap = new Map<string, Actor>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, verified")
        .in("id", actorIds);
      for (const p of profiles ?? []) actorMap.set(p.id, p as Actor);
    }

    setNotifs(rows.map((r: Notification) => ({
      ...r,
      actor: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    let uid: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Use INITIAL_SESSION to avoid the getSession() race condition that would
    // briefly show "Sign in" even when the user is logged in.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION") return; // only care about the first definitive check

      uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }

      load(uid);

      // Mark the badge as seen and all rows as read
      localStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString());
      supabase.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);

      // Realtime — reload whenever a new notification arrives
      channel = supabase
        .channel(`notifs-page-${uid}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          () => load(uid!)
        )
        .subscribe();
    });

    return () => { subscription.unsubscribe(); channel?.unsubscribe(); };
  }, [load]);

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const clearAll = async () => {
    if (!userId) return;
    await supabase.from("notifications").delete().eq("user_id", userId);
    setNotifs([]);
  };

  const displayed = filter === "unread" ? notifs.filter(n => !n.read) : notifs;
  const unreadCount = notifs.filter(n => !n.read).length;

  if (!userId && !loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
        <BellIcon />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700 }}>Sign in to see notifications</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", background: "var(--bg)", minHeight: "100dvh", borderLeft: "1px solid var(--border-1)", borderRight: "1px solid var(--border-1)" }}>

        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bottom-nav-bg)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid var(--border-1)", padding: "calc(16px + env(safe-area-inset-top)) 18px 12px 58px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 0, display: "flex" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)" }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 800, background: "#ef4444", color: "var(--text-1)", borderRadius: 999, padding: "2px 7px", minWidth: 20, textAlign: "center" }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {notifs.length > 0 && (
              <button onClick={clearAll} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px" }}>
                Clear all
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {(["all", "unread"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                  background: filter === f ? "var(--text-1)" : "var(--border-1)",
                  color: filter === f ? "var(--bg)" : "var(--text-3)",
                  transition: "all 0.15s",
                }}
              >
                {f === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
            <div className="spinner" />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 24px", color: "var(--text-3)", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "var(--text-4)" }}>
              <BellIcon />
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)", marginBottom: 6 }}>
              {filter === "unread" ? "All caught up!" : "No notifications yet"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-4)" }}>
              {filter === "unread" ? "You've read everything" : "We'll let you know when something happens"}
            </div>
          </div>
        ) : (
          <div>
            {displayed.map((n, i) => {
              const { icon, text, sub } = notifContent(n);
              const color = iconColor(n.type);
              const actorName = n.actor?.display_name || n.actor?.username || "Someone";

              function handleClick() {
                markRead(n.id);
                const gameId = n.data?.game_id;
                const eventKey = n.data?.event_key;
                const commentId = n.data?.comment_id as string | undefined;

                if ((n.type === "like_comment" || n.type === "reply_comment" || n.type === "mention_comment") && gameId) {
                  if (eventKey) {
                    // Event comment page
                    router.push(`/match/${gameId}/${eventKey}${commentId ? `#c-${commentId}` : ""}`);
                  } else {
                    // Match chat — go to match with chat tab + anchor
                    router.push(`/match/${gameId}?tab=chat${commentId ? `#c-${commentId}` : ""}`);
                  }
                } else if (n.type === "friend_request" || n.type === "friend_accepted") {
                  if (n.actor?.username) router.push(`/profile/${n.actor.username}`);
                } else if (n.type === "level_up") {
                  router.push("/profile");
                }
              }

              return (
                <div
                  key={n.id}
                  onClick={handleClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 16px",
                    borderBottom: i < displayed.length - 1 ? "1px solid var(--border-1)" : "none",
                    background: n.read ? "transparent" : "rgba(59,130,246,0.05)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Avatar */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {n.actor?.avatar_url ? (
                      <img src={n.actor.avatar_url} alt={actorName}
                        style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "var(--text-2)" }}>{actorName[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    {/* Type icon pip */}
                    <div style={{
                      position: "absolute", bottom: -2, right: -2,
                      width: 20, height: 20, borderRadius: "50%",
                      background: "var(--surface-1)", border: "2px solid var(--bg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      overflow: "hidden", color,
                    }}>
                      <div style={{ width: 12, height: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
                    </div>
                  </div>

                  {/* Text block */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.4, color: n.read ? "#94a3b8" : "#f1f5f9" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: n.read ? "#94a3b8" : "#fff" }}>{actorName}{n.actor?.verified && <VerifiedBadge size={12} />}</span>
                      {" "}
                      <span style={{ fontWeight: n.read ? 400 : 500 }}>
                        {text.replace(actorName, "").trimStart()}
                      </span>
                    </div>
                    {sub && (
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 600, marginTop: 3 }}>
                      {relTime(n.created_at)}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
