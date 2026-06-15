"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";
import { useRouter } from "next/navigation";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
import { nameColorStyle } from "@/app/lib/cosmetics";
import CommentText from "@/app/components/CommentText";
import StickerPicker from "@/app/components/StickerPicker";
import MiniAvatar from "@/app/components/MiniAvatar";
import SendArrowIcon from "@/app/components/SendArrowIcon";
import { CommentSkeleton } from "@/app/components/Skeleton";
import { ReportBlockSheet, type ReportBlockTarget } from "@/app/components/ReportBlockMenu";
import { getHiddenUserIds, blocksChanged } from "@/app/lib/blocks";

type Profile = {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  verified?: boolean;
  name_color?: string | null;
};

type Comment = {
  id: string;
  game_id: number;
  user_id: string;
  parent_id: string | null;
  body: string;
  likes: number;
  created_at: string;
  profile?: Profile;
  liked?: boolean;
  replies?: Comment[];
};

type Props = {
  gameId: number;
  gameLabel: string;
  eventKey?: string;
  onClose: () => void;
};

export default function CommentSheet({ gameId, gameLabel, eventKey, onClose }: Props) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState<Set<string>>(new Set());
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      setAuthToken(data.session?.access_token ?? null);
      if (uid) {
        supabase.from("profiles").select("username, display_name, avatar_url").eq("id", uid).maybeSingle()
          .then(({ data: p }) => {
            if (p) { setMyAvatar(p.avatar_url ?? null); setMyName(p.display_name || p.username || ""); }
          });
      }
    });
  }, []);

  // Load comments + liked state
  const loadComments = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("feed_comments")
      .select(`
        id, game_id, user_id, parent_id, body, likes, created_at,
        profile:profiles(id, username, display_name, avatar_url, verified, name_color)
      `)
      .eq("game_id", gameId);

    if (eventKey) {
      q = q.eq("event_key", eventKey);
    } else {
      q = q.is("event_key", null);
    }

    const { data: rows, error } = await q
      .order("likes", { ascending: false })
      .order("created_at", { ascending: true });

    if (error || !rows) { setLoading(false); return; }

    let likedIds = new Set<string>();
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (uid) {
      const { data: likes } = await supabase
        .from("feed_comment_likes")
        .select("comment_id")
        .eq("user_id", uid);
      likedIds = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
    }

    // Hide comments from blocked users (and users who blocked me).
    const hidden = await getHiddenUserIds();

    // Build tree: top-level + replies
    const all: Comment[] = (rows as unknown[])
      .map((r: unknown) => {
        const row = r as Comment & { profile: Profile | Profile[] };
        const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
        return { ...row, profile, liked: likedIds.has(row.id), replies: [] };
      })
      .filter((c) => !hidden.has(c.user_id));

    const topLevel: Comment[] = [];
    const byId: Record<string, Comment> = {};
    for (const c of all) { byId[c.id] = c; }
    for (const c of all) {
      if (c.parent_id && byId[c.parent_id]) {
        byId[c.parent_id].replies!.push(c);
      } else {
        topLevel.push(c);
      }
    }

    setComments(topLevel);
    setLoading(false);
  }, [gameId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Re-filter when the user blocks/unblocks someone.
  useEffect(() => blocksChanged.subscribe(() => loadComments()), [loadComments]);

  const [reportTarget, setReportTarget] = useState<ReportBlockTarget | null>(null);

  // Prevent body scroll while sheet open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  async function handleSubmit() {
    if (!body.trim() || !userId || submitting) return;
    setSubmitting(true);
    const { data: inserted, error } = await supabase.from("feed_comments").insert({
      game_id: gameId,
      user_id: userId,
      parent_id: replyTo?.id ?? null,
      body: body.trim(),
      event_key: eventKey ?? null,
    }).select("id").single();
    if (!error && inserted) {
      setBody("");
      setReplyTo(null);
      await loadComments();
      if (authToken) {
        fetch("/api/aura/award", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ event_type: "comment_post", related_id: inserted.id }),
        }).then(r => r.json()).then(d => { if (d.awarded) auraToastEmitter.emit(5, "posting a comment"); }).catch(() => {});
      }
    }
    setSubmitting(false);
  }

  async function handleLike(comment: Comment) {
    if (!userId || liking.has(comment.id)) return;
    setLiking(prev => new Set(prev).add(comment.id));

    if (comment.liked) {
      await supabase.from("feed_comment_likes")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", userId);
    } else {
      await supabase.from("feed_comment_likes")
        .insert({ comment_id: comment.id, user_id: userId });

      if (authToken) {
        fetch("/api/aura/award", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ event_type: "like_given", related_id: comment.id }),
        }).then(r => r.json()).then(d => { if (d.awarded) auraToastEmitter.emit(1, "liking a comment"); }).catch(() => {});
        if (comment.user_id !== userId) {
          fetch("/api/aura/award", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ event_type: "like_received", related_id: comment.id, recipient_id: comment.user_id }),
          }).catch(() => {});
        }
      }
    }

    await loadComments();
    setLiking(prev => { const s = new Set(prev); s.delete(comment.id); return s; });
  }

  async function handleDelete(commentId: string) {
    await supabase.from("feed_comments").delete().eq("id", commentId);
    await loadComments();
  }

  function insertSticker(name: string) {
    setBody(prev => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}:${name} `);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startReply(comment: Comment) {
    setReplyThreadId(null);
    setReplyTo(comment);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function openReport(comment: Comment) {
    setReportTarget({
      userId: comment.user_id,
      username: comment.profile?.username,
      displayName: comment.profile?.display_name,
      targetType: "comment",
      targetId: comment.id,
      context: String(gameId),
    });
  }

  const replyThread = useMemo(
    () => (replyThreadId ? findFeedCommentById(comments, replyThreadId) : null),
    [comments, replyThreadId]
  );

  return (
    <div style={backdropStyle} onClick={handleBackdropClick}>
      <div ref={sheetRef} style={sheetStyle}>
        {/* Handle */}
        <div style={handleStyle} />

        {/* Header */}
        <div style={headerStyle}>
          <span style={headerTitleStyle}>Comments</span>
          <span style={headerSubStyle}>{gameLabel}</span>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        {/* Comments list */}
        <div style={listStyle}>
          {loading ? (
            <CommentSkeleton count={5} />
          ) : comments.length === 0 ? (
            <div style={emptyStyle}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>No comments yet</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>Be the first to comment!</div>
            </div>
          ) : (
            comments.map(c => (
              <CommentRow
                key={c.id}
                comment={c}
                userId={userId}
                onLike={handleLike}
                onDelete={handleDelete}
                onReply={startReply}
                onViewReplies={(comment) => setReplyThreadId(comment.id)}
                onReport={openReport}
                liking={liking}
              />
            ))
          )}
        </div>

        {replyThread && (
          <FeedRepliesPopup
            comment={replyThread}
            userId={userId}
            onClose={() => setReplyThreadId(null)}
            onLike={handleLike}
            onDelete={handleDelete}
            onReply={startReply}
            onViewReplies={(comment) => setReplyThreadId(comment.id)}
            onReport={openReport}
            liking={liking}
          />
        )}

        <ReportBlockSheet
          open={!!reportTarget}
          onClose={() => setReportTarget(null)}
          target={reportTarget ?? { userId: "" }}
        />

        {/* Input area */}
        <div style={inputAreaStyle}>
          {!userId ? (
            <button
              onClick={() => router.push("/login")}
              style={signInBtnStyle}
            >
              Sign in to comment
            </button>
          ) : (
            <>
              {replyTo && (
                <div style={replyBannerStyle}>
                  <span style={{ color: "var(--text-2)", fontSize: 12, fontWeight: 700 }}>
                    Replying to <span style={{ color: "#60a5fa" }}>
                      {replyTo.profile?.display_name || replyTo.profile?.username || "user"}
                    </span>
                  </span>
                  <button onClick={() => setReplyTo(null)} style={cancelReplyBtnStyle}>✕</button>
                </div>
              )}
              <StickerPicker onPick={insertSticker} />
              <div style={inputRowStyle}>
                <MiniAvatar name={myName} url={myAvatar} size={38} />
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                  }}
                  placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
                  rows={1}
                  style={textareaStyle}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!body.trim() || submitting}
                  style={{
                    ...sendBtnStyle,
                    opacity: !body.trim() || submitting ? 0.4 : 1,
                  }}
                >
                  <SendArrowIcon />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Comment Row ── */

function feedRelTime(dateString: string) {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateString).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function CommentRow({
  comment,
  userId,
  onLike,
  onDelete,
  onReply,
  onViewReplies,
  onReport,
  liking,
  isReply = false,
}: {
  comment: Comment;
  userId: string | null;
  onLike: (c: Comment) => void;
  onDelete: (id: string) => void;
  onReply: (c: Comment) => void;
  onViewReplies: (c: Comment) => void;
  onReport: (c: Comment) => void;
  liking: Set<string>;
  isReply?: boolean;
}) {
  const name = comment.profile?.display_name || comment.profile?.username || "User";
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiked = comment.liked;
  const isLiking = liking.has(comment.id);
  const time = feedRelTime(comment.created_at);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: isReply ? "10px 16px 8px 48px" : "12px 16px 8px" }}>
      {/* Avatar */}
      <div style={avatarStyle}>
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          : <span style={avatarInitialStyle}>{name[0]?.toUpperCase()}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", columnGap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {/* Username + badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
            <span style={{ ...commentNameStyle, ...nameColorStyle(comment.profile?.name_color) }}>{name}</span>
            {comment.profile?.verified && <VerifiedBadge size={13} />}
          </div>
          {/* Body */}
          <CommentText text={comment.body} style={commentBodyStyle} />
          {/* Actions: time · reply · delete */}
          <div style={commentActionsStyle}>
            <span style={commentTimeStyle}>{time}</span>
            {userId && (
              <button onClick={() => onReply(comment)} style={{ ...actionBtnStyle, color: "var(--text-3)" }}>
                Reply
              </button>
            )}
            {isOwn && (
              <button onClick={() => onDelete(comment.id)} style={{ ...actionBtnStyle, color: "#ef4444" }}>
                Delete
              </button>
            )}
            {userId && !isOwn && (
              <button onClick={() => onReport(comment)} style={{ ...actionBtnStyle, color: "var(--text-3)" }}>
                Report
              </button>
            )}
          </div>
          {/* Replies toggle */}
          {comment.replies && comment.replies.length > 0 && (
            <button onClick={() => onViewReplies(comment)} style={viewRepliesBtnStyle}>
              View {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>

        {/* Like — right column TikTok-style */}
        <button
          onClick={() => onLike(comment)}
          disabled={!userId || isLiking}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", padding: "2px 0 0", cursor: userId ? "pointer" : "default", color: isLiked ? "#f43f5e" : "var(--text-3)", opacity: isLiking ? 0.5 : 1, minWidth: 28 }}
        >
          <HeartIcon filled={!!isLiked} />
          {comment.likes > 0 && <span style={{ fontSize: 11, fontWeight: 800 }}>{comment.likes}</span>}
        </button>
      </div>
    </div>
  );
}

function FeedRepliesPopup({ comment, userId, onClose, onLike, onDelete, onReply, onViewReplies, onReport, liking }: {
  comment: Comment; userId: string | null; onClose: () => void;
  onLike: (c: Comment) => void; onDelete: (id: string) => void; onReply: (c: Comment) => void;
  onViewReplies: (c: Comment) => void; onReport: (c: Comment) => void; liking: Set<string>;
}) {
  const replyCount = comment.replies?.length ?? 0;
  return (
    <div style={replyModalBackdropStyle} onClick={onClose}>
      <section style={replyModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={replyModalHeaderStyle}>
          <div>
            <div style={replyModalTitleStyle}>Replies</div>
            <div style={replyModalSubStyle}>{replyCount} {replyCount === 1 ? "reply" : "replies"}</div>
          </div>
          <button onClick={onClose} style={replyModalCloseStyle}>×</button>
        </div>
        <div style={replyModalParentStyle}>
          <CommentRow comment={comment} userId={userId} onLike={onLike} onDelete={onDelete} onReply={onReply} onViewReplies={onViewReplies} onReport={onReport} liking={liking} />
        </div>
        <div style={replyModalRepliesStyle}>
          {replyCount === 0 ? (
            <div style={replyModalEmptyStyle}>No replies yet.</div>
          ) : (
            comment.replies!.map((reply) => (
              <CommentRow key={reply.id} comment={reply} userId={userId} onLike={onLike} onDelete={onDelete} onReply={onReply} onViewReplies={onViewReplies} onReport={onReport} liking={liking} isReply />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function findFeedCommentById(comments: Comment[], id: string): Comment | null {
  for (const comment of comments) {
    if (comment.id === id) return comment;
    const found = findFeedCommentById(comment.replies ?? [], id);
    if (found) return found;
  }
  return null;
}

/* ── Icons ── */

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "#f43f5e" : "none"} stroke={filled ? "#f43f5e" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/* ── Styles ── */

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "flex-end",
};

const sheetStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxHeight: "85dvh",
  background: "var(--bg)",
  borderRadius: "20px 20px 0 0",
  border: "1px solid var(--border-2)",
  borderBottom: "none",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const handleStyle: CSSProperties = {
  width: 36,
  height: 4,
  borderRadius: 999,
  background: "rgba(255,255,255,0.2)",
  margin: "12px auto 0",
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px 12px",
  borderBottom: "1px solid var(--border-1)",
  flexShrink: 0,
};

const headerTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "var(--text-1)",
  letterSpacing: "-0.02em",
};

const headerSubStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-3)",
  flex: 1,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 16,
  cursor: "pointer",
  padding: "2px 4px",
  lineHeight: 1,
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const centreStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "40px 0",
};


const emptyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "40px 20px",
  color: "var(--text-2)",
  textAlign: "center",
};

const avatarStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#1e293b",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const avatarInitialStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#60a5fa",
};

const commentNameStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  color: "var(--text-1)",
  lineHeight: 1,
};

const commentTimeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-3)",
  fontWeight: 600,
};

const commentBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--text-1)",
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const commentActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginTop: 6,
};

const actionBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const viewRepliesBtnStyle: CSSProperties = {
  marginTop: 8,
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const replyModalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 210,
  background: "rgba(0,0,0,0.72)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const replyModalStyle: CSSProperties = {
  width: "100%",
  maxHeight: "85dvh",
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderBottom: "none",
  borderRadius: "20px 20px 0 0",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const replyModalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid var(--border-2)",
};

const replyModalTitleStyle: CSSProperties = { color: "var(--text-1)", fontSize: 16, fontWeight: 1000 };
const replyModalSubStyle: CSSProperties = { marginTop: 2, color: "var(--text-3)", fontSize: 12, fontWeight: 800 };

const replyModalCloseStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "1px solid var(--border-2)",
  background: "var(--surface-3)",
  color: "var(--text-1)",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
};

const replyModalParentStyle: CSSProperties = {
  padding: "4px 0 10px",
  borderBottom: "1px solid var(--border-2)",
};

const replyModalRepliesStyle: CSSProperties = {
  overflowY: "auto",
  padding: "8px 0 14px",
};

const replyModalEmptyStyle: CSSProperties = {
  padding: "22px 16px",
  color: "var(--text-3)",
  fontSize: 13,
  fontWeight: 800,
  textAlign: "center",
};

const inputAreaStyle: CSSProperties = {
  borderTop: "1px solid var(--border-2)",
  padding: "12px 16px",
  paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
  flexShrink: 0,
  background: "var(--bg)",
};

const signInBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 14,
  background: "#3b82f6",
  color: "var(--text-1)",
  fontWeight: 800,
  fontSize: 15,
  border: "none",
  cursor: "pointer",
};

const replyBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
  padding: "6px 10px",
  background: "rgba(59,130,246,0.1)",
  borderRadius: 8,
  border: "1px solid rgba(59,130,246,0.2)",
};

const cancelReplyBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 13,
  cursor: "pointer",
  padding: "0 2px",
};

const inputRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  background: "var(--surface-3)",
  border: "1px solid var(--border-2)",
  borderRadius: 999,
  color: "var(--text-1)",
  fontSize: 14,
  padding: "10px 16px",
  resize: "none",
  outline: "none",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const sendBtnStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: "50%",
  background: "#3b82f6",
  border: "none",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};
