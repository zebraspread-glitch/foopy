"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { createNotification, notifyMentions } from "@/app/lib/notifications";
import MentionTextarea from "@/app/components/MentionTextarea";
import playerStatsJson from "@/app/data/players.json";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/match/[id]/utils";
import { haptic } from "@/app/lib/haptic";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";

type Profile = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  verified?: boolean | null;
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

const PLAYER_IMAGE_ID_OVERRIDES: Record<string, string> = {
  joshuarachele: "joshrachele",
  lachlanschultz: "lachieschultz",
  lachlansullivan: "lachiesullivan",
  samuelwicks: "samwicks",
  zacharywilliams: "zacwilliams",
};

function cleanPlayerName(value: string) {
  return value
    .replace(/\s*(?:Â·|·|\|)\s*(GOAL|BEHIND|SCORE|MARK|KICK|HANDBALL|TACKLE|HITOUT|CLEARANCE)\s*$/i, "")
    .trim();
}

function eventKeyAliases(eventKey: string) {
  const aliases = [eventKey];
  const modern = eventKey.match(/^(q.+?_m.+?_t.+?)_team[^_]*_p([^_]*)_i\d+$/);
  if (modern) aliases.push(`${modern[1]}_p${modern[2]}`);
  const score = eventKey.match(/^(score_.+?_\d+_\d+)_([^_]+)$/);
  if (score) {
    aliases.push(`${score[1]}_SCORE`);
    if (score[2] === "SCORE") {
      aliases.push(`${score[1]}_GOAL`, `${score[1]}_BEHIND`);
    }
  }

  return Array.from(new Set(aliases.filter(Boolean)));
}

function eventKeyAliasesFromParams(eventKey: string, rawAliases: string | null) {
  const aliases = [
    eventKey,
    ...(rawAliases ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
    ...eventKeyAliases(eventKey),
  ];

  return Array.from(new Set(aliases.filter(Boolean)));
}

function stableEventKey(keys: string[], fallback: string) {
  return (
    keys.find((key) => key.startsWith("score_") && key.endsWith("_SCORE")) ??
    keys.find((key) => key.startsWith("score_")) ??
    keys.find((key) => key.startsWith("player_")) ??
    keys.find((key) => !key.startsWith("feed_")) ??
    fallback
  );
}

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
  Carlton: "blues", "Carlton Blues": "blues", Collingwood: "magpies", "Collingwood Magpies": "magpies", Essendon: "bombers", "Essendon Bombers": "bombers", Fremantle: "dockers", "Fremantle Dockers": "dockers",
  Geelong: "cats", "Geelong Cats": "cats", "Gold Coast": "suns", GWS: "giants", "GWS Giants": "giants",
  Hawthorn: "hawks", "Hawthorn Hawks": "hawks", Melbourne: "demons", "Melbourne Demons": "demons", "North Melbourne": "kangaroos", "North Melbourne Kangaroos": "kangaroos", "Port Adelaide": "power", "Port Adelaide Power": "power",
  Richmond: "tigers", "Richmond Tigers": "tigers", "St Kilda": "saints", "St Kilda Saints": "saints", Sydney: "swans", "Sydney Swans": "swans", "West Coast": "eagles", "West Coast Eagles": "eagles", "Western Bulldogs": "bulldogs",
};

function resolvePlayerImage(name: string, team: string) {
  const safeName = cleanPlayerName(name);
  const found = (playerStatsJson as PlayerRecord[]).find(
    p => {
      const primaryName = p.name ?? p.player ?? "";
      const aliases = Array.isArray((p as any).aliases) ? (p as any).aliases : [];
      return [primaryName, ...aliases].some((alias) => slugify(alias) === slugify(safeName));
    }
  );
  const club = found?.club ?? found?.team ?? team;
  const folder = CLUB_FOLDER[club] ?? slugify(club);
  const imageId = PLAYER_IMAGE_ID_OVERRIDES[slugify(found?.name ?? found?.player ?? safeName)] ?? slugify(found?.name ?? found?.player ?? safeName);
  const img = found?.image ?? found?.imagePath ?? found?.playerImage ?? `${imageId}.png`;
  if (!folder || !img) return "";
  if (String(img).startsWith("/")) return String(img);
  return `/players/${folder}/${img}`;
}

function EventCommentsPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const gameId = Number(params?.id ?? 0);
  const eventKey = String(params?.event ?? "");
  const aliasParam = searchParams.get("aliases");
  const eventKeys = useMemo(
    () => eventKeyAliasesFromParams(eventKey, aliasParam),
    [eventKey, aliasParam]
  );
  const canonicalEventKey = useMemo(
    () => stableEventKey(eventKeys, eventKey),
    [eventKeys, eventKey]
  );
  const highlight = searchParams.get("highlight");

  const [resolvedPlayerName, setResolvedPlayerName] = useState<string | null>(null);
  const [fetchedStats, setFetchedStats] = useState<{ rating: string; gb: string; d: string; k: string; h: string; m: string; t: string; ho: string } | null>(null);
  const [matchGame, setMatchGame] = useState<{ hteam: string; ateam: string; hscore: number | null; ascore: number | null; complete: number; round: number | string } | null>(null);

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

  useEffect(() => {
    if (!gameId) return;
    fetch("/api/games")
      .then(r => r.json())
      .then((games: any[]) => {
        const g = games.find((x: any) => Number(x.id) === gameId);
        if (g) setMatchGame({
          hteam: g.hteam ?? "",
          ateam: g.ateam ?? "",
          hscore: g.hscore ?? null,
          ascore: g.ascore ?? null,
          complete: Number(g.complete ?? 0),
          round: g.round ?? "",
        });
      })
      .catch(() => {});
  }, [gameId]);

  const [userId, setUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

    // Look up the player's apiSportsId from players.json for reliable ID-based matching
    const slug = eventKey.slice(7);
    const playerRecord = (playerStatsJson as PlayerRecord[]).find(
      p => slugify(p.name ?? p.player ?? "") === slugify(slug)
    );
    const apiSportsPlayerId = playerRecord?.apiSportsId ?? null;

    fetch(`/api/afl/player-stats?id=${apiId}`)
      .then(r => r.json())
      .then(data => {
        // Structure: response[0].teams[].players[]
        const allPlayers: any[] = [];
        for (const team of data?.response?.[0]?.teams ?? []) {
          for (const p of team?.players ?? []) allPlayers.push(p);
        }
        // Prefer matching by apiSportsId; fall back to name slug
        const found = allPlayers.find((p: any) =>
          apiSportsPlayerId
            ? Number(p.player?.id) === apiSportsPlayerId
            : slugify(p.player?.name ?? p.name ?? "") === slugify(slug)
        );
        if (!found) return;
        const raw = found.statistics ?? found;
        const goals = raw.goals?.total ?? (typeof raw.goals === "number" ? raw.goals : 0);
        const goalAssists = raw.goals?.assists ?? raw.goalAssists ?? 0;
        const behinds = raw.behinds ?? 0;
        const disposals = raw.disposals ?? 0;
        const kicks = raw.kicks ?? 0;
        const handballs = raw.handballs ?? 0;
        const marks = raw.marks ?? 0;
        const tackles = raw.tackles ?? 0;
        const hitouts = raw.hitouts ?? 0;
        const clearances = typeof raw.clearances === "object" ? (raw.clearances?.total ?? 0) : (raw.clearances ?? 0);
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
  }, [isPlayerComment, gameId, eventKey, searchParams]);

  // For regular event comments — parse player name from label ("Jack Gunston · BEHIND")
  const eventCard = useMemo(() => {
    if (isPlayerComment || !eventParts) return null;
    const players = playerStatsJson as PlayerRecord[];
    const idMatch = eventKey.match(/_p([^_]+)$/);
    const target = idMatch ? Number(idMatch[1]) : null;
    const labelPlayerName = cleanPlayerName(label);
    const foundByEventId = target != null ? players.find(p => Array.isArray(p.eventIds) && p.eventIds.map(Number).includes(target)) : null;
    const foundByName = players.find(p => {
      const primaryName = p.name ?? p.player ?? "";
      const aliases = Array.isArray((p as any).aliases) ? (p as any).aliases : [];
      return [primaryName, ...aliases].some(alias => slugify(alias) === slugify(labelPlayerName));
    });
    const found = foundByEventId ?? foundByName ?? null;
    const team = searchParams.get("team") || found?.club || found?.team || "";
    const playerName = found?.name ?? found?.player ?? labelPlayerName;
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

  const migrateEventComments = useCallback(async () => {
    if (!gameId || !canonicalEventKey) return;

    const keysToMigrate = eventKeys.filter((key) => key && key !== canonicalEventKey);
    if (keysToMigrate.length === 0) return;

    const { error } = await supabase
      .from("feed_comments")
      .update({ event_key: canonicalEventKey })
      .eq("game_id", gameId)
      .in("event_key", keysToMigrate);

    if (error) console.error("[event comments] key migration failed:", error);
  }, [gameId, canonicalEventKey, eventKeys]);

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

    await migrateEventComments();

    const query = supabase
      .from("feed_comments")
      .select("id, game_id, user_id, parent_id, body, likes, created_at, event_key")
      .eq("game_id", gameId)
      .in("event_key", Array.from(new Set([...eventKeys, canonicalEventKey])));

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
        .select("id, username, display_name, avatar_url, verified")
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
      if (comment.parent_id) {
        const directParent = byId.get(comment.parent_id);
        if (directParent) {
          // Flatten to 2 levels: reply-of-reply goes under the grandparent
          const effectiveParent = directParent.parent_id
            ? (byId.get(directParent.parent_id) ?? directParent)
            : directParent;
          effectiveParent.replies.push(comment);
        } else {
          topLevel.push(comment);
        }
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
  }, [gameId, eventKey, eventKeys, canonicalEventKey, migrateEventComments]);

  useEffect(() => {
    loadComments(sort);
  }, [loadComments, sort]);

  // Scroll highlighted comment to top after load
  useEffect(() => {
    if (!highlight || loading) return;
    const el = document.getElementById(`c-${highlight}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlight, loading]);

  async function submitCommentText(text: string, parent: Comment | null) {
    const cleanBody = text.trim();
    if (!cleanBody || !userId || submitting) return false;

    haptic("medium");
    setSubmitting(true);
    setErrorText(null);

    const insertPayload = {
      game_id: gameId,
      user_id: userId,
      // Flatten to 2 levels: reply-of-reply links to the top-level comment
      parent_id: parent ? (parent.parent_id ?? parent.id) : null,
      body: cleanBody,
      event_key: canonicalEventKey,
    };

    const { error } = await supabase.from("feed_comments").insert(insertPayload);

    if (error) {
      console.error(error);
      setErrorText(error.message || "Could not post comment.");
      setSubmitting(false);
      return false;
    }

    await migrateEventComments();

    if (parent) {
      // Notify parent comment author of reply
      if (parent.user_id !== userId) {
        void createNotification(parent.user_id, "reply_comment", userId, {
          comment_body: cleanBody.slice(0, 100),
          comment_id: parent.id,
          game_id: gameId,
          event_key: canonicalEventKey,
        });
      }
    }

    // Notify any @mentioned users
    notifyMentions(cleanBody, userId, {
      comment_body: cleanBody.slice(0, 100),
      game_id: gameId,
      event_key: canonicalEventKey,
    }).catch((notifyError) => console.error("[event comments] mention notify failed:", notifyError));

    const newCount = commentsSent + 1;
    setCommentsSent(newCount);
    if (newCount > 3) setCooldown(30);
    await loadComments(sort);
    setSubmitting(false);
    return true;
  }

  async function handleSubmit() {
    const ok = await submitCommentText(body, replyTo);
    if (!ok) return;
    setBody("");
    setReplyTo(null);
  }

  async function handleLike(comment: Comment) {
  if (!userId) {
    router.push("/login");
    return;
  }

  if (likingIds.has(comment.id)) return;

  haptic("selection");
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
      event_key: canonicalEventKey,
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
    // Pre-fill with @username like Instagram
    const name = comment.profile?.username || comment.profile?.display_name;
    if (name) setBody(`@${name} `);
    // Auto-expand the parent thread so the reply will be visible after submit
    const parentId = comment.parent_id ?? comment.id;
    setExpandedIds(prev => new Set(prev).add(parentId));
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main style={pageStyle}>
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

{/* MatchScoreBar removed — score shown in main match page header */}

      {eventKey.startsWith("poll_") && searchParams.get("stats") && (
        <PollStatCard
          question={label}
          stat={searchParams.get("stat") ?? ""}
          pollType={(searchParams.get("pollType") ?? "player") as "team" | "player"}
          stats={searchParams.get("stats") ?? ""}
        />
      )}

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
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlayerCardHeader name={label} img={playerCard.img} team={playerCard.team} rating={playerCard.rating} slug={playerSlug(label)} />
            </div>
            <ShareButton name={label} rating={playerCard.rating} />
          </div>
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
              background: sort === s ? "var(--text-1)" : "var(--border-1)",
              color: sort === s ? "var(--bg)" : "var(--text-3)",
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
            <div className="spinner" />
          </div>
        ) : comments.length === 0 ? (
          <div style={emptyStyle}>
            <div style={emptyIconStyle}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--border-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
              expandedIds={expandedIds}
              onToggleReplies={toggleExpanded}
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
                  <div className="spinner spinner-sm spinner-white" />
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

function MatchScoreBar({ game, gameId }: { game: { hteam: string; ateam: string; hscore: number | null; ascore: number | null; complete: number; round: number | string }; gameId: number }) {
  const router = useRouter();
  const [hErr, setHErr] = useState(false);
  const [aErr, setAErr] = useState(false);

  const hFolder = CLUB_FOLDER[game.hteam] ?? slugify(game.hteam);
  const aFolder = CLUB_FOLDER[game.ateam] ?? slugify(game.ateam);
  const hLogo = `/team-logos/${hFolder}.png`;
  const aLogo = `/team-logos/${aFolder}.png`;

  const status = game.complete >= 100 ? "FINAL" : game.complete > 0 ? "LIVE" : "UPCOMING";
  const hScore = game.hscore ?? "-";
  const aScore = game.ascore ?? "-";

  return (
    <button
      onClick={() => router.push(`/match/${gameId}`)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", margin: "10px 0 0", padding: "10px 16px",
        background: "var(--surface-2)", borderTop: "1px solid var(--border-1)",
        borderBottom: "1px solid var(--border-1)", border: "none",
        cursor: "pointer", color: "var(--text-1)", fontFamily: "inherit",
      }}
    >
      {/* Home team */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        {!hErr
          ? <img src={hLogo} alt={game.hteam} onError={() => setHErr(true)} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1e293b" }} />}
        <div style={{ textAlign: "left" as const }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)" }}>{game.hteam.split(" ").pop()}</div>
          <div style={{ fontSize: 22, fontWeight: 1000, color: "var(--text-1)", lineHeight: 1 }}>{hScore}</div>
        </div>
      </div>

      {/* Centre */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "0 10px" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", color: status === "LIVE" ? "#22c55e" : "#64748b" }}>{status}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)" }}>Rd {game.round}</span>
      </div>

      {/* Away team */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)" }}>{game.ateam.split(" ").pop()}</div>
          <div style={{ fontSize: 22, fontWeight: 1000, color: "var(--text-1)", lineHeight: 1 }}>{aScore}</div>
        </div>
        {!aErr
          ? <img src={aLogo} alt={game.ateam} onError={() => setAErr(true)} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1e293b" }} />}
      </div>
    </button>
  );
}

// ── Team colours (matches liveFeedTeamColors in match page) ─────────────────
const TEAM_COLOR_MAP: Record<string, { primary: string; bg: string }> = {
  adelaide:           { primary: "#002b5c", bg: "#002b5c" },
  "adelaide crows":   { primary: "#002b5c", bg: "#002b5c" },
  brisbane:           { primary: "#a0132f", bg: "#a0132f" },
  "brisbane lions":   { primary: "#a0132f", bg: "#a0132f" },
  carlton:            { primary: "#0e3e6e", bg: "#0e3e6e" },
  collingwood:        { primary: "#d0d0d0", bg: "#272731" },
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
  const key = team.toLowerCase().trim();
  const folderKey = CLUB_FOLDER[team] ?? CLUB_FOLDER[team.trim()] ?? Object.entries(CLUB_FOLDER).find(([name]) => name.toLowerCase() === key)?.[1] ?? "";
  return TEAM_COLOR_MAP[key] ?? TEAM_COLOR_MAP[folderKey] ?? { primary: "#3b82f6", bg: "#0d1b44" };
}

function PollStatCard({ question, stat, pollType, stats }: {
  question: string;
  stat: string;
  pollType: "team" | "player";
  stats: string;
}) {
  // Parse "Name:value,Name2:value2" into entries
  const entries = stats.split(",").map(s => {
    const idx = s.lastIndexOf(":");
    if (idx === -1) return null;
    return { label: s.slice(0, idx).trim(), value: s.slice(idx + 1).trim() };
  }).filter(Boolean) as { label: string; value: string }[];

  const statLabel = stat === "foopy" ? "Foopy" : stat.charAt(0).toUpperCase() + stat.slice(1);

  return (
    <section style={{
      margin: "10px 16px",
      background: "rgba(109,40,217,0.08)",
      border: "1.5px solid rgba(109,40,217,0.25)",
      borderRadius: 18,
      padding: "14px 14px 12px",
    }}>
      {/* Poll label */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
            <rect x="18" y="4" width="4" height="16" rx="1" />
            <rect x="10" y="9" width="4" height="11" rx="1" />
            <rect x="2" y="13" width="4" height="7" rx="1" />
          </svg>
        </div>
        <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)", flex: 1, minWidth: 0 }}>{question}</span>
      </div>

      {/* Stat rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map((entry, i) => {
          const folder = CLUB_FOLDER[entry.label] ?? slugify(entry.label);
          const teamLogo = `/team-logos/${folder}.png`;
          const isTeam = pollType === "team";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isTeam ? (
                <img src={teamLogo} alt={entry.label} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-3)", border: "1px solid var(--border-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  <img src={resolvePlayerImage(entry.label, "")} alt={entry.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label}</span>
              <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#a78bfa", lineHeight: 1 }}>{entry.value}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginLeft: 4 }}>{statLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventCard({ playerName, team, img, type, quarter, minute }: {
  playerName: string; team: string; img: string;
  type: string; quarter: string; minute: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const initials = playerName.trim().split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?";
  const { primary, bg } = getTeamColors(team);
  const typeColor = type === "GOAL" ? "#22c55e" : type === "BEHIND" ? "#f8fafc" : "#facc15";

  const folder = CLUB_FOLDER[team] ?? slugify(team);
  const teamLogo = folder ? `/team-logos/${folder}.png` : "";
  const isTeamEvent = !img || imgFailed;

  return (
    <div style={{
      margin: "12px 14px 4px",
      minHeight: 86,
      display: "grid",
      gridTemplateColumns: "68px 1fr auto",
      alignItems: "center",
      gap: 14,
      background: "var(--bg)",
      borderRadius: 18,
      padding: "11px 16px 11px 12px",
      border: `2px solid ${primary}`,
      overflow: "hidden",
    }}>
      {/* Avatar: player photo, or team logo, or initials fallback */}
      <div suppressHydrationWarning style={{
        width: 56, height: 56, borderRadius: "50%",
        background: `${primary}55`,
        overflow: "hidden", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {!isTeamEvent
          ? <img src={img} alt={playerName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={() => setImgFailed(true)} />
          : teamLogo && !logoFailed
          ? <img src={teamLogo} alt={team} style={{ width: "70%", height: "70%", objectFit: "contain", display: "block" }} onError={() => setLogoFailed(true)} />
          : <span style={{ color: "var(--text-1)", fontSize: 18, fontWeight: 1000 }}>{initials}</span>
        }
      </div>

      {/* Name + event type — matches liveFeedInfoStyle */}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--text-1)", fontSize: 18, fontWeight: 1000, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {playerName}
        </div>
        <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1, fontWeight: 1000, letterSpacing: ".08em", color: typeColor }}>
          {type}
        </div>
      </div>

      {/* Time badge — matches liveFeedTimeBadgeStyle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 999, padding: "3px 8px" }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "var(--text-2)", letterSpacing: "0.02em" }}>{quarter}</span>
          <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 700 }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: "var(--text-2)" }}>{minute}&apos;</span>
        </div>
      </div>
    </div>
  );
}

function ShareButton({ name, rating }: { name: string; rating: string }) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const url = window.location.href;
    const text = rating
      ? `${name} rated ${parseFloat(rating).toFixed(1)} Foopy on Foopy AFL`
      : `Check out ${name}'s performance on Foopy AFL`;

    if (navigator.share) {
      navigator.share({ title: name, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <button
      onClick={handleShare}
      title="Share"
      style={{
        flexShrink: 0,
        marginTop: 12,
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 999,
        background: copied ? "rgba(34,197,94,0.15)" : "var(--surface-3)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "var(--border-2)"}`,
        color: copied ? "#4ade80" : "var(--text-2)",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </>
      )}
    </button>
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
  expandedIds,
  onToggleReplies,
  isReply = false,
}: {
  comment: Comment;
  userId: string | null;
  onLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onReply: (comment: Comment) => void;
  likingIds: Set<string>;
  expandedIds: Set<string>;
  onToggleReplies: (id: string) => void;
  isReply?: boolean;
}) {
  const router = useRouter();
  const name = getProfileName(comment.profile);
  const username = comment.profile?.username;
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiking = likingIds.has(comment.id);
  const replyCount = comment.replies.length;
  const isExpanded = expandedIds.has(comment.id);

  return (
    <div id={`c-${comment.id}`}>
      <div style={{ ...commentRowStyle, paddingLeft: isReply ? 52 : 16 }}>
        {/* Avatar */}
        <div
          onClick={() => username && router.push(`/profile/${username}`)}
          style={{
            ...avatarStyle,
            width: isReply ? 28 : 34,
            height: isReply ? 28 : 34,
            cursor: username ? "pointer" : "default",
            flexShrink: 0,
          }}
        >
          {avatar ? (
            <img src={avatar} alt={name} style={avatarImgStyle} />
          ) : (
            <span style={{ ...avatarInitialStyle, fontSize: isReply ? 11 : 13 }}>{name[0]?.toUpperCase() || "U"}</span>
          )}
        </div>

        <div style={commentMainStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
              <span
                onClick={() => username && router.push(`/profile/${username}`)}
                style={{ fontWeight: 900, fontSize: isReply ? 12 : 13, color: "var(--text-1)", cursor: username ? "pointer" : "default" }}
              >
                {name}
              </span>
              {comment.profile?.verified && <VerifiedBadge size={12} />}
            </div>
            <CommentBody text={comment.body} />

            <div style={commentActionsStyle}>
              <span style={commentTimeStyle}>{formatCommentTime(comment.created_at)}</span>
              {userId && (
                <button onClick={() => onReply(comment)} style={actionBtnStyle}>Reply</button>
              )}
              {isOwn && (
                <button onClick={() => onDelete(comment)} style={{ ...actionBtnStyle, color: "#ef4444" }}>Delete</button>
              )}
            </div>

            {!isReply && replyCount > 0 && (
              <button onClick={() => onToggleReplies(comment.id)} style={viewRepliesBtnStyle}>
                <span style={{ width: 20, height: 1, background: "var(--border-2)", display: "inline-block", flexShrink: 0 }} />
                {isExpanded
                  ? "Hide replies"
                  : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  style={{ transition: "transform 0.22s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
                >
                  <polyline points="2,3.5 5,6.5 8,3.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Like button */}
          <button
            onClick={() => onLike(comment)}
            disabled={!userId || isLiking}
            aria-label={comment.liked ? "Unlike" : "Like"}
            style={{
              width: 30,
              minHeight: 42,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 3,
              background: "none",
              border: "none",
              padding: "3px 0 0",
              fontSize: 11,
              fontWeight: 800,
              cursor: userId ? "pointer" : "default",
              color: comment.liked ? "#f43f5e" : "var(--text-3)",
              opacity: isLiking ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={comment.liked ? "#f43f5e" : "none"} stroke={comment.liked ? "#f43f5e" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {comment.likes > 0 && <span>{comment.likes}</span>}
          </button>
        </div>
      </div>

      {/* Inline replies — animated expand/collapse */}
      {!isReply && replyCount > 0 && (
        <div style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.26s cubic-bezier(0.4,0,0.2,1)",
        }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? "translateY(0)" : "translateY(-6px)",
              transition: "opacity 0.22s ease, transform 0.22s ease",
            }}>
              {comment.replies.map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  userId={userId}
                  onLike={onLike}
                  onDelete={onDelete}
                  onReply={onReply}
                  likingIds={likingIds}
                  expandedIds={expandedIds}
                  onToggleReplies={onToggleReplies}
                  isReply
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
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
  background: "var(--bg)",
  color: "var(--text-1)",
  display: "flex",
  flexDirection: "column",
  paddingBottom: `calc(90px + env(safe-area-inset-bottom))`,
  borderLeft: "1px solid var(--border-2)",
  borderRight: "1px solid var(--border-2)",
};

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: "calc(58px + env(safe-area-inset-top))",
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: 10,
  paddingRight: 16,
  boxSizing: "border-box",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid var(--border-2)",
};

const backBtnStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: "var(--surface-3)",
  border: "1px solid var(--border-2)",
  color: "var(--text-1)",
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
  color: "var(--text-2)",
  fontWeight: 700,
};


const playerCardStyle: CSSProperties = {
  margin: "12px 14px",
  borderRadius: 18,
  background: "linear-gradient(180deg, var(--border-1), rgba(255,255,255,0.03))",
  border: "1px solid var(--border-2)",
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
  color: "var(--text-1)",
  letterSpacing: "-0.02em",
};

const playerCardTeamStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-3)",
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
  color: "var(--text-1)",
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
  borderTop: "1px solid var(--border-1)",
};

const statChipStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "10px 4px",
  borderRight: "1px solid var(--border-1)",
};

const statChipValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "var(--text-1)",
};

const statChipLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: "var(--text-3)",
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
  padding: "10px 0 4px",
};

const centreStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  padding: "70px 0",
};


const emptyStyle: CSSProperties = {
  minHeight: 300,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  color: "var(--text-2)",
};

const emptyIconStyle: CSSProperties = {
  marginBottom: 16,
  opacity: 0.9,
};

const emptyTitleStyle: CSSProperties = {
  color: "var(--text-1)",
  fontSize: 17,
  fontWeight: 900,
  marginBottom: 5,
};

const emptySubStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: "var(--text-3)",
};

const commentRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "12px 16px 6px",
};

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
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
  fontSize: 13,
  fontWeight: 950,
  color: "#60a5fa",
};

const commentMainStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  columnGap: 10,
};

const commentTimeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-3)",
  fontWeight: 600,
  flexShrink: 0,
};

const commentBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--text-1)",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const commentActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 5,
};

const actionBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--text-3)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const viewRepliesBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
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
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderTop: "1px solid var(--border-2)",
  borderLeft: "1px solid var(--border-1)",
  borderRight: "1px solid var(--border-1)",
  boxShadow: "0 -24px 48px rgba(0,0,0,0.6)",
};

const signInBtnStyle: CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 16,
  border: "none",
  background: "#2563eb",
  color: "var(--text-1)",
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
  color: "var(--text-2)",
  fontSize: 12,
  fontWeight: 800,
};

const cancelReplyBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "none",
  background: "var(--surface-3)",
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
  background: "var(--surface-3)",
  border: "1.5px solid var(--border-3)",
  borderRadius: 22,
  color: "var(--text-1)",
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
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

export default function EventCommentsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)" }} />}>
      <EventCommentsPageInner />
    </Suspense>
  );
}
