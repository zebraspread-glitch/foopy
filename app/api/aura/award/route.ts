import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";
import { awardAura } from "@/app/lib/aura";
import { awardCoins } from "@/app/lib/coins";

const REFERRAL_COINS = 250;
const MAX_PAID_REFERRALS = 10;

/**
 * A referred user only pays out their referrer once they've genuinely
 * engaged — here, after viewing their first live game. Capped at
 * MAX_PAID_REFERRALS per referrer and deduped per referred user.
 */
async function completeReferralIfEligible(userId: string) {
  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("referred_by, referral_paid")
    .eq("id", userId)
    .maybeSingle();

  const referrer = (profile as any)?.referred_by as string | null;
  const paid = (profile as any)?.referral_paid as boolean | undefined;
  if (!referrer || paid) return;

  // Enforce the lifetime cap on the referrer's paid referrals.
  const { count } = await supabaseServer
    .from("coin_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referrer)
    .eq("event_type", "referral");

  if ((count ?? 0) < MAX_PAID_REFERRALS) {
    await awardCoins(referrer, "referral", userId, REFERRAL_COINS);
  }

  // Mark resolved either way so we don't re-check on every future live view.
  await supabaseServer
    .from("profiles")
    .update({ referral_paid: true })
    .eq("id", userId);
}

type AuraEventType =
  | "comment_post"
  | "like_given"
  | "like_received"
  | "daily_login"
  | "live_game_view";

type AwardRequest = {
  event_type?: string;
  related_id?: string;
};

const SUPPORTED_EVENTS = new Set<AuraEventType>([
  "comment_post",
  "like_given",
  "like_received",
  "daily_login",
  "live_game_view",
]);

function isAuraEventType(value: string): value is AuraEventType {
  return SUPPORTED_EVENTS.has(value as AuraEventType);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getComment(commentId: string) {
  const { data, error } = await supabaseServer
    .from("feed_comments")
    .select("id, user_id")
    .eq("id", commentId)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; user_id: string } | null;
}

async function hasLike(commentId: string, userId: string) {
  const { count, error } = await supabaseServer
    .from("feed_comment_likes")
    .select("comment_id", { count: "exact", head: true })
    .eq("comment_id", commentId)
    .eq("user_id", userId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

async function isLiveGame(gameId: string) {
  if (!/^\d+$/.test(gameId)) return false;

  const res = await fetch(`https://api.squiggle.com.au/?q=games;game=${gameId}`, {
    headers: { "User-Agent": "Foopy AFL App (foopy.app)" },
    next: { revalidate: 30 },
  });

  if (!res.ok) return false;
  const data = await res.json();
  const game = data?.games?.[0];
  if (!game) return false;

  const complete = Number(game.complete ?? 0);
  return complete > 0 && complete < 100 && game.is_final !== 1;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as AwardRequest | null;
  const eventType = String(body?.event_type ?? "");
  const requestedRelatedId = String(body?.related_id ?? "");

  if (!eventType || !requestedRelatedId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!isAuraEventType(eventType)) {
    return NextResponse.json({ error: "Unsupported aura event" }, { status: 400 });
  }

  try {
    let targetUserId = user.id;
    let relatedId = requestedRelatedId;

    if (eventType === "comment_post") {
      const comment = await getComment(requestedRelatedId);
      if (!comment || comment.user_id !== user.id) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }
    }

    if (eventType === "like_given" || eventType === "like_received") {
      const [comment, liked] = await Promise.all([
        getComment(requestedRelatedId),
        hasLike(requestedRelatedId, user.id),
      ]);

      if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      if (!liked) return NextResponse.json({ error: "Like not found" }, { status: 400 });

      if (eventType === "like_received") {
        if (comment.user_id === user.id) {
          return NextResponse.json({ awarded: false, amount: 0, reason: "own_comment" });
        }
        targetUserId = comment.user_id;
      }
    }

    // These events are capped to once per day per user. Dedup is keyed on
    // (user, event_type, related_id), so using today's date as the related_id
    // means only the first qualifying action each day is awarded. The validation
    // above still runs, so the comment/like must genuinely exist.
    if (
      eventType === "daily_login" ||
      eventType === "comment_post" ||
      eventType === "like_given"
    ) {
      relatedId = todayKey();
    }

    if (eventType === "live_game_view") {
      const live = await isLiveGame(requestedRelatedId);
      if (!live) {
        return NextResponse.json({ awarded: false, amount: 0, reason: "not_live" });
      }
    }

    const result = await awardAura(targetUserId, eventType, relatedId, undefined, token);

    // Viewing a live game is the engagement gate that releases a referral
    // payout to whoever referred this user. Non-fatal.
    if (eventType === "live_game_view") {
      try {
        await completeReferralIfEligible(user.id);
      } catch (e) {
        console.error("[aura/award] referral completion failed", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[aura/award]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to award aura" }, { status: 500 });
  }
}
