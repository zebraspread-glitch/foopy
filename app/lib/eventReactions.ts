export type EventReactionKind = "emoji" | "meme" | "foopy" | "sticker" | "player" | "team";

export type EventReactionCategoryId =
  | "favorites"
  | "hype"
  | "funny"
  | "shock"
  | "sad"
  | "goat"
  | "afl"
  | "support";

export type EventReactionDefinition = {
  id: string;
  glyph: string;
  label: string;
  category: Exclude<EventReactionCategoryId, "favorites">;
  kind: EventReactionKind;
  accent?: string;
  assetUrl?: string;
  animatedAssetUrl?: string;
  team?: string;
  playerId?: string;
};

export const EVENT_REACTION_CATEGORIES: { id: EventReactionCategoryId; label: string; glyph: string }[] = [
  { id: "favorites", label: "Favorites", glyph: "\u2B50" },
  { id: "hype", label: "Hype", glyph: "\u{1F525}" },
  { id: "funny", label: "Funny", glyph: "\u{1F602}" },
  { id: "shock", label: "Shock", glyph: "\u{1F62E}" },
  { id: "sad", label: "Sad", glyph: "\u{1F62D}" },
  { id: "goat", label: "Goat", glyph: "\u{1F410}" },
  { id: "afl", label: "AFL", glyph: "\u{1F3C9}" },
  { id: "support", label: "Support", glyph: "\u2764\uFE0F" },
];

export const EVENT_REACTION_OPTIONS: EventReactionDefinition[] = [
  { id: "\u{1F525}", glyph: "\u{1F525}", label: "Fire", category: "hype", kind: "emoji", accent: "#f97316" },
  { id: "\u26A1", glyph: "\u26A1", label: "Electric", category: "hype", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F6A8}", glyph: "\u{1F6A8}", label: "Siren", category: "hype", kind: "emoji", accent: "#ef4444" },
  { id: "\u{1F4A5}", glyph: "\u{1F4A5}", label: "Boom", category: "hype", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F680}", glyph: "\u{1F680}", label: "Launch", category: "hype", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1F4C8}", glyph: "\u{1F4C8}", label: "Rising", category: "hype", kind: "emoji", accent: "#22c55e" },
  { id: "foopy_clutch", glyph: "CL", label: "Clutch", category: "hype", kind: "foopy", accent: "#f59e0b" },
  { id: "foopy_cooked", glyph: "CO", label: "Cooked", category: "hype", kind: "meme", accent: "#fb923c" },
  { id: "foopy_lift", glyph: "UP", label: "Lift", category: "hype", kind: "foopy", accent: "#22c55e" },
  { id: "foopy_chaos", glyph: "!!", label: "Chaos", category: "hype", kind: "meme", accent: "#ef4444" },

  { id: "\u{1F602}", glyph: "\u{1F602}", label: "Crying Laugh", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F923}", glyph: "\u{1F923}", label: "Rolling", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F480}", glyph: "\u{1F480}", label: "Dead", category: "funny", kind: "emoji", accent: "#a3a3a3" },
  { id: "\u{1F921}", glyph: "\u{1F921}", label: "Clown", category: "funny", kind: "emoji", accent: "#f43f5e" },
  { id: "\u{1FAE0}", glyph: "\u{1FAE0}", label: "Melting", category: "funny", kind: "emoji", accent: "#f59e0b" },
  { id: "\u{1F643}", glyph: "\u{1F643}", label: "Upside Down", category: "funny", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1F600}", glyph: "\u{1F600}", label: "Grin", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F603}", glyph: "\u{1F603}", label: "Big Smile", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F604}", glyph: "\u{1F604}", label: "Beaming", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F606}", glyph: "\u{1F606}", label: "Cracking Up", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F605}", glyph: "\u{1F605}", label: "Sweating", category: "funny", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1F609}", glyph: "\u{1F609}", label: "Cheeky", category: "funny", kind: "emoji", accent: "#f472b6" },
  { id: "\u{1F61C}", glyph: "\u{1F61C}", label: "Tongue Out", category: "funny", kind: "emoji", accent: "#f472b6" },
  { id: "\u{1F61D}", glyph: "\u{1F61D}", label: "Wild", category: "funny", kind: "emoji", accent: "#f472b6" },
  { id: "\u{1F60E}", glyph: "\u{1F60E}", label: "Cool", category: "funny", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1F92D}", glyph: "\u{1F92D}", label: "Giggle", category: "funny", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F92B}", glyph: "\u{1F92B}", label: "Shush", category: "funny", kind: "emoji", accent: "#a78bfa" },
  { id: "\u{1FAE2}", glyph: "\u{1FAE2}", label: "Oops", category: "funny", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F92A}", glyph: "\u{1F92A}", label: "Silly", category: "funny", kind: "emoji", accent: "#f59e0b" },
  { id: "\u{1F911}", glyph: "\u{1F911}", label: "Money", category: "funny", kind: "emoji", accent: "#22c55e" },
  { id: "\u{1F910}", glyph: "\u{1F910}", label: "Zip It", category: "funny", kind: "emoji", accent: "#94a3b8" },
  { id: "\u{1F914}", glyph: "\u{1F914}", label: "Thinking", category: "funny", kind: "emoji", accent: "#fbbf24" },
  { id: "\u{1F644}", glyph: "\u{1F644}", label: "Eye Roll", category: "funny", kind: "emoji", accent: "#94a3b8" },
  { id: "\u{1F633}", glyph: "\u{1F633}", label: "Flushed", category: "funny", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F973}", glyph: "\u{1F973}", label: "Party", category: "funny", kind: "emoji", accent: "#f472b6" },
  { id: "\u{1F920}", glyph: "\u{1F920}", label: "Cowboy", category: "funny", kind: "emoji", accent: "#f59e0b" },
  { id: "\u{1F9CD}", glyph: "\u{1F9CD}", label: "Standing There", category: "funny", kind: "emoji", accent: "#94a3b8" },
  { id: "\u{1F9CE}", glyph: "\u{1F9CE}", label: "Begging", category: "funny", kind: "emoji", accent: "#a78bfa" },
  { id: "\u{1F335}", glyph: "\u{1F335}", label: "Dry", category: "funny", kind: "emoji", accent: "#22c55e" },
  { id: "\u{1F35E}", glyph: "\u{1F35E}", label: "Bread", category: "funny", kind: "emoji", accent: "#f59e0b" },
  { id: "foopy_sold", glyph: "SO", label: "Sold Candy", category: "funny", kind: "meme", accent: "#a78bfa" },
  { id: "foopy_no_way", glyph: "NW", label: "No Way", category: "funny", kind: "meme", accent: "#f472b6" },
  { id: "foopy_banter", glyph: "HA", label: "Banter", category: "funny", kind: "meme", accent: "#facc15" },

  { id: "\u{1F62E}", glyph: "\u{1F62E}", label: "Shocked", category: "shock", kind: "emoji", accent: "#60a5fa" },
  { id: "\u{1F92F}", glyph: "\u{1F92F}", label: "Mind Blown", category: "shock", kind: "emoji", accent: "#a78bfa" },
  { id: "\u{1F631}", glyph: "\u{1F631}", label: "Screaming", category: "shock", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1F440}", glyph: "\u{1F440}", label: "Eyes", category: "shock", kind: "emoji", accent: "#e5e7eb" },
  { id: "\u{1F62C}", glyph: "\u{1F62C}", label: "Tense", category: "shock", kind: "emoji", accent: "#fbbf24" },
  { id: "foopy_review", glyph: "RV", label: "Review It", category: "shock", kind: "foopy", accent: "#38bdf8" },
  { id: "foopy_unreal", glyph: "UN", label: "Unreal", category: "shock", kind: "meme", accent: "#c084fc" },
  { id: "foopy_moment", glyph: "MO", label: "Moment", category: "shock", kind: "foopy", accent: "#fbbf24" },

  { id: "\u{1F62D}", glyph: "\u{1F62D}", label: "Crying", category: "sad", kind: "emoji", accent: "#60a5fa" },
  { id: "\u{1F494}", glyph: "\u{1F494}", label: "Heartbreak", category: "sad", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F622}", glyph: "\u{1F622}", label: "Sad", category: "sad", kind: "emoji", accent: "#93c5fd" },
  { id: "\u{1FAE5}", glyph: "\u{1FAE5}", label: "Empty", category: "sad", kind: "emoji", accent: "#94a3b8" },
  { id: "\u{1F629}", glyph: "\u{1F629}", label: "Pain", category: "sad", kind: "emoji", accent: "#c4b5fd" },
  { id: "foopy_bottle", glyph: "BT", label: "Bottled", category: "sad", kind: "meme", accent: "#64748b" },
  { id: "foopy_rough", glyph: "RG", label: "Rough", category: "sad", kind: "foopy", accent: "#60a5fa" },

  { id: "\u{1F410}", glyph: "\u{1F410}", label: "GOAT", category: "goat", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F451}", glyph: "\u{1F451}", label: "King", category: "goat", kind: "emoji", accent: "#fbbf24" },
  { id: "\u{1F3C6}", glyph: "\u{1F3C6}", label: "Trophy", category: "goat", kind: "emoji", accent: "#f59e0b" },
  { id: "\u2B50", glyph: "\u2B50", label: "Star", category: "goat", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F48E}", glyph: "\u{1F48E}", label: "Diamond", category: "goat", kind: "emoji", accent: "#67e8f9" },
  { id: "foopy_mvp", glyph: "MVP", label: "MVP", category: "goat", kind: "foopy", accent: "#facc15" },
  { id: "foopy_aura", glyph: "AU", label: "Aura", category: "goat", kind: "foopy", accent: "#22c55e" },

  { id: "\u{1F3C9}", glyph: "\u{1F3C9}", label: "Footy", category: "afl", kind: "emoji", accent: "#a16207" },
  { id: "\u{1F3AF}", glyph: "\u{1F3AF}", label: "Dead Eye", category: "afl", kind: "emoji", accent: "#ef4444" },
  { id: "\u{1F3C1}", glyph: "\u{1F3C1}", label: "Finish", category: "afl", kind: "emoji", accent: "#e5e7eb" },
  { id: "\u{1F4A8}", glyph: "\u{1F4A8}", label: "Pace", category: "afl", kind: "emoji", accent: "#7dd3fc" },
  { id: "foopy_goal", glyph: "G", label: "Goal", category: "afl", kind: "foopy", accent: "#22c55e" },
  { id: "foopy_behind", glyph: "B", label: "Behind", category: "afl", kind: "foopy", accent: "#f8fafc" },
  { id: "foopy_mark", glyph: "MK", label: "Mark", category: "afl", kind: "foopy", accent: "#38bdf8" },
  { id: "foopy_tackle", glyph: "TK", label: "Tackle", category: "afl", kind: "foopy", accent: "#ef4444" },
  { id: "foopy_ball", glyph: "BA", label: "Ball", category: "afl", kind: "meme", accent: "#f59e0b" },

  { id: "\u2764\uFE0F", glyph: "\u2764\uFE0F", label: "Love", category: "support", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F44F}", glyph: "\u{1F44F}", label: "Clap", category: "support", kind: "emoji", accent: "#fbbf24" },
  { id: "\u{1F64C}", glyph: "\u{1F64C}", label: "Raise", category: "support", kind: "emoji", accent: "#facc15" },
  { id: "\u{1F4AA}", glyph: "\u{1F4AA}", label: "Strong", category: "support", kind: "emoji", accent: "#22c55e" },
  { id: "\u{1FAF6}", glyph: "\u{1FAF6}", label: "Respect", category: "support", kind: "emoji", accent: "#fb7185" },
  { id: "\u{1F91D}", glyph: "\u{1F91D}", label: "Agree", category: "support", kind: "emoji", accent: "#38bdf8" },
  { id: "\u{1FAE1}", glyph: "\u{1FAE1}", label: "Salute", category: "support", kind: "emoji", accent: "#c084fc" },
  { id: "foopy_respect", glyph: "RS", label: "Respect", category: "support", kind: "foopy", accent: "#22c55e" },
];

export const EVENT_REACTION_FAVORITE_IDS = [
  "\u{1F525}",
  "\u{1F923}",
  "\u{1F62D}",
  "\u{1F410}",
  "\u{1F9CD}",
  "foopy_clutch",
  "\u{1F3C9}",
  "\u2764\uFE0F",
  "foopy_mvp",
];

export const EVENT_REACTION_RECENTS_STORAGE_KEY = "foopy_event_reaction_recent_ids";
export const EVENT_REACTION_BY_ID = new Map(EVENT_REACTION_OPTIONS.map((reaction) => [reaction.id, reaction]));
export const EVENT_REACTION_IDS = EVENT_REACTION_OPTIONS.map((reaction) => reaction.id);
export const EVENT_REACTION_ID_SET = new Set(EVENT_REACTION_IDS);

export function isSupportedEventReaction(reactionId: string) {
  return EVENT_REACTION_ID_SET.has(reactionId);
}

export function getEventReactionDefinition(reactionId: string) {
  return EVENT_REACTION_BY_ID.get(reactionId);
}

export function getEventReactionGlyph(reactionId: string) {
  return getEventReactionDefinition(reactionId)?.glyph ?? reactionId;
}

export function getEventReactionLabel(reactionId: string) {
  return getEventReactionDefinition(reactionId)?.label ?? "Reaction";
}

export function eventReactionRank(reactionId: string) {
  const index = EVENT_REACTION_IDS.indexOf(reactionId);
  return index === -1 ? 999 : index;
}
