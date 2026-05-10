"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  // Load comments + liked state
  const loadComments = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("feed_comments")
      .select(`
        id, game_id, user_id, parent_id, body, likes, created_at,
        profile:profiles(id, username, display_name, avatar_url)
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

    // Build tree: top-level + replies
    const all: Comment[] = (rows as unknown[]).map((r: unknown) => {
      const row = r as Comment & { profile: Profile | Profile[] };
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { ...row, profile, liked: likedIds.has(row.id), replies: [] };
    });

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
    const { error } = await supabase.from("feed_comments").insert({
      game_id: gameId,
      user_id: userId,
      parent_id: replyTo?.id ?? null,
      body: body.trim(),
      event_key: eventKey ?? null,
    });
    if (!error) {
      setBody("");
      setReplyTo(null);
      await loadComments();
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
    }

    await loadComments();
    setLiking(prev => { const s = new Set(prev); s.delete(comment.id); return s; });
  }

  async function handleDelete(commentId: string) {
    await supabase.from("feed_comments").delete().eq("id", commentId);
    await loadComments();
  }

  function startReply(comment: Comment) {
    setReplyTo(comment);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

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
            <div style={centreStyle}>
              <div style={spinnerStyle} />
            </div>
          ) : comments.length === 0 ? (
            <div style={emptyStyle}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>No comments yet</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Be the first to comment!</div>
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
                liking={liking}
              />
            ))
          )}
        </div>

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
                  <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                    Replying to <span style={{ color: "#60a5fa" }}>
                      {replyTo.profile?.display_name || replyTo.profile?.username || "user"}
                    </span>
                  </span>
                  <button onClick={() => setReplyTo(null)} style={cancelReplyBtnStyle}>✕</button>
                </div>
              )}
              <div style={inputRowStyle}>
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
                  <SendIcon />
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

function CommentRow({
  comment,
  userId,
  onLike,
  onDelete,
  onReply,
  liking,
  isReply = false,
}: {
  comment: Comment;
  userId: string | null;
  onLike: (c: Comment) => void;
  onDelete: (id: string) => void;
  onReply: (c: Comment) => void;
  liking: Set<string>;
  isReply?: boolean;
}) {
  const name = comment.profile?.display_name || comment.profile?.username || "User";
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiked = comment.liked;
  const isLiking = liking.has(comment.id);

  const time = new Date(comment.created_at).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div style={{ ...commentRowStyle, paddingLeft: isReply ? 48 : 16 }}>
      {/* Avatar */}
      <div style={avatarStyle}>
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          : <span style={avatarInitialStyle}>{name[0]?.toUpperCase()}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + time */}
        <div style={commentMetaStyle}>
          <span style={commentNameStyle}>{name}</span>
          <span style={commentTimeStyle}>{time}</span>
        </div>

        {/* Body */}
        <p style={commentBodyStyle}>{comment.body}</p>

        {/* Actions */}
        <div style={commentActionsStyle}>
          {/* Like */}
          <button
            onClick={() => onLike(comment)}
            disabled={!userId || isLiking}
            style={{
              ...actionBtnStyle,
              color: isLiked ? "#f43f5e" : "#64748b",
              opacity: isLiking ? 0.5 : 1,
            }}
          >
            <HeartIcon filled={!!isLiked} />
            {comment.likes > 0 && <span style={{ marginLeft: 4 }}>{comment.likes}</span>}
          </button>

          {/* Reply (only on top-level) */}
          {!isReply && userId && (
            <button onClick={() => onReply(comment)} style={{ ...actionBtnStyle, color: "#64748b" }}>
              Reply
            </button>
          )}

          {/* Delete */}
          {isOwn && (
            <button onClick={() => onDelete(comment.id)} style={{ ...actionBtnStyle, color: "#ef4444" }}>
              Delete
            </button>
          )}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {comment.replies.map(r => (
              <CommentRow
                key={r.id}
                comment={r}
                userId={userId}
                onLike={onLike}
                onDelete={onDelete}
                onReply={onReply}
                liking={liking}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Icons ── */

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "#f43f5e" : "none"} stroke={filled ? "#f43f5e" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
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
  width: "100%",
  maxHeight: "85dvh",
  background: "#0a0a0a",
  borderRadius: "20px 20px 0 0",
  border: "1px solid rgba(255,255,255,0.1)",
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
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  flexShrink: 0,
};

const headerTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#f8fafc",
  letterSpacing: "-0.02em",
};

const headerSubStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  flex: 1,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#64748b",
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

const spinnerStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: "2px solid rgba(255,255,255,0.1)",
  borderTop: "2px solid #60a5fa",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
};

const emptyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "40px 20px",
  color: "#94a3b8",
  textAlign: "center",
};

const commentRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "12px 16px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

const avatarStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "#1e293b",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const avatarInitialStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#60a5fa",
};

const commentMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const commentNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#f1f5f9",
};

const commentTimeStyle: CSSProperties = {
  fontSize: 11,
  color: "#475569",
  fontWeight: 600,
};

const commentBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#e2e8f0",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const commentActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginTop: 8,
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

const inputAreaStyle: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.08)",
  padding: "12px 16px",
  paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
  flexShrink: 0,
  background: "#080808",
};

const signInBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 14,
  background: "#3b82f6",
  color: "#fff",
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
  color: "#64748b",
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
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#f8fafc",
  fontSize: 14,
  padding: "10px 14px",
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
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};
