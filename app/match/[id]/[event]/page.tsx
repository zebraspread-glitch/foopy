"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { createNotification, notifyMentions } from "@/app/lib/notifications";
import MentionTextarea from "@/app/components/MentionTextarea";
import playerStatsJson from "@/app/data/players.json";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/match/[id]/utils";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type DbComment = {
  id: string;
  game_id: number;
  user_id: string;
  parent_id: string | null;
  body: string;
  likes?: number | null;
  created_at: string;
  event_key: string | null;
};

type Comment = {
  id: string;
  game_id: number;
  user_id: string;
  parent_id: string | null;
  body: string;
  likes: number;
  created_at: string;
  event_key: string | null;
  profile?: Profile | null;
  liked: boolean;
  replies: Comment[];
};

type PlayerRecord = { name?: string; player?: string; club?: string; team?: string; image?: string; imagePath?: string; playerImage?: string; apiSportsId?: number; eventIds?: number[] };

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function playerSlug(s: string) { return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""); }

function mixColor(a: string, b: string, t: number) {
  const ah = a.replace("#", ""), bh = b.replace("#", "");
  const r = Math.round(parseInt(ah.slice(0,2),16) + t*(parseInt(bh.slice(0,2),16)-parseInt(ah.slice(0,2),16)));
  const g = Math.round(parseInt(ah.slice(2,4),16) + t*(parseInt(bh.slice(2,4),16)-parseInt(ah.slice(2,4),16)));
  const bl = Math.round(parseInt(ah.slice(4,6),16) + t*(parseInt(bh.slice(4,6),16)-parseInt(ah.slice(4,6),16)));
  return `rgb(${r},${g},${bl})`;
}

function foopyColor(value: number) {
  const v = Math.max(1, Math.min(10, value));
  if (v >= 10) return "linear-gradient(135deg, #ffd700, #ff8c00)";
  const anchors: [number, string][] = [
    [1,   "#ef4444"],
    [2,   "#ef4444"],
    [3,   "#f97316"],
    [4,   "#facc15"],
    [5,   "#84cc16"],
    [6,   "#22c55e"],
    [7,   "#16a34a"],
    [8,   "#166534"],
    [9,   "#3b82f6"],
    [9.9, "#1e3a8a"],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [lo, colorLo] = anchors[i];
    const [hi, colorHi] = anchors[i + 1];
    if (v <= hi) return mixColor(colorLo, colorHi, (v - lo) / (hi - lo));
  }
  return mixColor("#3b82f6", "#1e3a8a", (v - 9) / 0.9);
}

const CLUB_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows", Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues", Collingwood: "magpies", Essendon: "bombers", Fremantle: "dockers",
  Geelong: "cats", "Geelong Cats": "cats", "Gold Coast": "suns", GWS: "giants", "GWS Giants": "giants",
  Hawthorn: "hawks", Melbourne: "demons", "North Melbourne": "kangaroos", "Port Adelaide": "power",
  Richmond: "tigers", "St Kilda": "saints", Sydney: "swans", "West Coast": "eagles", "Western Bulldogs": "bulldogs",
};

function resolvePlayerImage(name: string, team: string) {
  const found = (playerStatsJson as PlayerRecord[]).find(
    p => slugify(p.name ?? p.player ?? "") === slugify(name)
  );
  const club = found?.club ?? found?.team ?? team;
  const folder = CLUB_FOLDER[club] ?? slugify(club);
  const img = found?.image ?? found?.imagePath ?? found?.playerImage ?? `${slugify(name)}.png`;
  if (!folder || !img) return "";
  if (String(img).startsWith("/")) return String(img);
  return `/players/${folder}/${img}`;
}

export default function EventCommentsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const gameId = Number(params?.id ?? 0);
  const eventKey = String(params?.event ?? "");
  const highlight = searchParams.get("highlight");

  const [resolvedPlayerName, setResolvedPlayerName] = useState<string | null>(null);
  const [fetchedStats, setFetchedStats] = useState<{ rating: string; gb: string; d: string; k: string; h: string; m: string; t: string; ho: string } | null>(null);

  // Resolve label: use URL param if provided, otherwise derive from event key (local lookup),
  // or fall back to resolvedPlayerName fetched async from the play-by-play API.
  const labelFromParams = useMemo(() => {
    const param = searchParams.get("label");
    if (param) return param;
    const players = playerStatsJson as PlayerRecord[];
    if (eventKey.startsWith("player_")) {
      const slug = eventKey.slice(7);
      const found = players.find(p => slugify(p.name ?? p.player ?? "") === slugify(slug));
      return found ? (found.name ?? found.player ?? null) : null;
    }
    const idMatch = eventKey.match(/_p([^_]+)$/);
    if (idMatch) {
      const target = Number(idMatch[1]);
      const found = players.find(p => Array.isArray(p.eventIds) && p.eventIds.map(Number).includes(target));
      if (found) {
        const name = found.name ?? found.player ?? "";
        const typeMatch = eventKey.match(/_t([^_]+)_p/);
        const eventType = typeMatch ? typeMatch[1].toUpperCase() : "";
        return eventType ? `${name} · ${eventType}` : name;
      }
    }
    return null;
  }, [eventKey, searchParams]);

  // If label not in URL params and not in players.json, fetch from play-by-play API
  useEffect(() => {
    if (labelFromParams || eventKey.startsWith("player_") || !gameId) return;
    const idMatch = eventKey.match(/_p([^_]+)$/);
    if (!idMatch) return;
    const playerId = Number(idMatch[1]);
    const typeMatch = eventKey.match(/_t([^_]+)_p/);
    const eventType = typeMatch ? typeMatch[1].toUpperCase() : "";
    const apiId = (API_SPORTS_MATCH_IDS as Record<string, string>)[String(gameId)] ?? String(gameId);
    fetch(`/api/afl/play-by-play?id=${apiId}`)
      .then(r => r.json())
      .then(data => {
        const match = (data.events ?? []).find((e: any) => Number(e.playerId) === playerId);
        if (match?.playerName) {
          setResolvedPlayerName(eventType ? `${match.playerName} · ${eventType}` : match.playerName);
        }
      })
      .catch(() => {});
  }, [gameId, eventKey, labelFromParams]);

  const label = labelFromParams ?? resolvedPlayerName ?? "Event";

  const [userId, setUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sort, setSort] = useState<"live" | "top">("live");
  const [cooldown, setCooldown] = useState(0);
  const [commentsSent, setCommentsSent] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const eventParts = useMemo(() => {
    // Try URL params first (richer data), fall back to parsing the event key
    const qParam = searchParams.get("quarter");
    const mParam = searchParams.get("minute");
    const tParam = searchParams.get("type");
    if (qParam || tParam) {
      return { quarter: qParam ?? "?", minute: mParam ?? "?", type: (tParam ?? "event").toUpperCase() };
    }
    const match = eventKey.match(/^q(.+?)_m(.+?)_t(.+?)_p/);
    if (!match) return null;
    return { quarter: match[1], minute: match[2], type: match[3].toUpperCase() };
  }, [eventKey, searchParams]);

  const isPlayerComment = eventKey.startsWith("player_");

  const playerCard = useMemo(() => {
    if (!isPlayerComment) return null;
    const players = playerStatsJson as PlayerRecord[];
    const slug = eventKey.slice(7);
    const found = players.find(p => slugify(p.name ?? p.player ?? "") === slugify(slug));
    const team = searchParams.get("team") || found?.club || found?.team || "";
    const rating = searchParams.get("rating") || fetchedStats?.rating || "";
    const gb = searchParams.get("gb") || fetchedStats?.gb || "";
    const d = searchParams.get("d") || fetchedStats?.d || "";
    const k = searchParams.get("k") || fetchedStats?.k || "";
    const h = searchParams.get("h") || fetchedStats?.h || "";
    const m = searchParams.get("m") || fetchedStats?.m || "";
    const t = searchParams.get("t") || fetchedStats?.t || "";
    const ho = searchParams.get("ho") || fetchedStats?.ho || "";
    const img = resolvePlayerImage(label, team);
    return { team, rating, gb, d, k, h, m, t, ho, img };
  }, [isPlayerComment, eventKey, label, searchParams, fetchedStats]);

  // Fetch player stats when navigating to a player_ event without rating in URL params
  useEffect(() => {
    if (!isPlayerComment || !gameId) return;
    if (searchParams.get("rating")) return;
    const apiId = (API_SPORTS_MATCH_IDS as Record<string, string>)[String(gameId)] ?? String(gameId);
    fetch(`/api/afl/player-stats?id=${apiId}`)
      .then(r => r.json())
      .then(data => {
        const playerName = label !== "Event" ? label : null;
        if (!playerName) return;
        const allPlayers: any[] = [];
        for (const team of data?.response ?? []) {
          for (const p of team?.players ?? []) allPlayers.push(p);
        }
        const slug = slugify(playerName);
        const found = allPlayers.find((p: any) => slugify(p.player?.name ?? p.name ?? "") === slug);
        if (!found) return;
        const raw = found.statistics ?? found;
        const goals = raw.goals?.total ?? raw.goals ?? 0;
        const goalAssists = raw.goals?.assists ?? raw.goalAssists ?? 0;
        const behinds = raw.behinds ?? 0;
        const disposals = raw.disposals ?? 0;
        const kicks = raw.kicks ?? 0;
        const handballs = raw.handballs ?? 0;
        const marks = raw.marks ?? 0;
        const tackles = raw.tackles ?? 0;
        const hitouts = raw.hitouts ?? 0;
        const clearances = raw.clearances ?? 0;
        const freesFor = raw.free_kicks?.for ?? raw.freesFor ?? 0;
        const freesAgainst = raw.free_kicks?.against ?? raw.freesAgainst ?? 0;
        const rating = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor, freesAgainst } as any);
        setFetchedStats({
          rating: rating > 0 ? String(rating) : "",
          gb: `${goals}.${behinds}`,
          d: String(disposals),
          k: String(kicks),
          h: String(handballs),
          m: String(marks),
          t: String(tackles),
          ho: String(hitouts),
        });
      })
      .catch(() => {});
  }, [isPlayerComment, gameId, label, searchParams]);

  // For regular event comments — parse player name from label ("Jack Gunston · BEHIND")
  const eventCard = useMemo(() => {
    if (isPlayerComment || !eventParts) return null;
    const players = playerStatsJson as PlayerRecord[];
    const idMatch = eventKey.match(/_p([^_]+)$/);
    const target = idMatch ? Number(idMatch[1]) : null;
    const found = target != null ? players.find(p => Array.isArray(p.eventIds) && p.eventIds.map(Number).includes(target)) : null;
    const team = searchParams.get("team") || found?.club || found?.team || "";
    // Player name is everything before the " · " separator
    const playerName = label.includes(" · ") ? label.split(" · ")[0].trim() : label;
    const img = playerName ? resolvePlayerImage(playerName, team) : "";
    return { playerName, team, img };
  }, [isPlayerComment, eventParts, label, searchParams]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadComments = useCallback(async (currentSort: "live" | "top" = "live") => {
    if (!gameId || !eventKey) {
      setLoading(false);
      setErrorText("Missing game or event.");
      return;
    }

    setLoading(true);
    setErrorText(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id ?? null;
    setUserId(uid);

    const query = supabase
      .from("feed_comments")
      .select("id, game_id, user_id, parent_id, body, likes, created_at, event_key")
      .eq("game_id", gameId)
      .eq("event_key", eventKey);

    const { data: rows, error } = currentSort === "top"
      ? await query.order("likes", { ascending: false }).order("created_at", { ascending: false })
      : await query.order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setErrorText(error.message || "Could not load comments.");
      setComments([]);
      setLoading(false);
      return;
    }

    const dbRows = (rows ?? []) as DbComment[];
    const userIds = Array.from(new Set(dbRows.map((row) => row.user_id).filter(Boolean)));
    const profileMap = new Map<string, Profile>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);

      for (const profile of profiles ?? []) {
        profileMap.set(profile.id, profile);
      }
    }

    const commentIds = dbRows.map((row) => row.id);
    let likedIds = new Set<string>();
    const likeCounts = new Map<string, number>();

    if (commentIds.length > 0) {
      const { data: allLikes } = await supabase
        .from("feed_comment_likes")
        .select("comment_id")
        .in("comment_id", commentIds);

      for (const like of allLikes ?? []) {
        const commentId = String(like.comment_id);
        likeCounts.set(commentId, (likeCounts.get(commentId) ?? 0) + 1);
      }

      if (uid) {
        const { data: userLikes } = await supabase
          .from("feed_comment_likes")
          .select("comment_id")
          .eq("user_id", uid)
          .in("comment_id", commentIds);

        likedIds = new Set((userLikes ?? []).map((like) => String(like.comment_id)));
      }
    }

    const allComments: Comment[] = dbRows.map((row) => ({
      id: row.id,
      game_id: row.game_id,
      user_id: row.user_id,
      parent_id: row.parent_id,
      body: row.body,
      likes: likeCounts.get(row.id) ?? row.likes ?? 0,
      created_at: row.created_at,
      event_key: row.event_key,
      profile: profileMap.get(row.user_id) ?? null,
      liked: likedIds.has(row.id),
      replies: [],
    }));

    const byId = new Map<string, Comment>();
    const topLevel: Comment[] = [];

    for (const comment of allComments) byId.set(comment.id, comment);

    for (const comment of allComments) {
      if (comment.parent_id && byId.has(comment.parent_id)) {
        byId.get(comment.parent_id)!.replies.push(comment);
      } else {
        topLevel.push(comment);
      }
    }

    topLevel.sort((a, b) => {
      if (b.likes !== a.likes) return b.likes - a.likes;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    setComments(topLevel);
    setLoading(false);
  }, [gameId, eventKey]);

  useEffect(() => {
    loadComments(sort);
  }, [loadComments, sort]);

  // Scroll highlighted comment to top after load
  useEffect(() => {
    if (!highlight || loading) return;
    const el = document.getElementById(`c-${highlight}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlight, loading]);

  async function handleSubmit() {
    const cleanBody = body.trim();
    if (!cleanBody || !userId || submitting) return;

    setSubmitting(true);
    setErrorText(null);

    const { data: inserted, error } = await supabase.from("feed_comments").insert({
      game_id: gameId,
      user_id: userId,
      parent_id: replyTo?.id ?? null,
      body: cleanBody,
      event_key: eventKey,
    }).select("id").single();

    if (error) {
      console.error(error);
      setErrorText(error.message || "Could not post comment.");
      setSubmitting(false);
      return;
    }

    const newCommentId = (inserted as { id: string } | null)?.id;

    if (replyTo) {
      setOpenReplies((prev) => {
        const next = new Set(prev);
        next.add(replyTo.id);
        return next;
      });
      // Notify parent comment author of reply
      if (replyTo.user_id !== userId) {
        createNotification(replyTo.user_id, "reply_comment", userId, {
          comment_body: cleanBody.slice(0, 100),
          comment_id: replyTo.id,
          game_id: gameId,
          event_key: eventKey,
        });
      }
    }

    // Notify any @mentioned users
    await notifyMentions(cleanBody, userId, {
      comment_body: cleanBody.slice(0, 100),
      comment_id: newCommentId,
      game_id: gameId,
      event_key: eventKey,
    });

    setBody("");
    setReplyTo(null);
    const newCount = commentsSent + 1;
    setCommentsSent(newCount);
    if (newCount > 3) setCooldown(30);
    await loadComments(sort);
    setSubmitting(false);
  }

  async function handleLike(comment: Comment) {
  if (!userId) {
    router.push("/login");
    return;
  }

  if (likingIds.has(comment.id)) return;

  setLikingIds((prev) => new Set(prev).add(comment.id));
  setErrorText(null);

  const wasLiked = comment.liked;

  setComments((prev) =>
    updateCommentTree(prev, comment.id, (c) => ({
      ...c,
      liked: !wasLiked,
      likes: wasLiked ? Math.max(0, c.likes - 1) : c.likes + 1,
    }))
  );

  const result = wasLiked
    ? await supabase
        .from("feed_comment_likes")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", userId)
    : await supabase.from("feed_comment_likes").insert({
        comment_id: comment.id,
        user_id: userId,
      });

  if (!wasLiked && !result.error && comment.user_id !== userId) {
    createNotification(comment.user_id, "like_comment", userId, {
      comment_body: comment.body.slice(0, 100),
      comment_id: comment.id,
      game_id: gameId,
      event_key: eventKey,
    });
  }

  if (result.error) {
    console.error(result.error);
    setErrorText(result.error.message || "Could not update like.");
    await loadComments(sort);
  }

  setLikingIds((prev) => {
    const next = new Set(prev);
    next.delete(comment.id);
    return next;
  });
}

  async function handleDelete(comment: Comment) {
    if (!userId || userId !== comment.user_id) return;

    await supabase.from("feed_comments").delete().eq("id", comment.id);
    await loadComments(sort);
  }

  function startReply(comment: Comment) {
    setReplyTo(comment);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  return (
    <main style={pageStyle}>
      <style jsx global>{`
        @keyframes commentSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <header style={headerStyle}>
        <button onClick={() => router.back()} style={backBtnStyle} aria-label="Back">
          <svg width="10" height="17" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,1 1,9 9,17" />
          </svg>
        </button>

        <div style={headerTextStyle}>
          <span style={headerTitleStyle}>Comments</span>
          <span style={headerSubStyle}>
            {eventCard ? eventCard.playerName : label}
          </span>
        </div>
      </header>

      {eventParts && eventCard && (
        <EventCard
          playerName={eventCard.playerName}
          team={eventCard.team}
          img={eventCard.img}
          type={eventParts.type}
          quarter={eventParts.quarter}
          minute={eventParts.minute}
        />
      )}

      {playerCard && (
        <section style={playerCardStyle}>
          <PlayerCardHeader name={label} img={playerCard.img} team={playerCard.team} rating={playerCard.rating} slug={playerSlug(label)} />
          <div style={statChipsStyle}>
            {[
              { label: "G.B", value: playerCard.gb },
              { label: "D", value: playerCard.d },
              { label: "K", value: playerCard.k },
              { label: "H", value: playerCard.h },
              { label: "M", value: playerCard.m },
              { label: "T", value: playerCard.t },
              { label: "HO", value: playerCard.ho },
            ].map(({ label: l, value: v }) => (
              <div key={l} style={statChipStyle}>
                <span style={statChipValueStyle}>{v}</span>
                <span style={statChipLabelStyle}>{l}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {errorText && <div style={errorStyle}>{errorText}</div>}

      {/* Sort pills */}
      {comments.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
          {(["live", "top"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              background: sort === s ? "#f8fafc" : "rgba(255,255,255,0.07)",
              color: sort === s ? "#020202" : "#64748b",
              transition: "all 0.15s",
            }}>
              {s === "live" ? "Live" : "Top"}
            </button>
          ))}
        </div>
      )}

      <section style={listStyle}>
        {loading ? (
          <div style={centreStyle}>
            <div style={spinnerStyle} />
          </div>
        ) : comments.length === 0 ? (
          <div style={emptyStyle}>
            <div style={emptyIconStyle}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" strokeWidth="1.5" />
                <line x1="9" y1="14" x2="13" y2="14" strokeWidth="1.5" />
              </svg>
            </div>
            <div style={emptyTitleStyle}>No comments yet</div>
            <div style={emptySubStyle}>Be the first one to react to this play.</div>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              userId={userId}
              onLike={handleLike}
              onDelete={handleDelete}
              onReply={startReply}
              likingIds={likingIds}
              openReplies={openReplies}
              setOpenReplies={setOpenReplies}
            />
          ))
        )}
      </section>

      <section style={inputAreaStyle}>
        {!userId ? (
          <button onClick={() => router.push("/login")} style={signInBtnStyle}>
            Sign in to comment
          </button>
        ) : (
          <>
            {replyTo && (
              <div style={replyBannerStyle}>
                <span style={replyBannerTextStyle}>
                  Replying to <strong>{getProfileName(replyTo.profile)}</strong>
                </span>
                <button onClick={() => setReplyTo(null)} style={cancelReplyBtnStyle}>
                  ✕
                </button>
              </div>
            )}

            {cooldown > 0 && (
              <div style={{ marginBottom: 8, padding: "7px 12px", borderRadius: 12, background: "rgba(251,146,60,.1)", border: "1px solid rgba(251,146,60,.25)", fontSize: 12, fontWeight: 700, color: "#fb923c", textAlign: "center" as const }}>
                Wait {cooldown}s before commenting again
              </div>
            )}
            <div style={inputRowStyle}>
              <MentionTextarea
                textareaRef={inputRef}
                value={body}
                onChange={setBody}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !cooldown) { e.preventDefault(); handleSubmit(); } }}
                placeholder={cooldown > 0 ? `Wait ${cooldown}s…` : replyTo ? "Write a reply…" : "Write a comment…"}
                rows={1}
                maxLength={500}
                style={textareaStyle}
              />

              <button
                onClick={handleSubmit}
                disabled={!body.trim() || submitting || cooldown > 0}
                style={{
                  ...sendBtnStyle,
                  opacity: !body.trim() || submitting || cooldown > 0 ? 0.38 : 1,
                }}
              >
                {submitting ? (
                  <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "commentSpin 0.7s linear infinite" }} />
                ) : cooldown > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 900 }}>{cooldown}s</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

// ── Team colours (matches liveFeedTeamColors in match page) ─────────────────
const TEAM_COLOR_MAP: Record<string, { primary: string; bg: string }> = {
  adelaide:           { primary: "#002b5c", bg: "#002b5c" },
  "adelaide crows":   { primary: "#002b5c", bg: "#002b5c" },
  brisbane:           { primary: "#a0132f", bg: "#a0132f" },
  "brisbane lions":   { primary: "#a0132f", bg: "#a0132f" },
  carlton:            { primary: "#0e3e6e", bg: "#0e3e6e" },
  collingwood:        { primary: "#d0d0d0", bg: "#1a1a1a" },
  essendon:           { primary: "#e2001a", bg: "#1a0000" },
  fremantle:          { primary: "#2c1654", bg: "#2c1654" },
  geelong:            { primary: "#1a3c6d", bg: "#1a3c6d" },
  "geelong cats":     { primary: "#1a3c6d", bg: "#1a3c6d" },
  "gold coast":       { primary: "#e8242b", bg: "#2a0000" },
  suns:               { primary: "#e8242b", bg: "#2a0000" },
  gws:                { primary: "#f15a22", bg: "#2a1000" },
  "gws giants":       { primary: "#f15a22", bg: "#2a1000" },
  hawthorn:           { primary: "#f4a800", bg: "#2a1e00" },
  hawks:              { primary: "#f4a800", bg: "#2a1e00" },
  melbourne:          { primary: "#0d1b44", bg: "#0d1b44" },
  demons:             { primary: "#0d1b44", bg: "#0d1b44" },
  "north melbourne":  { primary: "#013b9e", bg: "#011a4a" },
  kangaroos:          { primary: "#013b9e", bg: "#011a4a" },
  "port adelaide":    { primary: "#008aaa", bg: "#002a33" },
  power:              { primary: "#008aaa", bg: "#002a33" },
  richmond:           { primary: "#f7c800", bg: "#2a2000" },
  tigers:             { primary: "#f7c800", bg: "#2a2000" },
  "st kilda":         { primary: "#ed1b2e", bg: "#2a0005" },
  saints:             { primary: "#ed1b2e", bg: "#2a0005" },
  sydney:             { primary: "#e4151b", bg: "#2a0000" },
  swans:              { primary: "#e4151b", bg: "#2a0000" },
  "west coast":       { primary: "#002b7f", bg: "#001240" },
  eagles:             { primary: "#002b7f", bg: "#001240" },
  "western bulldogs": { primary: "#014896", bg: "#001a3a" },
  bulldogs:           { primary: "#014896", bg: "#001a3a" },
};

function getTeamColors(team: string) {
  return TEAM_COLOR_MAP[team.toLowerCase().trim()] ?? { primary: "#3b82f6", bg: "#0d1b44" };
}

function EventCard({ playerName, team, img, type, quarter, minute }: {
  playerName: string; team: string; img: string;
  type: string; quarter: string; minute: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = playerName.trim().split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?";
  const { primary, bg } = getTeamColors(team);
  const typeColor = type === "GOAL" ? "#22c55e" : type === "BEHIND" ? "#f8fafc" : "#facc15";

  return (
    <div style={{
      margin: "12px 14px 4px",
      minHeight: 86,
      display: "grid",
      gridTemplateColumns: "68px 1fr auto",
      alignItems: "center",
      gap: 14,
      background: "#020202",
      borderRadius: 18,
      padding: "11px 16px 11px 12px",
      border: `2px solid ${primary}`,
      overflow: "hidden",
    }}>
      {/* Player avatar — matches playerAvatarWrapStyle */}
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: `${primary}55`,
        overflow: "hidden", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {img && !imgFailed
          ? <img src={img} alt={playerName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={() => setImgFailed(true)} />
          : <span style={{ color: "#fff", fontSize: 18, fontWeight: 1000 }}>{initials}</span>
        }
      </div>

      {/* Name + event type — matches liveFeedInfoStyle */}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {playerName}
        </div>
        <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1, fontWeight: 1000, letterSpacing: ".08em", color: typeColor }}>
          {type}
        </div>
      </div>

      {/* Time badge — matches liveFeedTimeBadgeStyle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: "3px 8px" }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", letterSpacing: "0.02em" }}>{quarter}</span>
          <span style={{ fontSize: 11, color: "#334155", fontWeight: 700 }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8" }}>{minute}&apos;</span>
        </div>
      </div>
    </div>
  );
}

function PlayerCardHeader({ name, img, team, rating, slug }: { name: string; img: string; team: string; rating: string; slug?: string }) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.trim().split(/\s+/).filter(Boolean).map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?";
  const ratingNum = parseFloat(rating) || 0;
  const ratingColor = foopyColor(ratingNum);

  return (
    <div
      style={{ ...playerCardHeaderStyle, cursor: slug ? "pointer" : undefined }}
      onClick={slug ? () => router.push(`/player/${slug}`) : undefined}
    >
      <div style={playerAvatarLargeStyle}>
        {img && !imgFailed
          ? <img src={img} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} onError={() => setImgFailed(true)} />
          : <span style={playerAvatarInitialsStyle}>{initials}</span>
        }
      </div>
      <div style={playerCardInfoStyle}>
        <span style={playerCardNameStyle}>{name}</span>
        {team && <span style={playerCardTeamStyle}>{team}</span>}
      </div>
      {ratingNum > 0 && (
        <div style={{ ...playerRatingPillStyle, background: ratingColor }}>
          <span style={playerRatingNumStyle}>{ratingNum.toFixed(1)}</span>
          <span style={playerRatingLabelStyle}>FOOPY</span>
        </div>
      )}
    </div>
  );
}

function CommentBody({ text }: { text: string }) {
  const router = useRouter();
  const parts = text.split(/(@\w+)/g);
  return (
    <p style={commentBodyStyle}>
      {parts.map((part, i) =>
        /^@\w+$/.test(part) ? (
          <span
            key={i}
            onClick={() => router.push(`/profile/${part.slice(1)}`)}
            style={{ color: "#60a5fa", fontWeight: 700, cursor: "pointer" }}
          >
            {part}
          </span>
        ) : part
      )}
    </p>
  );
}

function CommentRow({
  comment,
  userId,
  onLike,
  onDelete,
  onReply,
  likingIds,
  openReplies,
  setOpenReplies,
  isReply = false,
}: {
  comment: Comment;
  userId: string | null;
  onLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onReply: (comment: Comment) => void;
  likingIds: Set<string>;
  openReplies: Set<string>;
  setOpenReplies: Dispatch<SetStateAction<Set<string>>>;
  isReply?: boolean;
}) {
  const router = useRouter();
  const name = getProfileName(comment.profile);
  const username = comment.profile?.username;
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiking = likingIds.has(comment.id);

  const replyCount = comment.replies.length;
  const repliesOpen = openReplies.has(comment.id);

  function toggleReplies() {
    setOpenReplies((prev) => {
      const next = new Set(prev);
      if (next.has(comment.id)) next.delete(comment.id);
      else next.add(comment.id);
      return next;
    });
  }

  return (
    <article id={`c-${comment.id}`} style={{ ...commentRowStyle, marginLeft: isReply ? 42 : 0 }}>
      <div
        onClick={() => username && router.push(`/profile/${username}`)}
        style={{ ...avatarStyle, cursor: username ? "pointer" : "default" }}
      >
        {avatar ? (
          <img src={avatar} alt={name} style={avatarImgStyle} />
        ) : (
          <span style={avatarInitialStyle}>{name[0]?.toUpperCase() || "U"}</span>
        )}
      </div>

      <div style={commentMainStyle}>
        <div style={commentBubbleStyle}>
          <div style={commentMetaStyle}>
            <span style={commentNameStyle}>{name}</span>
            <span style={commentTimeStyle}>{formatCommentTime(comment.created_at)}</span>
          </div>

          <CommentBody text={comment.body} />
        </div>

        <div style={commentActionsStyle}>
          <button
            onClick={() => onLike(comment)}
            disabled={!userId || isLiking}
            style={{
              ...actionBtnStyle,
              color: comment.liked ? "#f43f5e" : "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 4,
              opacity: isLiking ? 0.5 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={comment.liked ? "#f43f5e" : "none"} stroke={comment.liked ? "#f43f5e" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {comment.likes > 0 && <span>{comment.likes}</span>}
          </button>

          {!isReply && userId && (
            <button onClick={() => onReply(comment)} style={actionBtnStyle}>
              Reply
            </button>
          )}

          {isOwn && (
            <button onClick={() => onDelete(comment)} style={{ ...actionBtnStyle, color: "#ef4444" }}>
              Delete
            </button>
          )}
        </div>

        {!isReply && replyCount > 0 && (
          <button onClick={toggleReplies} style={viewRepliesBtnStyle}>
            {repliesOpen
              ? "Hide replies"
              : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </button>
        )}

        {!isReply && repliesOpen && (
          <div style={repliesStyle}>
            {comment.replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                userId={userId}
                onLike={onLike}
                onDelete={onDelete}
                onReply={onReply}
                likingIds={likingIds}
                openReplies={openReplies}
                setOpenReplies={setOpenReplies}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function getProfileName(profile?: Profile | null) {
  return profile?.display_name || profile?.username || "User";
}

function formatCommentTime(dateString: string) {
  const date = new Date(dateString);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function updateCommentTree(
  comments: Comment[],
  commentId: string,
  updater: (comment: Comment) => Comment
): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) return updater(comment);

    return {
      ...comment,
      replies: updateCommentTree(comment.replies, commentId, updater),
    };
  });
}

// Bottom nav is hidden on match pages, so no offset needed
const BOTTOM_NAV_HEIGHT = 0;

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  maxWidth: 760,
  margin: "0 auto",
  background: "#050505",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  paddingBottom: `calc(90px + env(safe-area-inset-bottom))`,
  borderLeft: "1px solid rgba(255,255,255,0.08)",
  borderRight: "1px solid rgba(255,255,255,0.08)",
};

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: 58,
  paddingLeft: 10,
  paddingRight: 16,
  background: "rgba(5,5,5,0.88)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const backBtnStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const headerTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const headerTitleStyle: CSSProperties = {
  fontSize: 19,
  fontWeight: 950,
};

const headerSubStyle: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 700,
};


const playerCardStyle: CSSProperties = {
  margin: "12px 14px",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
  border: "1px solid rgba(255,255,255,0.1)",
  overflow: "hidden",
};

const playerCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "16px 16px 12px",
};

const playerAvatarLargeStyle: CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  background: "#1e293b",
  border: "2px solid rgba(255,255,255,0.15)",
  flexShrink: 0,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const playerAvatarInitialsStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#60a5fa",
};

const playerCardInfoStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};

const playerCardNameStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 950,
  color: "#f8fafc",
  letterSpacing: "-0.02em",
};

const playerCardTeamStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
};

const playerRatingPillStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 12,
  flexShrink: 0,
};

const playerRatingNumStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#fff",
  lineHeight: 1,
};

const playerRatingLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  color: "rgba(255,255,255,0.7)",
  letterSpacing: "0.08em",
  marginTop: 2,
};

const statChipsStyle: CSSProperties = {
  display: "flex",
  borderTop: "1px solid rgba(255,255,255,0.07)",
};

const statChipStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "10px 4px",
  borderRight: "1px solid rgba(255,255,255,0.06)",
};

const statChipValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#f1f5f9",
};

const statChipLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: "#475569",
  letterSpacing: "0.06em",
  marginTop: 2,
};

const errorStyle: CSSProperties = {
  margin: "10px 14px",
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "#fecaca",
  fontSize: 13,
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  flex: 1,
  padding: "4px 14px 20px",
};

const centreStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  padding: "70px 0",
};

const spinnerStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.12)",
  borderTopColor: "#3b82f6",
  animation: "commentSpin 0.75s linear infinite",
};

const emptyStyle: CSSProperties = {
  minHeight: 300,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  color: "#94a3b8",
};

const emptyIconStyle: CSSProperties = {
  marginBottom: 16,
  opacity: 0.9,
};

const emptyTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 17,
  fontWeight: 900,
  marginBottom: 5,
};

const emptySubStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: "#64748b",
};

const commentRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 0",
};

const avatarStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#111827",
  border: "1px solid rgba(255,255,255,0.1)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const avatarImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const avatarInitialStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#60a5fa",
};

const commentMainStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const commentBubbleStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 18,
  borderTopLeftRadius: 4,
  padding: "10px 14px",
};

const commentMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 5,
};

const commentNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#f8fafc",
};

const commentTimeStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 800,
};

const commentBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.45,
  color: "#e2e8f0",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const commentActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  paddingLeft: 8,
  marginTop: 8,
};

const actionBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};

const viewRepliesBtnStyle: CSSProperties = {
  marginTop: 8,
  marginLeft: 8,
  background: "none",
  border: "none",
  color: "#60a5fa",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
};

const repliesStyle: CSSProperties = {
  marginTop: 6,
};

const inputAreaStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  width: "100%",
  maxWidth: 760,
  bottom: 0,
  zIndex: 9999,
  padding: "10px 14px",
  paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
  background: "rgba(5,5,5,0.94)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  borderLeft: "1px solid rgba(255,255,255,0.07)",
  borderRight: "1px solid rgba(255,255,255,0.07)",
  boxShadow: "0 -24px 48px rgba(0,0,0,0.6)",
};

const signInBtnStyle: CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const replyBannerStyle: CSSProperties = {
  marginBottom: 9,
  padding: "8px 10px",
  borderRadius: 13,
  background: "rgba(59,130,246,0.12)",
  border: "1px solid rgba(59,130,246,0.22)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const replyBannerTextStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
};

const cancelReplyBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#cbd5e1",
  cursor: "pointer",
};

const inputRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minHeight: 44,
  maxHeight: 110,
  background: "rgba(255,255,255,0.07)",
  border: "1.5px solid rgba(255,255,255,0.12)",
  borderRadius: 22,
  color: "#f8fafc",
  fontSize: 14,
  padding: "11px 16px",
  resize: "none",
  outline: "none",
  fontFamily: "inherit",
  lineHeight: 1.45,
};

const sendBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "none",
  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
  boxShadow: "0 2px 12px rgba(59,130,246,0.35)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  cursor: "pointer",
  transition: "opacity 0.15s",
};