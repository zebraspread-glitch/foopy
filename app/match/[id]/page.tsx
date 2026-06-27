"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, MessageCircle, Smile } from "lucide-react";
import matchStatsJson from "@/app/data/game-stats.json";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";
import teamStatsJson from "@/app/data/team-stats.json";
import playerStatsJson from "@/app/data/players.json";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { lookupVenue } from "@/app/data/venues";
import WinnerPick from "./components/WinnerPick";
import DuelsTab from "./components/DuelsTab";
import { teamColors, matchupBarColors } from "./utils";
import { supabase } from "@/app/lib/supabase";
import { surname } from "@/app/lib/format";
import { getGamesCached } from "@/app/lib/gameCache";
import { createNotification, notifyMentions } from "@/app/lib/notifications";
import MentionTextarea from "@/app/components/MentionTextarea";
import CommentText from "@/app/components/CommentText";
import StickerPicker from "@/app/components/StickerPicker";
import MiniAvatar from "@/app/components/MiniAvatar";
import SendArrowIcon from "@/app/components/SendArrowIcon";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
import {
  EVENT_REACTION_RECENTS_STORAGE_KEY,
  eventReactionRank,
  getEventReactionDefinition,
  isValidReactionEmoji,
} from "@/app/lib/eventReactions";
import { loadEmojiCategories, isEmojiRenderable, type EmojiCategory } from "@/app/lib/emojiCategories";
import {
  QUARTER_SCORE_DISPLAY_KEY,
  normalizeQuarterScoreDisplay,
  type QuarterScoreDisplayMode,
} from "@/app/lib/quarterScoreDisplay";

import type {
  TabKey,
  SortKey,
  StatMode,
  MatchGame,
  PlayerStat,
  SavedMatchStats,
  LiveEvent,
} from "./types";

import {
  getStatus,
  getAbbr,
  getLogo,
  scoreText,
  statValue,
  num,
  getApiSportsGameId,
  findPlayerByApiSportsId,
  findPlayerByEventId,
  foopyRating,
  eventQuarter,
  teamColor,
} from "./utils";
import { foopyColor } from "@/app/lib/foopyRating";

const API_TEAM_ID_BY_NAME: Record<string, number> = {
  Adelaide: 1,
  "Adelaide Crows": 1,
  Brisbane: 2,
  "Brisbane Lions": 2,
  Carlton: 3,
  Collingwood: 4,
  Essendon: 5,
  Fremantle: 6,
  Geelong: 7,
  "Geelong Cats": 7,
  Hawthorn: 8,
  "Hawthorn Hawks": 8,
  Melbourne: 9,
  "Melbourne Demons": 9,
  "North Melbourne": 10,
  "North Melbourne Kangaroos": 10,
  "Port Adelaide": 11,
  "Port Adelaide Power": 11,
  Richmond: 12,
  "Richmond Tigers": 12,
  "St Kilda": 13,
  "St Kilda Saints": 13,
  Sydney: 14,
  "Sydney Swans": 14,
  "West Coast": 15,
  "West Coast Eagles": 15,
  "Western Bulldogs": 16,
  "Gold Coast": 17,
  "Gold Coast Suns": 17,
  GWS: 18,
  "GWS Giants": 18,
  "Greater Western Sydney": 18,
  "Greater Western Sydney Giants": 18,
};

const API_TEAM_NAME_BY_ID: Record<number, string> = Object.fromEntries(
  Object.entries(API_TEAM_ID_BY_NAME).map(([name, apiId]) => [apiId, name])
) as Record<number, string>;

type EventReactionSummary = { emoji: string; count: number };
type EventReactionMap = Record<string, EventReactionSummary[]>;
type MyEventReactionMap = Record<string, string[]>;
type EventReactionPopupState = { eventKey: string; label: string } | null;

function normaliseMyReactionMap(value: unknown): MyEventReactionMap {
  if (!value || typeof value !== "object") return {};

  const map: MyEventReactionMap = {};
  for (const [eventKey, reactions] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(reactions)) {
      const selected = reactions.filter((emoji): emoji is string => typeof emoji === "string" && isValidReactionEmoji(emoji));
      if (selected.length > 0) map[eventKey] = [selected[0]];
    } else if (typeof reactions === "string" && isValidReactionEmoji(reactions)) {
      map[eventKey] = [reactions];
    }
  }
  return map;
}

function getEventReactionVisitorId() {
  if (typeof window === "undefined") return "";

  try {
    const key = "foopy_event_reaction_visitor_id";
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function sortEventReactionSummaries(reactions: EventReactionSummary[]) {
  return [...reactions].sort((a, b) => b.count - a.count || eventReactionRank(a.emoji) - eventReactionRank(b.emoji));
}

function totalReactionCount(reactions: EventReactionSummary[] | undefined) {
  return (reactions ?? []).reduce((total, reaction) => total + reaction.count, 0);
}

function compactCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function optimisticEventReactionMap(
  current: EventReactionMap,
  eventKey: string,
  emoji: string,
  previousEmoji?: string
) {
  const counts: Record<string, number> = {};
  for (const reaction of current[eventKey] ?? []) {
    counts[reaction.emoji] = reaction.count;
  }

  if (previousEmoji) {
    counts[previousEmoji] = Math.max(0, (counts[previousEmoji] ?? 0) - 1);
  }

  if (previousEmoji !== emoji) {
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }

  const nextReactions = sortEventReactionSummaries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([emoji, count]) => ({ emoji, count }))
  );

  const nextMap = { ...current };
  if (nextReactions.length > 0) nextMap[eventKey] = nextReactions;
  else delete nextMap[eventKey];
  return nextMap;
}

function safeText(value: any, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text || fallback;
  }

  if (typeof value === "object") {
    const nested =
      value.name ??
      value.fullName ??
      value.displayName ??
      value.playerName ??
      value.player?.name ??
      (value.firstname && value.lastname ? `${value.firstname} ${value.lastname}` : undefined) ??
      (value.firstName && value.lastName ? `${value.firstName} ${value.lastName}` : undefined);

    if (nested != null) return safeText(nested, fallback);

    const id = value.id ?? value.playerId ?? value.player_id;
    const number = value.number ?? value.jumperNumber ?? value.jumper_number;

    if (id != null && number != null) return `Player ${id} #${number}`;
    if (id != null) return `Player ${id}`;
    if (number != null) return `Player #${number}`;
  }

  return fallback;
}

// When true, unidentified players show their raw ID (admin-only, so the admin
// can map it). Set once on mount from NEXT_PUBLIC_ADMIN_USER_ID. Everyone else
// sees a generic "{Nickname} Player" label instead of an internal ID.
let adminPlayerView = false;

const TEAM_NICKNAME: Record<string, string> = {
  adelaide: "Crows", brisbane: "Lions", carlton: "Blues", collingwood: "Magpies",
  essendon: "Bombers", fremantle: "Dockers", geelong: "Cats", goldcoast: "Suns",
  gws: "Giants", hawthorn: "Hawks", melbourne: "Demons", northmelbourne: "Kangaroos",
  portadelaide: "Power", richmond: "Tigers", stkilda: "Saints", sydney: "Swans",
  westcoast: "Eagles", westernbulldogs: "Bulldogs",
};
function nicknameForTeam(team: any): string {
  return TEAM_NICKNAME[canonicalTeamKey(safeText(team, ""))] ?? "";
}

function safePlayerName(value: any, fallbackId?: any, team?: any) {
  const name = safeText(value, "");
  if (name) return name;
  // Unidentified player. Non-admins see "{Nickname} Player"; the admin keeps
  // the raw ID so it can be mapped into players.json.
  const nick = nicknameForTeam(team);
  if (!adminPlayerView && nick) return `${nick} Player`;
  const fallbackText = safeText(fallbackId, "");
  if (fallbackText) return `Player ${fallbackText}`;
  return nick ? `${nick} Player` : "Unknown";
}

function useCompactViewport(maxWidth = 520) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [maxWidth]);

  return compact;
}

const MATCH_SCROLL_RANGE   = 160;  // px of scroll to fully collapse (spec)
const HEADER_MAX_H         = 200;  // expanded header height
const HEADER_MIN_H         = 72;   // compact header height (room for 2 lines)
const HEADER_COLLAPSE      = HEADER_MAX_H - HEADER_MIN_H;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function matchScrollProgress(scrollY: number) {
  return clamp01(scrollY / MATCH_SCROLL_RANGE);
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * clamp01(progress);
}
function easeOut(t: number) { const c = clamp01(t); return 1 - (1 - c) * (1 - c); }
function easeIn(t: number) { const c = clamp01(t); return c * c; }
function easeInOut(t: number) { const c = clamp01(t); return c < 0.5 ? 2 * c * c : 1 - (-2 * c + 2) ** 2 / 2; }

function liveFeedTeamColors(team: any) {
  const key = String(team || "").toLowerCase().trim();

  const map: Record<string, { primary: string; secondary: string; tertiary?: string; text: string }> = {
    // Adelaide: Navy → Yellow → Red
    adelaide:        { primary: "#002b5c", secondary: "#facc15", tertiary: "#dc2626", text: "#ffffff" },
    "adelaide crows": { primary: "#002b5c", secondary: "#facc15", tertiary: "#dc2626", text: "#ffffff" },
    // Brisbane: Maroon → Blue → Yellow
    brisbane:        { primary: "#8b1a2e", secondary: "#1d4ed8", tertiary: "#facc15", text: "#ffffff" },
    "brisbane lions": { primary: "#8b1a2e", secondary: "#1d4ed8", tertiary: "#facc15", text: "#ffffff" },
    // Carlton: Navy (solid)
    carlton:         { primary: "#002b5c", secondary: "#002b5c", text: "#ffffff" },
    // Collingwood: Black → White
    collingwood:     { primary: "#272731", secondary: "#ffffff", text: "#14141e" },
    // Essendon: Red → Black
    essendon:        { primary: "#ef4444", secondary: "#272731", text: "#14141e" },
    // Fremantle: Purple → White
    fremantle:       { primary: "#7c3aed", secondary: "#ffffff", text: "#ffffff" },
    // Geelong: Navy → White
    geelong:         { primary: "#1e40af", secondary: "#ffffff", text: "#14141e" },
    "geelong cats":  { primary: "#1e40af", secondary: "#ffffff", text: "#14141e" },
    // Gold Coast: Red (solid)
    "gold coast":    { primary: "#ef4444", secondary: "#ef4444", text: "#ffffff" },
    "gold coast suns": { primary: "#ef4444", secondary: "#ef4444", text: "#ffffff" },
    // GWS: Orange → White
    gws:                          { primary: "#f97316", secondary: "#ffffff", text: "#14141e" },
    "gws giants":                 { primary: "#f97316", secondary: "#ffffff", text: "#14141e" },
    "greater western sydney":     { primary: "#f97316", secondary: "#ffffff", text: "#14141e" },
    "greater western sydney giants": { primary: "#f97316", secondary: "#ffffff", text: "#14141e" },
    // Hawthorn: Yellow → Brown
    hawthorn:        { primary: "#f59e0b", secondary: "#78350f", text: "#14141e" },
    "hawthorn hawks": { primary: "#f59e0b", secondary: "#78350f", text: "#14141e" },
    // Melbourne: Red → Navy
    melbourne:           { primary: "#ef4444", secondary: "#1e40af", text: "#ffffff" },
    "melbourne demons":  { primary: "#ef4444", secondary: "#1e40af", text: "#ffffff" },
    // North Melbourne: Blue → White
    "north melbourne":             { primary: "#1d4ed8", secondary: "#ffffff", text: "#ffffff" },
    "north melbourne kangaroos":   { primary: "#1d4ed8", secondary: "#ffffff", text: "#ffffff" },
    // Port Adelaide: Black → Teal
    "port adelaide":       { primary: "#272731", secondary: "#06b6d4", text: "#14141e" },
    "port adelaide power": { primary: "#272731", secondary: "#06b6d4", text: "#14141e" },
    // Richmond: Black → Yellow
    richmond:        { primary: "#272731", secondary: "#facc15", text: "#14141e" },
    "richmond tigers": { primary: "#272731", secondary: "#facc15", text: "#14141e" },
    // St Kilda: Red → White → Black
    "st kilda":      { primary: "#ef4444", secondary: "#ffffff", tertiary: "#272731", text: "#ffffff" },
    "st kilda saints": { primary: "#ef4444", secondary: "#ffffff", tertiary: "#272731", text: "#ffffff" },
    // Sydney: White → Red
    sydney:          { primary: "#ffffff", secondary: "#ef4444", text: "#ffffff" },
    "sydney swans":  { primary: "#ffffff", secondary: "#ef4444", text: "#ffffff" },
    // West Coast: Blue → Yellow
    "west coast":        { primary: "#1d4ed8", secondary: "#facc15", text: "#14141e" },
    "west coast eagles": { primary: "#1d4ed8", secondary: "#facc15", text: "#14141e" },
    // Western Bulldogs: Blue → White → Red
    "western bulldogs": { primary: "#2563eb", secondary: "#ffffff", tertiary: "#ef4444", text: "#ffffff" },
  };

  return map[key] ?? { primary: "#1f2937", secondary: "#94a3b8", text: "#ffffff" };
}

function teamNameFromEvent(event: LiveEvent) {
  const apiTeamId = Number(event.teamId);
  return Number.isFinite(apiTeamId) ? API_TEAM_NAME_BY_ID[apiTeamId] ?? "" : "";
}

function normaliseTeamKey(team: any) {
  return safeText(team, "").toLowerCase().replace(/[^a-z]/g, "");
}

function teamsMatch(a: any, b: any) {
  const ak = canonicalTeamKey(safeText(a, ""));
  const bk = canonicalTeamKey(safeText(b, ""));
  return !!ak && !!bk && ak === bk;
}

function scoreBasedEventKey(team: any, homeScore: any, awayScore: any, type: any) {
  const safeTeam = normaliseTeamKey(team);
  const home = Number(homeScore);
  const away = Number(awayScore);
  const safeType = safeText(type, "").toUpperCase();

  if (!safeTeam || !Number.isFinite(home) || !Number.isFinite(away) || !safeType) return "";
  if (home + away <= 0) return "";
  return `score_${safeTeam}_${home}_${away}_${safeType}`;
}

function scoreBasedEventKeyAliases(team: any, homeScore: any, awayScore: any, type: any) {
  const key = scoreBasedEventKey(team, homeScore, awayScore, type);
  if (!key) return [];

  const aliases = [key];
  const safeType = safeText(type, "").toUpperCase();
  if (safeType === "GOAL" || safeType === "BEHIND" || safeType === "SCORE") {
    const genericKey = scoreBasedEventKey(team, homeScore, awayScore, "SCORE");
    if (genericKey) aliases.push(genericKey);
  }

  return Array.from(new Set(aliases));
}

function eventScoreBasedKey(event: LiveEvent) {
  if (event.type === "QUARTER_BREAK") return "";
  const type = safeText(event.type, "").toUpperCase();
  if (type !== "GOAL" && type !== "BEHIND" && type !== "SCORE") return "";

  const team = safeText((event as any).teamName || teamNameFromEvent(event), "");
  return scoreBasedEventKey(team, event.homeScore, event.awayScore, type);
}

function scoreEventKey(event: LiveEvent, index = 0) {
  return eventKeyAliases(event, index)[0];
}

// Stable per-event identity for "new event" glow tracking. Unlike
// scoreEventKey(), this must NOT depend on the event's position in the
// array — new events are prepended to the feed, which shifts every other
// event's index each poll and would otherwise mark all of them "new".
function stableEventIdentityKey(event: LiveEvent, index = 0) {
  if (event.type === "QUARTER_BREAK") return `quarterbreak_${(event as any).label ?? index}`;
  const team = safeText((event as any).teamName || teamNameFromEvent(event), "");
  const base = `q${eventQuarter(event)}_m${event.minute ?? 0}_t${event.type ?? ""}`;
  if (event.playerId != null) return `${base}_p${event.playerId}`;
  if (team) return `${base}_team${team}`;
  return eventScoreBasedKey(event) || `${base}_i${index}`;
}

// Persists which feed events a user has already seen for a given game, so
// the "new event" glow survives reloads and only fires for events that
// appeared since the user's last visit.
function seenEventsStorageKey(gameId: string) {
  return `foopy_seen_events_${gameId}`;
}

function loadSeenEventKeys(gameId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenEventsStorageKey(gameId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenEventKeys(gameId: string, keys: Set<string>) {
  try {
    // Cap to avoid unbounded localStorage growth over a long game.
    localStorage.setItem(seenEventsStorageKey(gameId), JSON.stringify(Array.from(keys).slice(-300)));
  } catch {
    // ignore (e.g. private browsing / storage disabled)
  }
}

function eventKeyAliases(event: LiveEvent, index = 0) {
  const team = safeText((event as any).teamName || teamNameFromEvent(event), "");
  const aliases = [
    (event as any).displayEventKey,
    (event as any).optimisticKey,
    eventScoreBasedKey(event),
    ...scoreBasedEventKeyAliases(team, event.homeScore, event.awayScore, event.type),
    (event as any).rowKey,
    `q${eventQuarter(event)}_m${event.minute ?? 0}_t${event.type ?? ""}_p${(event as any).playerId ?? index}`,
    `q${eventQuarter(event)}_m${event.minute ?? 0}_t${event.type ?? ""}_team${event.teamId ?? ""}_p${(event as any).playerId ?? ""}_i${index}`,
    event.playerId != null ? `q${eventQuarter(event)}_m${event.minute ?? 0}_t${event.type ?? ""}_p${event.playerId}` : "",
  ];

  return Array.from(new Set(aliases.map((key) => safeText(key, "")).filter(Boolean)));
}

// Mirrors stableEventKey() on the event page so the match page looks up
// comments under the EXACT same key the event page stores them under.
// IMPORTANT: the player-identity key (q{quarter}_m{min}_t{type}_p{playerId})
// is preferred because it's stable across live→final — score-based keys only
// appear once the game finishes and would not match comments made live.
function canonicalKeyForEvent(event: LiveEvent, index = 0): string {
  const keys = eventKeyAliases(event, index);
  return (
    // Prefer the player-identity key (q{quarter}_m{min}_t{type}_p{playerId}) —
    // it's stable across live→final, unlike score-based keys which only appear
    // once the game finishes.
    keys.find((key) => /^qQ?\d.*_p\d+$/.test(key)) ??
    keys.find((key) => key.startsWith("player_")) ??
    keys.find((key) => key.startsWith("score_") && key.endsWith("_SCORE")) ??
    keys.find((key) => key.startsWith("score_")) ??
    keys.find((key) => !key.startsWith("feed_")) ??
    keys[0] ?? ""
  );
}

function commentCountForEvent(counts: Record<string, number>, event: LiveEvent, index = 0) {
  // Primary: the canonical key (what the event page stores under).
  const canonical = canonicalKeyForEvent(event, index);
  if ((counts[canonical] ?? 0) > 0) return counts[canonical];
  // Fallback: any alias that has comments (covers legacy keys).
  return eventKeyAliases(event, index).reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function commentKeyForEvent(counts: Record<string, number>, event: LiveEvent, index = 0) {
  // Always navigate/look up under the canonical key so storage and read agree.
  const canonical = canonicalKeyForEvent(event, index);
  if (canonical) return canonical;
  const aliases = eventKeyAliases(event, index);
  return aliases.find((key) => (counts[key] ?? 0) > 0) ?? aliases[0];
}

function liveFeedEventMeta(event: LiveEvent, index: number, homeTeam: any, awayTeam: any) {
  const inferredTeam = safeText((event as any).teamName, "");
  const apiTeam = teamNameFromEvent(event);
  const eventTeam = safeText(inferredTeam || apiTeam, "");
  const player = findPlayerForLiveEvent(event, safeText(homeTeam, ""), safeText(awayTeam, ""));
  const team = safeText(eventTeam || player?.club || player?.team, "");
  const name = ((event as any).optimistic || (event as any).inferred)
    ? team || "Team"
    : safePlayerName(player?.name || event.playerName, event.playerId || index + 1);
  const type = safeText(event.type, "").toUpperCase();

  return {
    aliases: eventKeyAliases(event, index),
    label: `${name} - ${type}`,
    minute: String(event.minute ?? ""),
    name,
    quarter: eventQuarter(event),
    team,
    type,
  };
}

function eventIdentityKey(event: LiveEvent) {
  return [
    event.period ?? "",
    event.minute ?? "",
    event.type ?? "",
    event.teamId ?? "",
    event.playerId ?? "",
    event.homeScore ?? "",
    event.awayScore ?? "",
  ].join("|");
}

function formatTimestr(timestr?: string) {
  const t = safeText(timestr, "").toLowerCase();
  if (!t) return "";
  if (t.startsWith("1/4") || t.includes("quarter time")) return "QTR TIME";
  if (t.startsWith("1/2") || t.includes("half time")) return "HALF TIME";
  if (t.startsWith("3/4") || t.includes("three quarter")) return "3QTR TIME";
  if (t.startsWith("full time") || t.includes("full time")) return "FULL TIME";
  // "Q2 14:32" → keep as-is but uppercase
  return safeText(timestr, "").toUpperCase();
}

function clockFromTimestr(timestr?: string) {
  const text = safeText(timestr, "");
  const qMatch = text.match(/Q\s*(\d+)/i);
  const minuteMatch = text.match(/(\d+):\d+/);

  return {
    period: qMatch ? Number(qMatch[1]) : undefined,
    minute: minuteMatch ? Number(minuteMatch[1]) : undefined,
  };
}


function latestFeedScore(events: LiveEvent[], homeTeam?: string, awayTeam?: string) {
  const event = events.find(
    (e) =>
      e.type !== "QUARTER_BREAK" &&
      Number.isFinite(Number(e.homeScore)) &&
      Number.isFinite(Number(e.awayScore))
  );

  if (event) {
    return {
      home: Number(event.homeScore),
      away: Number(event.awayScore),
    };
  }

  if (!homeTeam || !awayTeam) return null;

  let home = 0;
  let away = 0;

  for (const e of events) {
    const type = safeText(e.type, "").toUpperCase();
    const points = type === "GOAL" ? 6 : type === "BEHIND" ? 1 : 0;
    if (!points) continue;

    const eventTeam = safeText((e as any).teamName || teamNameFromEvent(e), "");
    if (teamsMatch(eventTeam, homeTeam)) home += points;
    else if (teamsMatch(eventTeam, awayTeam)) away += points;
  }

  return { home, away };
}

function eventBelongsToMatch(event: LiveEvent, homeTeam: string, awayTeam: string) {
  if (event.type === "QUARTER_BREAK") return true;

  const apiTeam = teamNameFromEvent(event);
  const inferredTeam = safeText((event as any).teamName, "");
  const player = findPlayerForLiveEvent(event);
  const playerTeam = safeText(player?.club || player?.team, "");
  const isMatchTeam = (team: string) => teamsMatch(team, homeTeam) || teamsMatch(team, awayTeam);

  const candidateTeams = [apiTeam, inferredTeam, playerTeam].filter(Boolean);
  if (candidateTeams.length === 0) return true;
  return candidateTeams.some(isMatchTeam);
}

function resolvedEventTeam(event: LiveEvent) {
  const player = findPlayerForLiveEvent(event);
  return safeText((event as any).teamName || teamNameFromEvent(event) || player?.club || player?.team, "");
}

function slugName(name: any) {
  return safeText(name, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PLAYER_IMAGE_ID_OVERRIDES: Record<string, string> = {
  joshuarachele: "joshrachele",
  lachlanschultz: "lachieschultz",
  lachlansullivan: "lachiesullivan",
  samuelwicks: "samwicks",
  zacharywilliams: "zacwilliams",
};

function cleanPlayerName(value: any) {
  return safeText(value, "")
    .replace(/\s*(?:Â·|·|\|)\s*(GOAL|BEHIND|SCORE|MARK|KICK|HANDBALL|TACKLE|HITOUT|CLEARANCE)\s*$/i, "")
    .trim();
}

function idList(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const id = Number(value);
  return Number.isFinite(id) ? [id] : [];
}

function playerMatchesLiveId(player: any, id: unknown) {
  const target = Number(id);
  if (!Number.isFinite(target)) return false;

  return (
    Number(player?.apiSportsId) === target ||
    idList(player?.eventIds).includes(target) ||
    idList(player?.statsIds).includes(target)
  );
}

function findPlayerBySharedEventIdOnTeam(sourcePlayer: any, team: string) {
  const sourceEventIds = idList(sourcePlayer?.eventIds);
  if (!sourceEventIds.length || !team) return null;

  return (playerStatsJson as any[]).find((player) => {
    if (player === sourcePlayer) return false;
    if (!teamsMatch(playerTeamName(player), team)) return false;
    const eventIds = idList(player?.eventIds);
    return eventIds.some((id) => sourceEventIds.includes(id));
  }) ?? null;
}

function playerTeamName(player: any) {
  return safeText(player?.club || player?.team, "");
}

function eventPrimaryTeam(event: LiveEvent) {
  return safeText((event as any).teamName || teamNameFromEvent(event), "");
}

function findPlayerByNameOnTeam(name: string, team: string) {
  const rawName = name.toLowerCase().replace(/[^a-z]/g, "");
  if (!rawName || !team) return null;
  return (playerStatsJson as any[]).find((player) => {
    if (!teamsMatch(playerTeamName(player), team)) return false;
    const pName = safeText(player?.name ?? player?.player, "").toLowerCase().replace(/[^a-z]/g, "");
    return pName && (pName === rawName || pName.includes(rawName) || rawName.includes(pName));
  }) ?? null;
}

function findPlayerForLiveEvent(event: LiveEvent, homeTeam?: string, awayTeam?: string) {
  const target = Number(event.playerId);
  const eventTeam = eventPrimaryTeam(event);
  const rawName = safeText(event.playerName, "").toLowerCase().replace(/[^a-z]/g, "");

  // Helper: is this player on a team currently playing in the match?
  const isMatchPlayer = (player: any) =>
    (homeTeam && teamsMatch(playerTeamName(player), homeTeam)) ||
    (awayTeam && teamsMatch(playerTeamName(player), awayTeam)) ||
    (eventTeam && teamsMatch(playerTeamName(player), eventTeam));

  if (!Number.isFinite(target)) {
    // No player ID — fall back to name+team lookup only
    if (rawName && eventTeam) return findPlayerByNameOnTeam(rawName, eventTeam);
    return null;
  }

  const candidates = (playerStatsJson as any[]).filter((player) => playerMatchesLiveId(player, target));

  if (candidates.length === 1) {
    const onlyCandidate = candidates[0];
    if (isMatchPlayer(onlyCandidate)) return onlyCandidate;

    // The API can reuse IDs across clubs. If the direct ID hits the wrong team,
    // rescue by name or by a shared event ID on the actual scoring team.
    if (rawName && eventTeam) {
      const byName = findPlayerByNameOnTeam(rawName, eventTeam);
      if (byName) return byName;
    }

    if (eventTeam) {
      const bySharedEventId = findPlayerBySharedEventIdOnTeam(onlyCandidate, eventTeam);
      if (bySharedEventId) return bySharedEventId;
    }

    if (homeTeam || awayTeam || eventTeam) return null;
    return onlyCandidate;
  }

  if (candidates.length > 1) {
    // 1. Prefer candidate on the event's scoring team
    if (eventTeam) {
      const teamPlayer = candidates.find((p) => teamsMatch(playerTeamName(p), eventTeam));
      if (teamPlayer) return teamPlayer;
    }

    // 2. Prefer candidate by player name
    if (rawName) {
      const namePlayer = candidates.find((p) => {
        const pName = safeText(p?.name ?? p?.player, "").toLowerCase().replace(/[^a-z]/g, "");
        return pName && (pName === rawName || pName.includes(rawName) || rawName.includes(pName));
      });
      if (namePlayer) return namePlayer;
    }

    // 3. Keep only candidates from the match — eliminates unrelated teams sharing an ID
    const matchCandidates = candidates.filter(isMatchPlayer);
    if (matchCandidates.length === 1) return matchCandidates[0];
    if (matchCandidates.length > 1) return matchCandidates[0];
  }

  // candidates.length === 0 OR all candidates are wrong-team:
  // Try name+team lookup as a rescue — catches cases where API sends wrong player ID
  if (rawName && eventTeam) {
    const byName = findPlayerByNameOnTeam(rawName, eventTeam);
    if (byName) return byName;
  }

  // Last resort: if the lone/first candidate is from the wrong team and we have match teams,
  // return null so the event renders as a team event instead of the wrong player
  if (candidates.length > 0 && (homeTeam || awayTeam)) {
    const first = candidates[0];
    if (!isMatchPlayer(first)) return null;
    return first;
  }

  return candidates[0] ?? null;
}

function clubToPlayerFolder(club: any) {
  const map: Record<string, string> = {
    Adelaide: "crows",
    "Adelaide Crows": "crows",
    Brisbane: "lions",
    "Brisbane Lions": "lions",
    Carlton: "blues",
    Collingwood: "magpies",
    Essendon: "bombers",
    Fremantle: "dockers",
    Geelong: "cats",
    "Geelong Cats": "cats",
    "Gold Coast": "suns",
    "Gold Coast Suns": "suns",
    GWS: "giants",
    "GWS Giants": "giants",
    "Greater Western Sydney": "giants",
    "Greater Western Sydney Giants": "giants",
    Hawthorn: "hawks",
    "Hawthorn Hawks": "hawks",
    Melbourne: "demons",
    "Melbourne Demons": "demons",
    "North Melbourne": "kangaroos",
    "North Melbourne Kangaroos": "kangaroos",
    "Port Adelaide": "power",
    "Port Adelaide Power": "power",
    Richmond: "tigers",
    "Richmond Tigers": "tigers",
    "St Kilda": "saints",
    "St Kilda Saints": "saints",
    Sydney: "swans",
    "Sydney Swans": "swans",
    "West Coast": "eagles",
    "West Coast Eagles": "eagles",
    "Western Bulldogs": "bulldogs",
    Bulldogs: "bulldogs",
  };

  const safeClub = safeText(club, "");
  return map[safeClub] ?? slugName(safeClub);
}

function getInitials(name: any) {
  const parts = safeText(name, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function findPlayerInfo(name: any, team?: any) {
  const safeName = cleanPlayerName(name).toLowerCase().trim();
  const safeTeam = safeText(team, "");

  const matches = (playerStatsJson as any[]).filter(
    (p) => {
      const aliases = Array.isArray(p.aliases) ? p.aliases : [];
      return [p.name, p.player, ...aliases].some((alias) => String(alias || "").toLowerCase().trim() === safeName);
    }
  );

  if (safeTeam) {
    const teamMatch = matches.find((player) => teamsMatch(playerTeamName(player), safeTeam));
    if (teamMatch) return teamMatch;
  }

  return matches[0];
}

function playerClub(name: any) {
  return findPlayerInfo(name)?.club ?? "";
}

function playerImagePath(name: any, team?: any) {
  const safeName = cleanPlayerName(safePlayerName(name, ""));
  const found = findPlayerInfo(safeName, team);
  const club = safeText(team || found?.club || found?.team, "");
  const folder = clubToPlayerFolder(club);
  const imageId = PLAYER_IMAGE_ID_OVERRIDES[slugName(found?.name || found?.player || safeName)] ?? slugName(found?.name || found?.player || safeName);
  const image = found?.image || found?.imagePath || found?.playerImage || `${imageId}.png`;

  if (!folder || !image) return "";
  if (String(image).startsWith("/")) return String(image);
  if (/^https?:\/\//.test(String(image))) return String(image);
  return `${PLAYER_IMG_BASE}/${folder}/${image}`;
}

function playerFreesFor(player: PlayerStat) {
  return num(player.freesFor ?? player.frees ?? player.ff ?? player.freeKicksFor);
}

function fantasyPoints(p: PlayerStat): number {
  return (
    num(p.kicks)         * 3 +
    num(p.handballs)     * 2 +
    num(p.marks)         * 3 +
    num(p.tackles)       * 4 +
    num(p.freesFor)      * 1 +
    num(p.freesAgainst)  * -3 +
    num(p.hitouts)       * 1 +
    num(p.goals)         * 6 +
    num(p.behinds)       * 1
  );
}

// ── Configurable player-stats columns ───────────────────────────────────────
// The Player and (sticky) avatar columns are always shown; these are the stat
// columns the user can choose between via "Edit stat columns".
// Sticky leading column widths, tuned so the default 8 stat columns all fit on
// a phone (avatar + name + 8 stats stay within ~360px, no horizontal scroll).
const AVATAR_COL_W = 52;
const NAME_COL_W = 70;
type StatColumnDef = { id: SortKey; label: string; full: string; width: number; render: (p: PlayerStat) => React.ReactNode };
const STAT_COLUMNS: StatColumnDef[] = [
  { id: "goals",        label: "G.B", full: "Goals · Behinds", width: 38, render: (p) => `${statValue(p.goals)}.${statValue(p.behinds)}` },
  { id: "disposals",    label: "D",   full: "Disposals",       width: 29, render: (p) => statValue(p.disposals) },
  { id: "kicks",        label: "K",   full: "Kicks",           width: 29, render: (p) => statValue(p.kicks) },
  { id: "handballs",    label: "H",   full: "Handballs",       width: 29, render: (p) => statValue(p.handballs) },
  { id: "marks",        label: "M",   full: "Marks",           width: 29, render: (p) => statValue(p.marks) },
  { id: "tackles",      label: "T",   full: "Tackles",         width: 29, render: (p) => statValue(p.tackles) },
  { id: "hitouts",      label: "HO",  full: "Hit-outs",        width: 31, render: (p) => statValue(p.hitouts) },
  { id: "goalAssists",  label: "GA",  full: "Goal assists",    width: 29, render: (p) => statValue((p as any).goalAssists ?? 0) },
  { id: "fantasy",      label: "FP",  full: "Fantasy points",  width: 38, render: (p) => fantasyPoints(p) },
  { id: "clearances",   label: "CLR", full: "Clearances",      width: 36, render: (p) => statValue(p.clearances) },
  { id: "freesFor",     label: "FF",  full: "Frees for",       width: 30, render: (p) => statValue(p.freesFor) },
  { id: "freesAgainst", label: "FA",  full: "Frees against",   width: 30, render: (p) => statValue(p.freesAgainst) },
];
const DEFAULT_STAT_COLS: SortKey[] = ["goals", "disposals", "kicks", "handballs", "marks", "tackles", "hitouts", "goalAssists"];
const STAT_COLS_KEY = "foopy_stat_columns";

function loadStatCols(): SortKey[] {
  try {
    const raw = localStorage.getItem(STAT_COLS_KEY);
    if (!raw) return DEFAULT_STAT_COLS;
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return DEFAULT_STAT_COLS;
    const valid = ids.filter((id: any) => STAT_COLUMNS.some((c) => c.id === id));
    return valid.length ? valid : DEFAULT_STAT_COLS;
  } catch {
    return DEFAULT_STAT_COLS;
  }
}
function saveStatCols(ids: SortKey[]) {
  try { localStorage.setItem(STAT_COLS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

function numericValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getFoopyValue(player: PlayerStat): number | null {
  const savedFoopy = numericValue(player.foopy);
  if (savedFoopy !== null && (hasStatLine(player) || savedFoopy !== 0)) return savedFoopy;
  if (!hasStatLine(player)) return null;
  return foopyRating(player);
}

function getSortValue(player: PlayerStat, key: SortKey) {
  if (key === "foopy") {
    return getFoopyValue(player) ?? 0;
  }

  if (key === "goals") return num(player.goals) * 100 + num(player.behinds);

  if (key === "goalAssists") {
    return num((player as any).goalAssists);
  }

  if (key === "fantasy") return fantasyPoints(player);

  return num((player as any)[key]);
}

function getApiPlayerId(player: any) {
  return (
    player?.player?.id ??
    player?.player?.player_id ??
    player?.player?.playerId ??
    player?.id ??
    player?.player_id ??
    player?.playerId ??
    null
  );
}

function normalizeSavedPlayer(player: any, team?: string): PlayerStat {
  const raw = player?.stats ?? player ?? {};

  const possibleId =
    player?.apiSportsPlayerId ??
    player?.apiSportsId ??
    player?.playerId ??
    player?.player_id ??
    player?.id ??
    player?.player?.id ??
    String(player?.player || "").match(/Player\s+(\d+)/i)?.[1] ??
    String(player?.name || "").match(/Player\s+(\d+)/i)?.[1];

  const mapped = findPlayerByApiSportsId(possibleId);
  const resolvedTeam = safeText(mapped?.club ?? mapped?.team ?? player?.team ?? team, "");
  const unidentified = !mapped && !safeText(player?.name ?? player?.player, "");
  const name = safePlayerName(mapped?.name ?? player?.name ?? player?.player, possibleId, resolvedTeam);

  return {
    player: name,
    name,
    team: resolvedTeam,
    unidentified,
    foopy: raw.foopy ?? player?.foopy,
    goals: raw.goals?.total ?? raw.goals ?? player?.goals?.total ?? player?.goals ?? 0,
goalAssists: raw.goals?.assists ?? raw.goalAssists ?? player?.goals?.assists ?? player?.goalAssists ?? 0,
behinds: raw.behinds ?? player?.behinds ?? 0,
    kicks: raw.kicks ?? player?.kicks ?? 0,
    handballs: raw.handballs ?? player?.handballs ?? 0,
    disposals: raw.disposals ?? player?.disposals ?? ((raw.kicks ?? player?.kicks ?? 0) + (raw.handballs ?? player?.handballs ?? 0)),
    marks: raw.marks ?? player?.marks ?? 0,
    tackles: raw.tackles ?? player?.tackles ?? 0,
    hitouts: raw.hitouts ?? player?.hitouts ?? 0,
    inside50s: raw.inside50s ?? player?.inside50s ?? 0,
    clearances: raw.clearances ?? player?.clearances ?? 0,
    clangers: raw.clangers ?? player?.clangers ?? 0,
    rebound50s: raw.rebound50s ?? player?.rebound50s ?? 0,
    freesFor:
  raw.free_kicks?.for ??
  raw.freesFor ??
  raw.frees ??
  raw.ff ??
  raw.freeKicksFor ??
  player?.free_kicks?.for ??
  player?.freesFor ??
  player?.frees ??
  0,

freesAgainst:
  raw.free_kicks?.against ??
  raw.freesAgainst ??
  raw.fa ??
  raw.freeKicksAgainst ??
  player?.free_kicks?.against ??
  player?.freesAgainst ??
  player?.fa ??
  0,
    fantasy: raw.fantasy ?? raw.af ?? player?.fantasy ?? player?.af ?? 0,
    supercoach: raw.supercoach ?? raw.sc ?? player?.supercoach ?? player?.sc ?? 0,
    af: raw.af ?? raw.fantasy ?? player?.af ?? player?.fantasy ?? 0,
    sc: raw.sc ?? raw.supercoach ?? player?.sc ?? player?.supercoach ?? 0,
  };
}

function normalizeApiSportsPlayer(player: any, team: string): PlayerStat {
  const apiPlayerId = getApiPlayerId(player);
  const mapped = findPlayerByApiSportsId(apiPlayerId);

  // Pass the RAW name (empty when unidentified) so normalizeSavedPlayer can
  // apply the nickname/admin-ID fallback rather than baking in "Player {id}".
  const rawName =
    mapped?.name ||
    player?.player?.name ||
    player?.name ||
    (player?.player?.firstname && player?.player?.lastname
      ? `${player.player.firstname} ${player.player.lastname}`
      : "") ||
    "";

  return normalizeSavedPlayer(
    {
      name: rawName,
      player: rawName,
      apiSportsId: apiPlayerId,
      team: mapped?.club ?? mapped?.team ?? team,
      stats: {
        goals: player?.goals?.total ?? player?.goals ?? 0,
goalAssists: player?.goals?.assists ?? player?.goalAssists ?? 0,
behinds: player?.behinds ?? 0,
        disposals: player?.disposals ?? 0,
        kicks: player?.kicks ?? 0,
        handballs: player?.handballs ?? 0,
        marks: player?.marks ?? 0,
        tackles: player?.tackles ?? 0,
        hitouts: player?.hitouts ?? 0,
        inside50s: player?.insides50 ?? player?.inside50s ?? 0,
        clearances: player?.clearances ?? 0,
        clangers: player?.clangers ?? 0,
        rebound50s: player?.rebounds50 ?? player?.rebound50s ?? 0,
        freesFor: player?.free_kicks?.for ?? 0,
        freesAgainst: player?.free_kicks?.against ?? 0,
      },
    },
    mapped?.club ?? mapped?.team ?? team
  );
}

function formatMatchTime(date?: string) {
  if (!date) return "Time TBA";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Time TBA";
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

function formatRecord(raw: string) {
  const parts = raw.split("-");
  if (parts.length < 2) return raw;
  return parts[2] ? `${parts[0]}-${parts[1]}-${parts[2]}` : `${parts[0]}-${parts[1]}`;
}

// True if the player has any recorded stat line for this game — i.e. they
// actually played. Used to decide whether to show a rating (which can now be
// as low as -1) versus nothing at all for players with no data yet.
function hasStatLine(p: PlayerStat): boolean {
  return (
    num(p.disposals) + num(p.kicks) + num(p.handballs) + num(p.marks) +
    num(p.tackles) + num(p.hitouts) + num(p.goals) + num(p.behinds) +
    num(p.clearances) + playerFreesFor(p) + num(p.freesAgainst ?? p.fa ?? p.freeKicksAgainst) > 0
  );
}

const TEAM_NICKNAMES: Record<string, string> = {
  "Adelaide": "Crows", "Adelaide Crows": "Crows",
  "Brisbane": "Lions", "Brisbane Lions": "Lions",
  "Carlton": "Blues",
  "Collingwood": "Magpies",
  "Essendon": "Bombers",
  "Fremantle": "Dockers",
  "Geelong": "Cats", "Geelong Cats": "Cats",
  "Gold Coast": "Suns", "Gold Coast Suns": "Suns",
  "GWS": "Giants", "GWS Giants": "Giants", "Greater Western Sydney": "Giants", "Greater Western Sydney Giants": "Giants",
  "Hawthorn": "Hawks", "Hawthorn Hawks": "Hawks",
  "Melbourne": "Demons", "Melbourne Demons": "Demons",
  "North Melbourne": "Kangaroos", "North Melbourne Kangaroos": "Kangaroos",
  "Port Adelaide": "Power", "Port Adelaide Power": "Power",
  "Richmond": "Tigers", "Richmond Tigers": "Tigers",
  "St Kilda": "Saints", "St Kilda Saints": "Saints",
  "Sydney": "Swans", "Sydney Swans": "Swans",
  "West Coast": "Eagles", "West Coast Eagles": "Eagles",
  "Western Bulldogs": "Bulldogs",
};

function getTeamNickname(name: string): string {
  return TEAM_NICKNAMES[name] ?? name;
}

function toTeamSlug(name: string): string {
  const overrides: Record<string, string> = {
    "Greater Western Sydney": "gws", "GWS Giants": "gws",
    "Brisbane": "brisbanelions", "Geelong Cats": "geelong",
  };
  return overrides[name] ?? name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type QuarterScore = { goals: number; behinds: number; total: number };
type QuarterScoreSet = { home: (QuarterScore | null)[]; away: (QuarterScore | null)[] };

function quarterScoreDelta(current: QuarterScore, previous: QuarterScore | null | undefined): QuarterScore {
  const prev = previous ?? { goals: 0, behinds: 0, total: 0 };
  return {
    goals: Math.max(0, current.goals - prev.goals),
    behinds: Math.max(0, current.behinds - prev.behinds),
    total: Math.max(0, current.total - prev.total),
  };
}

function formatQuarterScore(
  current: QuarterScore,
  previous: QuarterScore | null | undefined,
  displayMode: QuarterScoreDisplayMode,
) {
  const score = displayMode === "total" || displayMode === "totalGb"
    ? current
    : quarterScoreDelta(current, previous);
  return displayMode === "totalGb" || displayMode === "quarterGb"
    ? `${score.goals}.${score.behinds}`
    : String(score.total);
}

function QuarterScoresTable({
  quarterScores, hteam, ateam, currentPeriod, isLoading, displayMode = "total",
}: {
  quarterScores: QuarterScoreSet | null;
  hteam: string;
  ateam: string;
  currentPeriod: number;
  isLoading?: boolean;
  displayMode?: QuarterScoreDisplayMode;
}) {
  const labels = ["Q1", "Q2", "Q3", "Q4"];

  const cols = labels.map((lbl, i) => ({
    lbl,
    home: quarterScores?.home[i] ?? null,
    homePrev: i > 0 ? quarterScores?.home[i - 1] ?? null : null,
    away: quarterScores?.away[i] ?? null,
    awayPrev: i > 0 ? quarterScores?.away[i - 1] ?? null : null,
  }));

  const placeholder = (
    <span style={{
      display: "inline-block", width: 20, height: 14, borderRadius: 4,
      background: "var(--border-2)", opacity: 0.6,
      animation: "qstats-pulse 1.2s ease-in-out infinite",
    }} />
  );

  const sep = "1px solid var(--border-2)";

  return (
    <div style={{ background: "var(--surface-2)", border: "none", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: `44px repeat(${cols.length}, 1fr)` }}>

        {/* Header row */}
        <div style={{ borderBottom: sep }} />
        {cols.map(c => (
          <div key={c.lbl} style={{
            textAlign: "center", padding: "10px 0 8px",
            fontWeight: 800, fontSize: 12, color: "var(--text-3)",
            letterSpacing: "0.05em", textTransform: "uppercase",
            borderBottom: sep, borderLeft: sep,
          }}>
            {c.lbl}
          </div>
        ))}

        {/* Home row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0", borderBottom: sep }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <img src={getLogo(hteam)} alt={hteam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        {cols.map((c, i) => (
          <div key={i} style={{ textAlign: "center", padding: "12px 6px", borderBottom: sep, borderLeft: sep }}>
            {c.home
              ? <span style={{ fontWeight: 800, fontSize: 17, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                  {formatQuarterScore(c.home, c.homePrev, displayMode)}
                </span>
              : isLoading
                ? placeholder
                : <span style={{ color: "var(--text-3)", fontSize: 14 }}>—</span>
            }
          </div>
        ))}

        {/* Away row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <img src={getLogo(ateam)} alt={ateam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        {cols.map((c, i) => (
          <div key={i} style={{ textAlign: "center", padding: "12px 6px", borderLeft: sep }}>
            {c.away
              ? <span style={{ fontWeight: 800, fontSize: 17, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                  {formatQuarterScore(c.away, c.awayPrev, displayMode)}
                </span>
              : isLoading
                ? placeholder
                : <span style={{ color: "var(--text-3)", fontSize: 14 }}>—</span>
            }
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes qstats-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

function TeamScore({ team, record }: { team: any; record?: string }) {
  const safeTeam = safeText(team, "");
  const accent = teamColor(safeTeam);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 0, width: "100%" }}>
      <Link href={`/team/${toTeamSlug(safeTeam)}`} className="match-anim-team-logo" style={{ textDecoration: "none", flexShrink: 0, display: "block", transformOrigin: "top center" }}>
        <div style={{
          width: "clamp(72px, 16vw, 104px)", height: "clamp(72px, 16vw, 104px)",
          borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          boxShadow: `0 18px 40px ${accent}30, 0 4px 18px rgba(0,0,0,.45)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img src={getLogo(safeTeam)} alt={safeTeam} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      </Link>
      <div className="match-anim-team-detail" style={{
        fontSize: "clamp(13px, 3.2vw, 17px)", fontWeight: 900, color: "#f4f4f5",
        textAlign: "center", lineHeight: 1.2, maxWidth: "100%",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        textShadow: "0 2px 14px rgba(0,0,0,.65)",
      }}>
        {getTeamNickname(safeTeam)}
      </div>
      {record && (
        <div className="match-anim-team-detail" style={{
          fontSize: "clamp(11px, 2.4vw, 13px)", fontWeight: 700,
          color: "rgba(255,255,255,0.55)", letterSpacing: "0.02em", whiteSpace: "nowrap",
        }}>
          {record}
        </div>
      )}
    </div>
  );
}

function timeUntilStart(date?: string, now = Date.now()) {
  if (!date) return "Time TBA";
  const start = new Date(date).getTime();
  if (Number.isNaN(start)) return "Time TBA";
  const diff = start - now;
  if (diff <= 0) return "Starting soon";

  const totalMinutes = Math.ceil(diff / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `${days}d ${hours}h`;
  if (totalHours <= 0) return `${minutes}m`;
  return `${totalHours}h ${minutes}m`;
}

function PlayerAvatar({ name, team, size = 48, rating, ratingColor, isBest, unidentified }: { name: any; team?: any; size?: number; rating?: number | string | null; ratingColor?: string; isBest?: boolean; unidentified?: boolean }) {
  const safeName = safePlayerName(name, "");
  const safeTeam = safeText(team, "");
  const [failed, setFailed] = useState(false);
  // Unidentified players have no photo to show — use the club logo as the avatar.
  const src = unidentified ? "" : playerImagePath(safeName, safeTeam);
  const colours = teamColors(safeTeam || playerClub(safeName));
  const bg = colours.primary;
  const border = colours.secondary;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const logo = getLogo(safeTeam);
  // Badges scale down with the avatar so small table avatars stay clean.
  const small = size <= 40;
  const badgeFont = small ? 7.5 : 9.5;
  const badgeMinW = small ? 14 : 19;
  const badgePad = small ? "0 1.5px" : "1px 3px";
  const badgeBorder = small ? 1 : 1.5;
  const badgeOffset = small ? -1 : -2;
  // Mid tier (the player-stats table, size 44) gets a smaller logo than the
  // larger feed-card avatars (size 56) — same proportions, just dialed back.
  const logoSize = small ? 10 : size <= 50 ? 17 : 22;
  const starSize = small ? 6 : 9;
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: size, height: size, zIndex: 1 }}>
      <span
        style={{
          ...playerAvatarWrapStyle,
          width: size,
          height: size,
          background: `${bg}80`,
        }}
      >
        {unidentified && logo ? (
          <img src={logo} alt={safeTeam} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : !failed && src ? (
          <Image
            key={src}
            src={src}
            alt={safeName}
            fill
            sizes={`${size}px`}
            style={playerAvatarImageStyle}
            onError={() => setFailed(true)}
          />
        ) : (
          <span style={{ ...playerInitialsStyle, fontSize: size < 44 ? 12 : 15 }}>{getInitials(safeName)}</span>
        )}
      </span>
      {!unidentified && logo && (
        <img src={logo} alt="" style={{ position: "absolute", bottom: badgeOffset, right: badgeOffset, width: logoSize, height: logoSize, borderRadius: "50%", background: "var(--bg)", border: `${badgeBorder}px solid var(--bg)`, objectFit: "contain", pointerEvents: "none" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      {rating !== undefined && rating !== null && (
        <span style={{
          position: "absolute", bottom: badgeOffset, left: badgeOffset, zIndex: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
          minWidth: badgeMinW, padding: badgePad, borderRadius: small ? 4 : 5,
          background: ratingColor ?? "var(--surface-3)",
          border: `${badgeBorder}px solid var(--bg)`,
          color: "var(--text-1)", fontWeight: 900, fontSize: badgeFont,
          textAlign: "center", lineHeight: small ? 1.25 : 1.4,
          pointerEvents: "none",
        }}>
          {isBest && (
            <svg width={starSize} height={starSize} viewBox="0 0 24 24" fill="#fff" style={{ flexShrink: 0 }}>
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
            </svg>
          )}
          {rating}
        </span>
      )}
    </span>
  );
}

function TeamEventAvatar({ team }: { team: any }) {
  const safeTeam = safeText(team, "Team");
  const colours = teamColors(safeTeam);
  const logo = getLogo(safeTeam);

  return (
    <span style={{ ...playerAvatarWrapStyle, background: `${colours.primary}80` }}>
      {logo ? (
        <img src={logo} alt={safeTeam} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <span style={playerInitialsStyle}>{getInitials(safeTeam)}</span>
      )}
    </span>
  );
}

function LiveFeedPlayer({
  event,
  isNew,
  homeTeam,
  awayTeam,
  commentCount,
  topComment,
  playerFP,
  playerFoopy,
  playerDisposals,
  playerGoals,
  playerTackles,
  playerMarks,
  playerHitouts,
  reactions,
  myReactions,
  onCommentClick,
  onOpenReactionPopup,
}: {
  event: LiveEvent;
  isNew?: boolean;
  homeTeam: any;
  awayTeam: any;
  eventKey?: string;
  commentCount?: number;
  topComment?: { body: string; username: string; avatar: string | null };
  playerFP?: number | null;
  playerFoopy?: number | null;
  playerDisposals?: number | null;
  playerGoals?: number | null;
  playerTackles?: number | null;
  playerMarks?: number | null;
  playerHitouts?: number | null;
  reactions?: EventReactionSummary[];
  myReactions?: string[];
  onCommentClick?: () => void;
  onOpenReactionPopup?: () => void;
}) {
  const isInferred = Boolean((event as any).optimistic) || Boolean((event as any).inferred);
  const inferredTeam = safeText((event as any).teamName, "");
  const apiEventTeam = teamNameFromEvent(event);
  const eventTeam = safeText(inferredTeam || apiEventTeam, "");
  const player = findPlayerForLiveEvent(event, safeText(homeTeam, ""), safeText(awayTeam, ""));
  const team = safeText(eventTeam || player?.club || player?.team, "");
  const unidentified = !isInferred && !player && !safeText(event.playerName, "");
  const playerName = isInferred ? team : safePlayerName(player?.name || event.playerName, event.playerId, team);
  const colours = liveFeedTeamColors(team);

  const type = safeText(event.type, "event").toUpperCase();
  // A GOAL event is, by definition, at least the player's first goal — so the
  // box must never read "0 GOALS" on a goal, even if an upstream stat snapshot
  // lagged behind the score. Clamp goals up to 1 for goal events only.
  const goalsShown = type === "GOAL" ? Math.max(playerGoals ?? 0, 1) : (playerGoals ?? 0);
  // Third stat on the box: whichever peripheral the player has the most of —
  // tackles (T), marks (M) or hitouts (HO). Ties fall back in that order.
  const peripheral = (() => {
    const t = playerTackles ?? 0, m = playerMarks ?? 0, h = playerHitouts ?? 0;
    let value = t, label = "T";
    if (m > value) { value = m; label = "M"; }
    if (h > value) { value = h; label = "HO"; }
    return { value, label };
  })();
  const selectedReactionSet = new Set(myReactions ?? []);
  const sortedReactions = sortEventReactionSummaries(reactions ?? []);
  const reactionTotal = totalReactionCount(sortedReactions);
  const hasReacted = selectedReactionSet.size > 0;
  const topReactionEmojis = sortedReactions.slice(0, 3);
  const myReactionId = (myReactions ?? []).find(isValidReactionEmoji);

  // Floating-emoji burst + chip pop when the user's reaction changes.
  const prevReactionRef = useRef<string | undefined>(undefined);
  const [bursts, setBursts] = useState<{ id: number; glyph: string }[]>([]);
  const [chipPop, setChipPop] = useState(false);
  useEffect(() => {
    const prev = prevReactionRef.current;
    prevReactionRef.current = myReactionId;
    if (prev === undefined || !myReactionId || myReactionId === prev) return; // skip mount + clears
    const glyph = getEventReactionDefinition(myReactionId)?.glyph ?? myReactionId;
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, glyph }]);
    setChipPop(true);
    const t1 = setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 900);
    const t2 = setTimeout(() => setChipPop(false), 340);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [myReactionId]);

  // Top-reaction animation mode (Settings → Reaction Animation).
  const [reactionAnim, setReactionAnim] = useState<"off" | "hover" | "ghostly">("hover");
  useEffect(() => {
    const read = () => {
      try {
        const v = localStorage.getItem("foopy_reaction_anim");
        setReactionAnim(v === "off" || v === "ghostly" ? v : "hover");
      } catch { /* ignore */ }
    };
    read();
    window.addEventListener("foopy-settings-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("foopy-settings-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return (
    <div
      onClick={onCommentClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCommentClick?.();
        }
      }}
      style={{
        background: colours.tertiary
          ? `linear-gradient(135deg, ${colours.primary}, ${colours.secondary}, ${colours.tertiary})`
          : `linear-gradient(135deg, ${colours.primary}, ${colours.secondary})`,
        padding: 2,
        borderRadius: 20,
        cursor: "pointer",
      }}
    >
      <div className={isNew ? "feed-event-new-glow" : undefined} style={{
        background: "var(--surface-1)",
        border: "none",
        borderRadius: 18,
        overflow: "hidden",
      }}>
        {/* Main event row */}
        <div style={{
          ...liveFeedBoxStyle,
          background: "transparent",
          border: "none",
          borderRadius: 0,
          minHeight: type === "BEHIND" ? 56 : liveFeedBoxStyle.minHeight,
          padding: type === "BEHIND" ? "12px 16px 12px 14px" : liveFeedBoxStyle.padding,
        }}>
          {isInferred ? (
            <TeamEventAvatar team={team} />
          ) : (
            <PlayerAvatar
              name={playerName}
              team={team}
              size={56}
              unidentified={unidentified}
            />
          )}

          <div style={liveFeedInfoStyle}>
            <div style={liveFeedNameRowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={liveFeedNameStyle}>{playerName}</div>
              </div>
              <div style={liveFeedTimeBadgeStyle}>
                <span style={liveFeedQuarterStyle}>{eventQuarter(event)}</span>
                <span style={liveFeedTimeDotStyle}>·</span>
                <span style={liveFeedMinuteStyle}>{event.minute ?? "-"}'</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
              <div style={{ ...liveFeedActionStyle, color: type === "GOAL" ? "#22c55e" : type === "BEHIND" ? "#f8fafc" : "#facc15", fontSize: type === "BEHIND" ? 18 : liveFeedActionStyle.fontSize }}>
                {type}
              </div>
              {!isInferred && playerFoopy != null && (
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: 500, lineHeight: 1.4, marginTop: 4 }}>
                  {`${goalsShown} G · ${playerDisposals ?? 0} D · ${peripheral.value} ${peripheral.label}`}
                </span>
              )}
            </div>
          </div>

        </div>

        <div style={eventReactionBarStyle} onClick={(e) => e.stopPropagation()}>
          <span style={{ position: "relative", display: "inline-flex" }}>
          {bursts.length > 0 && (
            <span style={eventReactionBurstLayerStyle} aria-hidden>
              {bursts.map((b) => (
                <span key={b.id} className="reaction-burst" style={eventReactionBurstEmojiStyle}>{b.glyph}</span>
              ))}
            </span>
          )}
          <button
            type="button"
            className="event-reaction-summary"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReactionPopup?.();
            }}
            style={{
              ...eventReactionSummaryButtonStyle,
              ...(chipPop ? { animation: "reaction-chip-pop 0.34s ease" } : null),
            }}
            aria-label={hasReacted ? "Change reaction" : "Add reaction"}
            title={hasReacted ? "Change reaction" : "React"}
          >
            {reactionTotal > 0 ? (
              <>
                <span style={eventReactionLeadStyle}>
                  {hasReacted && myReactionId ? (
                    <span style={{ fontSize: 16, lineHeight: 1 }}>
                      {getEventReactionDefinition(myReactionId)?.glyph ?? myReactionId}
                    </span>
                  ) : (
                    <Smile size={16} strokeWidth={2.6} />
                  )}
                </span>
                <span style={eventReactionSummaryCountStyle}>{compactCount(reactionTotal)}</span>
                <span style={eventReactionSummaryGlyphsStyle}>
                  {topReactionEmojis.map((r, i) => {
                    const def = getEventReactionDefinition(r.emoji);
                    const isCustom = Boolean(def && def.kind !== "emoji");
                    const glyph = def?.glyph ?? r.emoji;
                    const glyphStyle: CSSProperties = {
                      fontSize: isCustom ? 9 : 14,
                      fontWeight: isCustom ? 1000 : undefined,
                      color: isCustom ? def?.accent : undefined,
                      lineHeight: 1,
                    };
                    // Ghostly: keep the real emoji static, add a rising/fading ghost copy on top.
                    if (reactionAnim === "ghostly") {
                      return (
                        <span key={r.emoji} style={{ position: "relative", display: "inline-flex", lineHeight: 1 }}>
                          <span style={glyphStyle}>{glyph}</span>
                          <span
                            aria-hidden
                            className="reaction-ghostly"
                            style={{ ...glyphStyle, position: "absolute", left: 0, top: 0, pointerEvents: "none", animationDelay: `${i * 0.4}s` }}
                          >
                            {glyph}
                          </span>
                        </span>
                      );
                    }
                    return (
                      <span
                        key={r.emoji}
                        className={reactionAnim === "hover" ? "reaction-top-float" : undefined}
                        style={{ ...glyphStyle, animationDelay: `${i * 0.4}s` }}
                      >
                        {glyph}
                      </span>
                    );
                  })}
                </span>
              </>
            ) : (
              <span style={eventReactionSummaryEmptyStyle}>
                <Smile size={15} strokeWidth={2.6} />
                React
              </span>
            )}
          </button>
          </span>

          <span style={eventReactionBarSpacerStyle} />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCommentClick?.();
            }}
            style={eventReactionCommentStyle}
            aria-label="Open comments"
            title="Comments"
          >
            <MessageCircle size={16} strokeWidth={2.3} />
            <span style={commentCountStyle}>{compactCount(commentCount ?? 0)}</span>
          </button>
        </div>

        {/* Top comment preview */}
        {topComment && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 14px 9px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            {topComment.avatar ? (
              <img
                src={topComment.avatar}
                alt={topComment.username}
                style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.6)",
              }}>
                {topComment.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: 12, color: "#fff", lineHeight: 1.4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}>
              {topComment.body}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function EventReactionPopup({
  label,
  myReactions,
  reactions,
  onClose,
  onSelect,
}: {
  label: string;
  myReactions?: string[];
  reactions?: EventReactionSummary[];
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const selectedReactionSet = new Set(myReactions ?? []);
  const myEmoji = (myReactions ?? []).find(isValidReactionEmoji);
  const [recentReactionIds, setRecentReactionIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<EmojiCategory[] | null>(null);
  const [activeCat, setActiveCat] = useState<string>("recents");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const emojiBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(EVENT_REACTION_RECENTS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        setRecentReactionIds(parsed.filter((e) => isValidReactionEmoji(e) && isEmojiRenderable(e)).slice(0, 24));
      }
    } catch {
      setRecentReactionIds([]);
    }
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Lazy-load the full emoji catalogue when the picker opens.
  useEffect(() => {
    let alive = true;
    loadEmojiCategories().then((cats) => {
      if (!alive) return;
      setCategories(cats);
      setActiveCat((prev) => (prev === "recents" && recentReactionIds.length === 0 ? cats[0]?.id ?? "people" : prev));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectReaction(emoji: string) {
    const nextRecentIds = [emoji, ...recentReactionIds.filter((id) => id !== emoji)].slice(0, 24);
    setRecentReactionIds(nextRecentIds);
    try {
      window.localStorage.setItem(EVENT_REACTION_RECENTS_STORAGE_KEY, JSON.stringify(nextRecentIds));
    } catch {
      // Local storage is just a speed boost for the picker.
    }
    onSelect(emoji);
  }

  // Current reactions on this event — the user's own first, then by count.
  const sortedReactions = sortEventReactionSummaries(reactions ?? []);
  const topRow = myEmoji
    ? [...sortedReactions.filter((r) => r.emoji === myEmoji), ...sortedReactions.filter((r) => r.emoji !== myEmoji)]
    : sortedReactions;

  const tabs = [
    ...(recentReactionIds.length ? [{ id: "recents", icon: "\u{1F551}" }] : []),
    ...(categories ?? []).map((c) => ({ id: c.id, icon: c.icon })),
  ];
  const activeEmojis = activeCat === "recents" ? recentReactionIds : (categories?.find((c) => c.id === activeCat)?.emojis ?? []);
  const activeLabel = activeCat === "recents" ? "Recently used" : (categories?.find((c) => c.id === activeCat)?.label ?? "");

  const popup = (
    <div className="event-reaction-backdrop fixed-overlay" style={eventReactionPopupBackdropStyle} onClick={onClose}>
      <div className="event-reaction-panel" style={eventReactionPopupPanelStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Event reactions">
        <div style={eventReactionSheetHandleStyle} />

        {/* Current reactions on this event */}
        {topRow.length > 0 && (
          <div style={eventReactionTopRowStyle}>
            {topRow.map((r) => {
              const mine = r.emoji === myEmoji;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  className="event-reaction-quick"
                  onClick={() => selectReaction(r.emoji)}
                  style={{ ...eventReactionTopChipStyle, ...(mine ? eventReactionTopChipActiveStyle : null) }}
                  aria-label={mine ? "Your reaction" : "React"}
                >
                  <span style={{ fontSize: 19, lineHeight: 1 }}>{getEventReactionDefinition(r.emoji)?.glyph ?? r.emoji}</span>
                  <span style={eventReactionTopChipCountStyle}>{compactCount(r.count)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={eventReactionEmojiSectionLabelStyle}>{activeLabel || "Emoji"}</div>

        <div style={eventReactionEmojiBodyStyle} ref={emojiBodyRef}>
          {categories === null ? (
            <div style={eventReactionEmojiLoadingStyle}>
              <span style={{ width: 22, height: 22, border: "2.5px solid rgba(255,255,255,0.15)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
            </div>
          ) : activeEmojis.length === 0 ? (
            <div style={eventReactionEmojiEmptyStyle}>Nothing here yet</div>
          ) : (
            <div key={activeCat} className="reaction-grid-in" style={eventReactionEmojiGridStyle}>
              {activeEmojis.map((emoji, i) => {
                const active = selectedReactionSet.has(emoji);
                return (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    className="event-reaction-option"
                    onClick={() => selectReaction(emoji)}
                    style={{ ...eventReactionEmojiButtonStyle, ...(active ? eventReactionPopupOptionActiveStyle : null) }}
                    aria-label="React"
                  >
                    <span style={eventReactionEmojiGlyphStyle}>{emoji}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Category bar */}
        <div style={eventReactionCatBarStyle}>
          {tabs.map((tab) => {
            const active = activeCat === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveCat(tab.id); emojiBodyRef.current?.scrollTo({ top: 0 }); }}
                style={{ ...eventReactionCatTabStyle, ...(active ? eventReactionCatTabActiveStyle : null) }}
                aria-pressed={active}
              >
                <span style={{ fontSize: 19, lineHeight: 1 }}>{tab.icon}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(popup, portalTarget) : null;
}

function QuarterBreakFeedBox({ label }: any) {
  const safeLabel = safeText(label, "");
  const isFullTime = safeLabel === "FULL TIME";

  const accentColor = "#f8fafc";
  const pillBg = "var(--border-2)";
  const pillBorder = "var(--border-3)";

  return (
    <div style={qbDividerRowStyle}>
      <div style={{ ...qbLineStyle, background: `linear-gradient(to right, transparent, ${accentColor}22)` }} />
      <div style={{ ...qbPillStyle, background: pillBg, border: `1px solid ${pillBorder}`, color: accentColor }}>
        {isFullTime && <span style={{ marginRight: 5, fontSize: 12 }}></span>}
        {safeLabel}
      </div>
      <div style={{ ...qbLineStyle, background: `linear-gradient(to left, transparent, ${accentColor}22)` }} />
    </div>
  );
}

function SeasonAvgTable({ stats }: { stats: any[] }) {
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const router = useRouter();

  const withRating = stats.map(p => {
    // Use pre-computed avgFoopy when present — same per-game-averaged method as the player page.
    if (p.avgFoopy != null) return { ...p, _foopy: Number(p.avgFoopy) };
    const g = num(p.games);
    if (g <= 0) return { ...p, _foopy: null };
    // Prefer dividing raw totals ourselves — API-Sports' pre-rounded .average
    // fields can differ from FootyWire due to rounding and different denominators.
    const avg = (total: number | null | undefined) => (total ?? 0) / g;
    const _foopy = foopyRating({
      goals:        p.totalGoals       != null ? avg(p.totalGoals)       : (p.goalAvg      ?? 0),
      goalAssists:  avg(p.goalAssists),
      behinds:      avg(p.behinds),
      kicks:        p.totalKicks       != null ? avg(p.totalKicks)       : (p.kicks        ?? 0),
      handballs:    p.totalHandballs   != null ? avg(p.totalHandballs)   : (p.handballs    ?? 0),
      disposals:    p.totalDisposals   != null ? avg(p.totalDisposals)   : (p.disposals    ?? 0),
      marks:        p.totalMarks       != null ? avg(p.totalMarks)       : (p.marks        ?? 0),
      tackles:      p.totalTackles     != null ? avg(p.totalTackles)     : (p.tackles      ?? 0),
      hitouts:      p.totalHitouts     != null ? avg(p.totalHitouts)     : (p.hitouts      ?? 0),
      clearances:   p.totalClearances  != null ? avg(p.totalClearances)  : (p.clearances   ?? 0),
      freesFor:     p.freesFor         != null ? avg(p.freesFor)         : (p.freesForAvg  ?? 0),
      freesAgainst: avg(p.freesAgainst),
    } as any);
    return { ...p, _foopy };
  });
  const sorted = [...withRating].sort((a, b) => {
    if (a._foopy === null || b._foopy === null) {
      if (a._foopy === null && b._foopy === null) return 0;
      return a._foopy === null ? 1 : -1;
    }
    return sortDir === "desc" ? b._foopy - a._foopy : a._foopy - b._foopy;
  });

  if (!sorted.length) return <div style={{ padding: "20px 16px", color: "var(--text-3)", textAlign: "center", fontSize: 14 }}>No season stats available yet.</div>;

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thPlayerStyle}><span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)" }}>Player</span></th>
            <th style={{ ...thStyle, color: "#0ea5e9", cursor: "pointer" }} onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
              Foopy {sortDir === "desc" ? "↓" : "↑"}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const rowTeam = safeText(p.team, "");
            const name = safePlayerName(p.name, i + 1, rowTeam);
            const rating = p._foopy;
            return (
              <tr key={`${name}-${i}`} style={{ cursor: "pointer" }} onClick={() => p.id && router.push(`/player/${p.id}`)}>
                <td style={tdPlayerStyle}>
                  <span style={playerNameCellStyle}>
                    <PlayerAvatar name={name} team={rowTeam} size={38} unidentified={p.unidentified} />
                    <span style={playerInfoStyle}>
                      <span style={playerNameTextStyle} title={name}>{name}</span>
                    </span>
                  </span>
                </td>
                <td style={tdStyle}>
                  {rating !== null && rating > -1 && <span style={{ ...ratingPillStyle, background: foopyColor(rating) }}>{rating}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function canScrollBy(el: HTMLElement, axis: "x" | "y", delta: number) {
  if (axis === "x") {
    if (el.scrollWidth <= el.clientWidth) return false;
    if (delta < 0) return el.scrollLeft > 0;
    if (delta > 0) return el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    return false;
  }

  if (el.scrollHeight <= el.clientHeight) return false;
  if (delta < 0) return el.scrollTop > 0;
  if (delta > 0) return el.scrollTop < el.scrollHeight - el.clientHeight - 1;
  return false;
}

function useAxisLockedScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Axis-lock WITHOUT killing momentum: once a touch gesture commits to a
    // direction, hide overflow on the OTHER axis so it can't scroll, giving a
    // clean horizontal-or-vertical scroll (never diagonal). Crucially these
    // listeners are passive and never preventDefault / set scroll position, so
    // the browser's native inertial momentum is fully preserved. (The old
    // approach drove scrollLeft 1:1 with the finger, which had no inertia.)
    let axis: null | "x" | "y" = null;
    let startX = 0;
    let startY = 0;
    const LOCK_THRESHOLD = 6;

    function unlock() {
      el!.style.overflowX = "auto";
      el!.style.overflowY = "auto";
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      axis = null;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      unlock(); // start every gesture with both axes free
    }

    function onTouchMove(event: TouchEvent) {
      if (axis || event.touches.length !== 1) return;
      const dx = Math.abs(event.touches[0].clientX - startX);
      const dy = Math.abs(event.touches[0].clientY - startY);
      if (dx < LOCK_THRESHOLD && dy < LOCK_THRESHOLD) return;
      axis = dx > dy ? "x" : "y";
      // Lock the cross-axis; the chosen axis keeps native momentum scrolling.
      if (axis === "x") el!.style.overflowY = "hidden";
      else el!.style.overflowX = "hidden";
    }

    function onTouchEnd() {
      axis = null;
      unlock();
    }

    function onWheel(event: WheelEvent) {
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      if (absX < 0.5 && absY < 0.5) return;

      const lockAxis = event.shiftKey && absY > absX ? "x" : absX > absY ? "x" : "y";
      if (lockAxis === "x") {
        const delta = event.deltaX || event.deltaY;
        if (el.scrollWidth <= el.clientWidth) return;
        event.preventDefault();
        if (canScrollBy(el, "x", delta)) el.scrollLeft += delta;
        return;
      }

      if (!canScrollBy(el, "y", event.deltaY)) {
        const fixedLeft = el.scrollLeft;
        window.requestAnimationFrame(() => { el.scrollLeft = fixedLeft; });
        return;
      }

      event.preventDefault();
      el.scrollTop += event.deltaY;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return ref;
}

function StatTable({ stats, isLive, isFinal, currentPeriod = 0, team = "", gameId, bestRating, stickyTop = 0, statMode: statModeProp, sortKey: sortKeyProp, sortDir: sortDirProp, onSort, columns }: { stats: PlayerStat[]; isLive?: boolean; isFinal?: boolean; currentPeriod?: number; team?: string; gameId: number; bestRating: number; stickyTop?: number; statMode?: StatMode; sortKey?: SortKey; sortDir?: "desc"|"asc"; onSort?: (k: SortKey) => void; columns?: SortKey[] }) {
  // Resolve the chosen stat columns (defaults to the standard set), preserving
  // the canonical STAT_COLUMNS order.
  const activeCols = STAT_COLUMNS.filter((c) => (columns ?? DEFAULT_STAT_COLS).includes(c.id));
  // Early in a live game almost every player's rating sits just below 0
  // (near-empty stat lines), which reads as a wall of red "negative" pills.
  // Only start showing those once the game is past half time.
  const showNegativeRatings = isFinal || currentPeriod >= 3;
  const [sortKeyLocal, setSortKeyLocal] = useState<SortKey>("foopy");
  const [sortDirLocal, setSortDirLocal] = useState<"desc" | "asc">("desc");
  const [statModeLocal, setStatModeLocal] = useState<StatMode>("basic");
  const sortKey  = sortKeyProp  ?? sortKeyLocal;
  const sortDir  = sortDirProp  ?? sortDirLocal;
  const statMode = statModeProp ?? statModeLocal;
  const [playerCommentCounts, setPlayerCommentCounts] = useState<Record<string, number>>({});
  const router = useRouter();
  const axisLockedScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const statsHeaderScrollerRef = useRef<HTMLDivElement | null>(null);
  const statsHeaderTouchRef = useRef<{ x: number; y: number; left: number; axis: "x" | "y" | null } | null>(null);

  useEffect(() => {
    if (!gameId) return;
    supabase
      .from("feed_comments")
      .select("event_key")
      .eq("game_id", gameId)
      .like("event_key", "player_%")
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        for (const row of data as { event_key: string }[]) {
          counts[row.event_key] = (counts[row.event_key] ?? 0) + 1;
        }
        setPlayerCommentCounts(counts);
      });
  }, [gameId]);

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortKey === "foopy") {
        const aFoopy = getFoopyValue(a);
        const bFoopy = getFoopyValue(b);
        if (aFoopy === null || bFoopy === null) {
          if (aFoopy === null && bFoopy === null) return 0;
          return aFoopy === null ? 1 : -1;
        }
        const diff = bFoopy - aFoopy;
        return sortDir === "desc" ? diff : -diff;
      }

      const diff = getSortValue(b, sortKey) - getSortValue(a, sortKey);
      return sortDir === "desc" ? diff : -diff;
    });
  }, [stats, sortKey, sortDir]);

  function sortColStyle(key: SortKey): CSSProperties {
    return sortKey === key ? { boxShadow: "inset 0 0 0 1000px rgba(255,255,255,0.045)" } : {};
  }

  function handleSort(key: SortKey) {
    if (onSort) {
      onSort(key);
      return;
    }
    if (sortKey === key) setSortDirLocal(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKeyLocal(key);
      setSortDirLocal("desc");
    }
  }

  const identityColsWidth = AVATAR_COL_W + NAME_COL_W;
  const statsWidth = activeCols.reduce((w, c) => w + c.width, 0);
  const tableMinWidth = identityColsWidth + statsWidth;
  // Frozen header width as a % of the full table, so it stretches in lock-step
  // with the (proportionally-sized) body columns on wide screens while never
  // shrinking below its intrinsic px width when the table scrolls on mobile.
  const identityPct = (identityColsWidth / tableMinWidth) * 100;
  const statsHeaderTop = `calc(var(--round-strip-h, 0px) + ${stickyTop}px)`;
  const foopyArrow = sortKey === "foopy" ? (sortDir === "desc" ? "↓" : "↑") : "";

  const syncStatsHeaderScroll = useCallback((left: number) => {
    const el = statsHeaderScrollerRef.current;
    if (el) el.style.transform = `translate3d(${-left}px, 0, 0)`;
  }, []);

  useLayoutEffect(() => {
    syncStatsHeaderScroll(axisLockedScrollRef.current?.scrollLeft ?? 0);
  }, [activeCols.length, axisLockedScrollRef, syncStatsHeaderScroll]);

  function scrollStatsBy(delta: number) {
    const el = axisLockedScrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return false;
    el.scrollLeft += delta;
    syncStatsHeaderScroll(el.scrollLeft);
    return true;
  }

  function sortHeaderButton(label: string, key: SortKey, fullLabel = label) {
    const active = sortKey === key;
    return (
      <button
        key={key}
        type="button"
        title={fullLabel}
        aria-label={`Sort by ${fullLabel}`}
        aria-pressed={active}
        style={{
          ...statsHeaderCellStyle,
          width: "100%",
          color: active ? "#38bdf8" : "var(--text-3)",
          background: active ? "rgba(56,189,248,0.08)" : "transparent",
        }}
        onClick={() => handleSort(key)}
      >
        <span>{label}</span>
        {active && <span style={statsHeaderArrowStyle}>{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    );
  }

  if (!stats.length) {
    // Tailor the empty-state copy to the game's actual phase. For LIVE games,
    // API-Sports' AFL player-stat feed often lags the live score and only
    // populates near/after the game — so "Final stats are on their way" reads
    // wrong mid-match. Be accurate: live → "not in yet", final → "on their
    // way", upcoming → "once the game has been played".
    return (
      <div style={noStatsStyle}>
        <strong>{isFinal ? "Loading player stats…" : isLive ? "Live player stats aren’t in yet" : "No player stats available yet."}</strong>
        <span>{isFinal ? "Final stats are on their way." : isLive ? "AFL stats can lag the live score — they’ll appear here once published." : "Stats will appear here once the game has been played."}</span>
      </div>
    );
  }

  return (
    <div style={statsTableShellStyle}>
      <div
        style={{ ...statsStickyHeaderStyle, top: statsHeaderTop }}
        onWheel={(e) => {
          const absX = Math.abs(e.deltaX);
          const absY = Math.abs(e.deltaY);
          if (!e.shiftKey && absX <= absY) return;
          const delta = e.shiftKey && absY > absX ? e.deltaY : e.deltaX || e.deltaY;
          if (scrollStatsBy(delta)) e.preventDefault();
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          statsHeaderTouchRef.current = {
            x: t.clientX,
            y: t.clientY,
            left: axisLockedScrollRef.current?.scrollLeft ?? 0,
            axis: null,
          };
        }}
        onTouchMove={(e) => {
          const start = statsHeaderTouchRef.current;
          const el = axisLockedScrollRef.current;
          if (!start || !el || e.touches.length !== 1) return;
          const t = e.touches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
            start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }
          if (start.axis !== "x") return;
          e.preventDefault();
          el.scrollLeft = start.left - dx;
          syncStatsHeaderScroll(el.scrollLeft);
        }}
        onTouchEnd={() => {
          statsHeaderTouchRef.current = null;
        }}
        onTouchCancel={() => {
          statsHeaderTouchRef.current = null;
        }}
      >
        <div style={statsHeaderViewportStyle}>
          <div style={{ ...statsHeaderFrozenStyle, width: `max(${identityColsWidth}px, ${identityPct}%)` }}>
            <button
              type="button"
              onClick={() => handleSort("foopy")}
              title="Sort by Foopy rating"
              aria-label="Sort by Foopy rating"
              aria-pressed={sortKey === "foopy"}
              style={{
                ...statsHeaderCellStyle,
                width: "100%",
                color: sortKey === "foopy" ? "#38bdf8" : "var(--text-3)",
                background: sortKey === "foopy" ? "rgba(56,189,248,0.08)" : "transparent",
              }}
            >
              <span>Player</span>
              {foopyArrow && <span style={statsHeaderArrowStyle}>{foopyArrow}</span>}
            </button>
          </div>
          <div
            ref={statsHeaderScrollerRef}
            style={{
              ...statsHeaderScrollerStyle,
              gridTemplateColumns: `${AVATAR_COL_W}fr ${NAME_COL_W}fr ${activeCols.map((c) => `${c.width}fr`).join(" ")}`,
              width: "100%",
              minWidth: tableMinWidth,
            }}
          >
            <div />
            <div />
            {activeCols.map((c) => sortHeaderButton(c.label, c.id, c.full))}
          </div>
        </div>
      </div>

      <div
        ref={axisLockedScrollRef}
        style={{ ...tableWrapStyle, WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        onScroll={(e) => syncStatsHeaderScroll(e.currentTarget.scrollLeft)}
      >
        <table style={{ ...tableStyle, width: "100%", minWidth: tableMinWidth, tableLayout: "fixed" }}>
          {/* Column widths as % of the total so the body distributes stretch
              identically to the grid-`fr` header — otherwise table-layout:fixed
              spreads extra width differently and the headers drift off their
              number columns on wide screens. minWidth pins exact px on mobile. */}
          <colgroup>
            <col style={{ width: `${(AVATAR_COL_W / tableMinWidth) * 100}%` }} />{/* avatar (sticky) */}
            <col style={{ width: `${(NAME_COL_W / tableMinWidth) * 100}%` }} />{/* surname (sticky) */}
            {activeCols.map((c) => <col key={c.id} style={{ width: `${(c.width / tableMinWidth) * 100}%` }} />)}
          </colgroup>
          <tbody>
            {sortedStats.map((p, index) => {
              const name = safePlayerName(p.name ?? p.player, index + 1, safeText(p.team ?? team, ""));
              const knownPlayer = findPlayerInfo(name);
              const rowTeam = safeText(knownPlayer?.club ?? knownPlayer?.team ?? p.team ?? team, "");
              const rating = getFoopyValue(p);
              const ratingVisible = rating !== null && (rating >= 0 || showNegativeRatings);
              const isBest = ratingVisible && isFinal && bestRating > 0 && rating === bestRating;
              const playerSlugUrl = slugName(name);
              const playerDbKey = `player_${playerSlugUrl}`; // DB event_key still uses player_ prefix
              const count = playerCommentCounts[playerDbKey] ?? 0;

              return (
                <tr
                  // Keyed by player identity, NOT array index — the live 15s
                  // refresh re-sorts this list as stats change, and an
                  // index-based key would make React think a different
                  // player now occupies that row, remounting the avatar
                  // <Image> (and re-triggering its load) on every reorder.
                  // Keying by identity lets React just reorder the existing
                  // DOM node instead, so already-loaded images don't flicker.
                  key={playerSlugUrl || `${name}-${index}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/match/${gameId}/${playerSlugUrl}`)}
                >
                  {/* Sticky avatar — stays pinned while scrolling. */}
                  <td style={tdAvatarStyle}>
                    <PlayerAvatar name={name} team={rowTeam} size={44} unidentified={p.unidentified} />
                  </td>
                  {/* Surname + foopy rating + comment count — scrolls under the avatar. */}
                  <td style={tdNameStyle}>
                    <span style={tdNameInnerStyle}>
                      <span style={playerNameTextStyle} title={name}>{surname(name)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {ratingVisible && rating !== null && (
                          <span style={{ ...statNameRatingStyle, background: foopyColor(rating) }}>
                            {isBest && (
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="#fff" style={{ flexShrink: 0 }}>
                                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                              </svg>
                            )}
                            {rating}
                          </span>
                        )}
                        {/* Icon always shown (matches the feed cards' "Open
                            comments" affordance) — only the count is
                            conditional. */}
                        <span style={statNameCommentStyle}>
                          <MessageCircle size={10} strokeWidth={2.3} />
                          {count > 0 && count}
                        </span>
                      </span>
                    </span>
                  </td>

                  {activeCols.map((c) => (
                    <td key={c.id} style={{ ...statCellStyle, ...sortColStyle(c.id) }}>{c.render(p)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Bottom-sheet editor for choosing which stat columns the player tables show.
function StatColumnsEditor({ selected, onChange, onClose }: { selected: SortKey[]; onChange: (next: SortKey[]) => void; onClose: () => void }) {
  const set = new Set(selected);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const toggle = (id: SortKey) => {
    const next = new Set(set);
    if (next.has(id)) {
      if (next.size <= 1) return; // always keep at least one column
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(Array.from(next));
  };

  const sheet = (
    <div onClick={onClose} style={statEditorBackdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={statEditorPanelStyle}>
        <div style={statEditorHandleStyle} />
        <div style={statEditorTitleRowStyle}>
          <span style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)" }}>Stat columns</span>
          <button type="button" onClick={onClose} style={statEditorDoneStyle}>Done</button>
        </div>
        <p style={statEditorHintStyle}>Choose which stats appear in the player tables. The player and rating columns always stay.</p>
        <div style={statEditorListStyle}>
          {STAT_COLUMNS.map((c) => {
            const on = set.has(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)} style={{ ...statEditorRowStyle, ...(on ? statEditorRowOnStyle : null) }}>
                <span style={{ ...statEditorBadgeStyle, ...(on ? { background: "#0ea5e9", color: "#fff" } : null) }}>{c.label}</span>
                <span style={{ flex: 1, textAlign: "left", fontWeight: 700, color: on ? "var(--text-1)" : "var(--text-2)" }}>{c.full}</span>
                <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: on ? "none" : "2px solid var(--border-3)", background: on ? "#0ea5e9" : "transparent" }}>
                  {on && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(sheet, portalTarget) : null;
}

function teamTotal(stats: PlayerStat[], key: string) {
  if (key === "shots") return stats.reduce((sum, p) => sum + num(p.goals) + num(p.behinds), 0);
  return stats.reduce((sum, p: any) => sum + num(p[key]), 0);
}

function teamFreesFor(stats: PlayerStat[]) {
  return stats.reduce((sum, p) => sum + playerFreesFor(p), 0);
}

function percent(value: number, total: number) {
  if (total <= 0) return 50;
  return Math.max(8, Math.min(92, (value / total) * 100));
}

function umpireMessage(homeTeam: any, awayTeam: any, homeFrees: number, awayFrees: number) {
  const safeHomeTeam = safeText(homeTeam, "Home");
  const safeAwayTeam = safeText(awayTeam, "Away");
  const total = homeFrees + awayFrees;
  const diff = Math.abs(homeFrees - awayFrees);
  if (!total) return "Free kick count unavailable";
  if (diff <= 3) return "Umpires are fair";
  const leading = homeFrees > awayFrees ? safeHomeTeam : safeAwayTeam;
  if (diff <= 8) return `Umpires slightly favour ${leading}`;
  return `${leading} getting the rub of the green`;
}

function getCountdownText(date?: string, now = Date.now()) {
  if (!date) return "Start time TBA";
  const start = new Date(date).getTime();
  if (Number.isNaN(start)) return "Start time TBA";

  const diff = start - now;
  if (diff <= 0) return "Game Starting Soon";

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const minutes = Math.floor((diff / 60000) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

// ─── Insights ────────────────────────────────────────────────────────────────

type Insight = { team: string | null; text: string };

function canonicalTeamKey(team: string) {
  const key = String(team || "").toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    adelaide: "adelaide",
    adelaidecrows: "adelaide",
    brisbane: "brisbane",
    brisbanelions: "brisbane",
    carlton: "carlton",
    carltonblues: "carlton",
    collingwood: "collingwood",
    collingwoodmagpies: "collingwood",
    essendon: "essendon",
    essendonbombers: "essendon",
    fremantle: "fremantle",
    fremantledockers: "fremantle",
    geelong: "geelong",
    geelongcats: "geelong",
    goldcoast: "goldcoast",
    goldcoastsuns: "goldcoast",
    gws: "gws",
    gwsgiants: "gws",
    greaterwesternsydney: "gws",
    greaterwesternsydneygiants: "gws",
    hawthorn: "hawthorn",
    hawthornhawks: "hawthorn",
    melbourne: "melbourne",
    melbournedemons: "melbourne",
    northmelbourne: "northmelbourne",
    northmelbournekangaroos: "northmelbourne",
    kangaroos: "northmelbourne",
    portadelaide: "portadelaide",
    portadelaidepower: "portadelaide",
    portalelaide: "portadelaide",
    portalelaidepower: "portadelaide",
    power: "portadelaide",
    richmond: "richmond",
    richmondtigers: "richmond",
    stkilda: "stkilda",
    stkildasaints: "stkilda",
    sydney: "sydney",
    sydneyswans: "sydney",
    westcoast: "westcoast",
    westcoasteagles: "westcoast",
    westernbulldogs: "westernbulldogs",
    bulldogs: "westernbulldogs",
  };

  return aliases[key] ?? key;
}

function flexMatchTeam(a: string, b: string) {
  return canonicalTeamKey(a) === canonicalTeamKey(b);
}

function generateInsights(
  homeTeam: string,
  awayTeam: string,
  currentGame: MatchGame,
  allGames: MatchGame[],
  teamStats: Record<string, any>,
  apiTeamIdByName: Record<string, number>,
): Insight[] {
  const currentTime = currentGame.date ? new Date(currentGame.date).getTime() : Infinity;
  const completed = allGames.filter(g => {
    if (String(g.id) === String(currentGame.id)) return false;
    if (Number(g.complete) !== 100) return false;
    const gameTime = g.date ? new Date(g.date).getTime() : 0;
    return Number.isFinite(currentTime) ? gameTime < currentTime : true;
  });

  const tScore   = (g: MatchGame, n: string) => flexMatchTeam(g.hteam, n) ? Number(g.hscore ?? 0) : Number(g.ascore ?? 0);
  const oppScore = (g: MatchGame, n: string) => flexMatchTeam(g.hteam, n) ? Number(g.ascore ?? 0) : Number(g.hscore ?? 0);
  const isWin    = (g: MatchGame, n: string) => tScore(g, n) > oppScore(g, n);
  const isLoss   = (g: MatchGame, n: string) => tScore(g, n) < oppScore(g, n);

  function sortedGames(name: string) {
    return completed
      .filter(g => flexMatchTeam(g.hteam, name) || flexMatchTeam(g.ateam, name))
      .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime());
  }

  function statBlock(name: string) {
    const tid = Object.entries(apiTeamIdByName).find(([team]) => flexMatchTeam(team, name))?.[1];
    if (!tid) return null;
    const entries = (Object.values(teamStats) as any[]).filter(e =>
      Array.isArray(e.teams) &&
      e.teams.some((t: any) => t.team?.id === tid) &&
      (!e.date || !Number.isFinite(currentTime) || new Date(e.date).getTime() < currentTime)
    );
    if (!entries.length) return null;
    let goals = 0, behinds = 0, tackles = 0, clearances = 0, disposals = 0;
    for (const e of entries) {
      const b = e.teams.find((t: any) => t.team?.id === tid);
      if (!b) continue;
      goals      += Number(b.statistics?.scoring?.goals        ?? 0);
      behinds    += Number(b.statistics?.scoring?.behinds      ?? 0);
      tackles    += Number(b.statistics?.defence?.tackles      ?? 0);
      clearances += Number(b.statistics?.stoppages?.clearances ?? 0);
      disposals  += Number(b.statistics?.disposals?.disposals  ?? 0);
    }
    const n = entries.length;
    return {
      acc:           goals + behinds > 0 ? Math.round((goals / (goals + behinds)) * 100) : null,
      avgGoals:      Math.round((goals / n) * 10) / 10,
      avgTackles:    Math.round((tackles / n) * 10) / 10,
      avgClearances: Math.round((clearances / n) * 10) / 10,
      avgDisposals:  Math.round(disposals / n),
    };
  }

  function candidatesForTeam(name: string, venue: "home" | "away"): Insight[] {
    const games  = sortedGames(name);
    if (!games.length) return [];
    const wins   = games.filter(g => isWin(g, name));
    const losses = games.filter(g => isLoss(g, name));
    const st     = statBlock(name);
    const pool: Insight[] = [];

    // Season record
    pool.push({ team: name, text: `${name} are ${wins.length}-${losses.length} so far this season` });

    // Win/loss streak
    const lastType = isWin(games[games.length - 1], name) ? "win" : isLoss(games[games.length - 1], name) ? "loss" : "draw";
    let streak = 0;
    for (let i = games.length - 1; i >= 0; i--) {
      const w = isWin(games[i], name);
      const l = isLoss(games[i], name);
      if ((lastType === "win" && w) || (lastType === "loss" && l)) streak++;
      else break;
    }
    if (streak >= 2) {
      pool.push(lastType === "win"
        ? { team: name, text: `${name} are on a ${streak}-game winning streak heading into this clash` }
        : { team: name, text: `${name} have lost ${streak} consecutive games and need a response` }
      );
    }

    // Last 5 form string
    const last5 = games.slice(-5);
    const formStr = last5.map(g => isWin(g, name) ? "W" : isLoss(g, name) ? "L" : "D").join("-");
    pool.push({ team: name, text: `${name}'s last ${last5.length} results: ${formStr}` });

    // Venue record for this matchup
    const venueGames = games.filter(g => venue === "home" ? flexMatchTeam(g.hteam, name) : flexMatchTeam(g.ateam, name));
    if (venueGames.length >= 2) {
      const venueWins = venueGames.filter(g => isWin(g, name)).length;
      pool.push({
        team: name,
        text: `${name} are ${venueWins}-${venueGames.length - venueWins} ${venue === "home" ? "at home" : "away from home"} this season`,
      });
    }

    // Biggest win
    if (wins.length > 0) {
      const bigWin = wins.reduce((b, g) =>
        tScore(g, name) - oppScore(g, name) > tScore(b, name) - oppScore(b, name) ? g : b
      );
      const margin = tScore(bigWin, name) - oppScore(bigWin, name);
      const opp = flexMatchTeam(bigWin.hteam, name) ? bigWin.ateam : bigWin.hteam;
      pool.push({ team: name, text: `${name}'s biggest win this season was a ${margin}-point victory over ${opp}` });
    }

    // Biggest loss
    if (losses.length > 0) {
      const bigLoss = losses.reduce((b, g) =>
        oppScore(g, name) - tScore(g, name) > oppScore(b, name) - tScore(b, name) ? g : b
      );
      const margin = oppScore(bigLoss, name) - tScore(bigLoss, name);
      const opp = flexMatchTeam(bigLoss.hteam, name) ? bigLoss.ateam : bigLoss.hteam;
      pool.push({ team: name, text: `${name}'s heaviest defeat this season was a ${margin}-point loss to ${opp}` });
    }

    // Avg score for & against
    const avgFor = Math.round(games.reduce((s, g) => s + tScore(g, name), 0) / games.length);
    const avgAga = Math.round(games.reduce((s, g) => s + oppScore(g, name), 0) / games.length);
    pool.push({ team: name, text: `${name} average ${avgFor} points scored and ${avgAga} conceded per game` });

    // Sub-70 conceded frequency
    const shutdowns = games.filter(g => oppScore(g, name) < 70).length;
    if (shutdowns >= 2) {
      pool.push({ team: name, text: `${name} have held opponents to under 70 points ${shutdowns} times this season` });
    }

    // Avg win/loss margins
    if (wins.length > 0 && losses.length > 0) {
      const avgWin  = Math.round(wins.reduce((s, g)   => s + tScore(g, name) - oppScore(g, name), 0) / wins.length);
      const avgLoss = Math.round(losses.reduce((s, g) => s + oppScore(g, name) - tScore(g, name), 0) / losses.length);
      pool.push({ team: name, text: `${name} win by an average of ${avgWin} points but lose by ${avgLoss} when beaten` });
    }

    // Home record
    const homeGames = games.filter(g => flexMatchTeam(g.hteam, name));
    if (homeGames.length >= 2) {
      const hw = homeGames.filter(g => isWin(g, name)).length;
      pool.push({ team: name, text: `${name} are ${hw}-${homeGames.length - hw} at home this season` });
    }

    // Away record
    const awayGames = games.filter(g => flexMatchTeam(g.ateam, name));
    if (awayGames.length >= 2) {
      const aw = awayGames.filter(g => isWin(g, name)).length;
      pool.push({ team: name, text: `${name} are ${aw}-${awayGames.length - aw} away from home this season` });
    }

    // Shooting accuracy
    if (st?.acc !== null && st) {
      pool.push({ team: name, text: `${name} convert ${st.acc}% of their scoring shots to goals this season` });
    }

    // Average tackles
    if (st) {
      pool.push({ team: name, text: `${name} lay an average of ${st.avgTackles} tackles per game this season` });
    }

    // Average clearances
    if (st) {
      pool.push({ team: name, text: `${name} win an average of ${st.avgClearances} clearances per game` });
    }

    // Average disposals
    if (st) {
      pool.push({ team: name, text: `${name} rack up an average of ${st.avgDisposals} disposals per game` });
    }

    // Close games (decided by ≤ 15 pts)
    const closeGames = games.filter(g => Math.abs(tScore(g, name) - oppScore(g, name)) <= 15);
    if (closeGames.length >= 2) {
      const closeWins = closeGames.filter(g => isWin(g, name)).length;
      pool.push({ team: name, text: `${name} have played ${closeGames.length} games decided by 15 points or less, winning ${closeWins}` });
    }

    return pool;
  }

  function pick4(name: string, venue: "home" | "away"): Insight[] {
    const used = new Set<string>();
    return candidatesForTeam(name, venue).filter((ins) => {
      const key = ins.text.toLowerCase();
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }).slice(0, 4);
  }

  return [
    ...pick4(homeTeam, "home"),
    ...pick4(awayTeam, "away"),
  ];
}

function formResult(game: MatchGame, focusTeam: string): "W" | "L" | "D" {
  const isHome = flexMatchTeam(game.hteam, focusTeam);
  const ts = isHome ? Number(game.hscore ?? 0) : Number(game.ascore ?? 0);
  const os = isHome ? Number(game.ascore ?? 0) : Number(game.hscore ?? 0);
  if (ts > os) return "W";
  if (ts < os) return "L";
  return "D";
}

function completedTeamGamesToDate(team: string, allGames: MatchGame[], currentGame: MatchGame) {
  const currentTime = currentGame.date ? new Date(currentGame.date).getTime() : Infinity;

  return allGames
    .filter((g) => {
      if (String(g.id) === String(currentGame.id)) return false;
      if (Number(g.complete) !== 100 && !(g as any).is_final) return false;
      const isInvolved = flexMatchTeam(g.hteam, team) || flexMatchTeam(g.ateam, team);
      if (!isInvolved) return false;
      const gameTime = g.date ? new Date(g.date).getTime() : 0;
      return Number.isFinite(currentTime) ? gameTime < currentTime : true;
    })
    .sort((a, b) => new Date(b.date ?? "").getTime() - new Date(a.date ?? "").getTime());
}

function recentCompletedTeamGames(team: string, allGames: MatchGame[], currentGame: MatchGame, limit = 5) {
  return completedTeamGamesToDate(team, allGames, currentGame).slice(0, limit);
}

function FormColumn({ team, games, compact }: { team: string; games: MatchGame[]; compact: boolean }) {
  const logoSize = compact ? 24 : 34;
  const scoreWidth = compact ? 78 : 92;
  const scoreHeight = compact ? 24 : 26;
  const scorePadding = compact ? "0 6px" : "0 8px";
  const scoreFontSize = compact ? 11 : 12;
  const rowGap = compact ? 4 : 6;
  const rowWidth = (logoSize * 2) + scoreWidth + (rowGap * 2);

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: compact ? 10 : 12 }}>
      {games.length === 0
        ? <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "16px 0" }}>No data</span>
        : games.map((g, i) => {
            const hLogo = getLogo(safeText(g.hteam, ""));
            const aLogo = getLogo(safeText(g.ateam, ""));
            const result = formResult(g, team);
            const pillBg = result === "W" ? "#16a34a" : result === "L" ? "#dc2626" : "#475569";
            return (
              <div key={i} style={{
                width: rowWidth,
                display: "grid",
                gridTemplateColumns: `${logoSize}px ${scoreWidth}px ${logoSize}px`,
                alignItems: "center",
                justifyContent: "center",
                columnGap: rowGap,
                margin: "0 auto",
              }}>
                {/* home logo */}
                <div style={{ width: logoSize, height: logoSize, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
                  <img src={hLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
                {/* score pill */}
                <div style={{
                  background: pillBg,
                  borderRadius: compact ? 8 : 10,
                  width: scoreWidth,
                  height: scoreHeight,
                  padding: scorePadding,
                  display: "grid",
                  placeItems: "center",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}>
                  <span style={{ display: "block", maxWidth: "100%", fontSize: scoreFontSize, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", letterSpacing: 0, lineHeight: 1 }}>
                    {`${g.hscore ?? 0} - ${g.ascore ?? 0}`}
                  </span>
                </div>
                {/* away logo */}
                <div style={{ width: logoSize, height: logoSize, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
                  <img src={aLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

function TeamFormBox({ homeTeam, awayTeam, allGames, currentGame }: {
  homeTeam: string; awayTeam: string; allGames: MatchGame[]; currentGame: MatchGame;
}) {
  const homeForm = recentCompletedTeamGames(homeTeam, allGames, currentGame);
  const awayForm = recentCompletedTeamGames(awayTeam, allGames, currentGame);
  const compact = useCompactViewport();
  if (!homeForm.length && !awayForm.length) return null;

  return (
    <div style={{
      margin: "0 0 14px",
      borderRadius: 18,
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      border: "none",
      overflow: "hidden",
    }}>
      <div style={{ padding: "18px 18px 0" }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
          Team form
        </span>
      </div>
      <div style={{ display: "flex", gap: 0, padding: compact ? "14px 8px 16px" : "16px 12px 18px" }}>
        <FormColumn team={homeTeam} games={homeForm} compact={compact} />
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", flexShrink: 0, margin: compact ? "0 6px" : "0 8px" }} />
        <FormColumn team={awayTeam} games={awayForm} compact={compact} />
      </div>
    </div>
  );
}

// ── Ins/Outs + named lineups (sourced from FootyWire via sync-lineups cron) ───
type LineupPlayer = { name: string; team: string; id: string | null; apiSportsId: number | null; pos?: string };
type TeamLineup = { team: string; onfield: LineupPlayer[]; interchange: LineupPlayer[]; emergencies: LineupPlayer[]; ins: LineupPlayer[]; outs: LineupPlayer[] };
type LineupPayload = { home: string; away: string; venue: string; round?: number; scrapedAt?: string; teams: Record<string, TeamLineup> };

function LineupPlayerChip({ p, kind }: { p: LineupPlayer; kind: "in" | "out" }) {
  const [failed, setFailed] = useState(false);
  const src = playerImagePath(p.name, p.team);
  const color = kind === "in" ? "#22c55e" : "#ef4444";
  const arrow = kind === "in" ? "▲" : "▼";
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)" }}>
        {!failed && src
          ? <img src={src} alt={p.name} onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          : null}
      </div>
      <span style={{ fontSize: 9, fontWeight: 900, color, flexShrink: 0, width: 9 }}>{arrow}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
    </div>
  );
  return p.id
    ? <Link href={`/player/${p.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>{inner}</Link>
    : inner;
}

function InsOutsColumn({ tl }: { tl: TeamLineup }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <img src={getLogo(tl.team)} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)" }}>{getAbbr(tl.team)}</span>
      </div>
      {tl.ins.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>In</div>
          {tl.ins.map((p, i) => <LineupPlayerChip key={`in-${p.id ?? p.name}-${i}`} p={p} kind="in" />)}
        </div>
      )}
      {tl.outs.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#ef4444", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Out</div>
          {tl.outs.map((p, i) => <LineupPlayerChip key={`out-${p.id ?? p.name}-${i}`} p={p} kind="out" />)}
        </div>
      )}
      {tl.ins.length === 0 && tl.outs.length === 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>Unchanged</div>
      )}
    </div>
  );
}

function InsOutsBox({ homeTeam, awayTeam, gameId }: { homeTeam: string; awayTeam: string; gameId: string }) {
  const [lineup, setLineup] = useState<LineupPayload | null>(null);
  const compact = useCompactViewport();

  useEffect(() => {
    let active = true;
    fetch(`/api/lineups?gameId=${encodeURIComponent(gameId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d?.lineup) setLineup(d.lineup); })
      .catch(() => {});
    return () => { active = false; };
  }, [gameId]);

  if (!lineup?.teams) return null;
  const findTeam = (name: string) =>
    Object.values(lineup.teams).find(t => normaliseTeamKey(t.team) === normaliseTeamKey(name))
    ?? lineup.teams[name];
  const home = findTeam(homeTeam);
  const away = findTeam(awayTeam);
  if (!home && !away) return null;

  const anyChanges =
    (home?.ins.length ?? 0) + (home?.outs.length ?? 0) + (away?.ins.length ?? 0) + (away?.outs.length ?? 0) > 0;
  if (!anyChanges) return null;

  return (
    <div style={{
      margin: "0 0 14px", borderRadius: 18, overflow: "hidden",
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    }}>
      <div style={{ padding: "18px 18px 0", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" }}>Ins &amp; Outs</span>
        {lineup.round != null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>Round {lineup.round} teams</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 0, padding: compact ? "14px 12px 16px" : "16px 16px 18px" }}>
        {home && <InsOutsColumn tl={home} />}
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", flexShrink: 0, margin: "0 10px" }} />
        {away && <InsOutsColumn tl={away} />}
      </div>
    </div>
  );
}

type H2HMeeting = {
  id: number;
  year: number;
  roundname: string;
  hteam: string;
  ateam: string;
  hscore: number;
  ascore: number;
  venue: string;
  date: string;
  winner: string | null;
  isFinal: boolean;
  isGrandFinal: boolean;
};

type H2HPayload = {
  meetings: H2HMeeting[];
  summary: {
    total: number;
    home: { name: string; key: string; wins: number };
    away: { name: string; key: string; wins: number };
    draws: number;
  } | null;
};

type H2HScope = "all" | 10 | 5;

function h2hTally(meetings: H2HMeeting[], homeTeam: string, awayTeam: string) {
  let home = 0, away = 0, draws = 0;
  for (const m of meetings) {
    if (m.hscore === m.ascore || !m.winner) { draws++; continue; }
    if (flexMatchTeam(m.winner, homeTeam)) home++;
    else if (flexMatchTeam(m.winner, awayTeam)) away++;
    else draws++;
  }
  return { home, away, draws, total: meetings.length };
}

function HeadToHeadBox({ homeTeam, awayTeam }: { homeTeam: string; awayTeam: string }) {
  const [data, setData] = useState<H2HPayload | null>(null);
  const [scope, setScope] = useState<H2HScope>("all");
  const compact = useCompactViewport();
  const router = useRouter();

  useEffect(() => {
    if (!homeTeam || !awayTeam) return;
    let active = true;
    setData(null);
    setScope("all");
    fetch(`/api/head-to-head?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.meetings) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [homeTeam, awayTeam]);

  if (!data || data.meetings.length === 0) return null;

  const { meetings } = data;
  const pad = compact ? "14px" : "18px";
  const subset = scope === "all" ? meetings : meetings.slice(0, scope);
  const tally = h2hTally(subset, homeTeam, awayTeam);

  const scopeOptions: { label: string; value: H2HScope }[] = [
    { label: "All Time", value: "all" },
    { label: "Last 10", value: 10 },
    { label: "Last 5", value: 5 },
  ];

  return (
    <div style={{
      margin: "0 0 14px", borderRadius: 18, overflow: "hidden",
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    }}>
      <div style={{ padding: `18px ${pad} 0` }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" }}>Head to head</span>
      </div>

      {/* Scope switch */}
      <div style={{ display: "flex", gap: 4, padding: `14px ${pad} 0` }}>
        {scopeOptions.map((opt) => {
          const active = scope === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setScope(opt.value)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 10,
                background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
                color: active ? "var(--text-1)" : "var(--text-3)",
                fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                letterSpacing: "-0.01em", transition: "background 0.12s, color 0.12s",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Record */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `16px ${pad}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <img src={getLogo(homeTeam)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontSize: 26, fontWeight: 900, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{tally.home}</span>
        </div>

        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{tally.total} meeting{tally.total === 1 ? "" : "s"}</div>
          {tally.draws > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{tally.draws} draw{tally.draws === 1 ? "" : "s"}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{tally.away}</span>
          <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <img src={getLogo(awayTeam)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push(`/head-to-head?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`)}
        style={{
          width: "100%", padding: "13px 18px", background: "rgba(255,255,255,0.03)",
          border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#60a5fa",
          fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em",
        }}
      >
        {`Show all ${meetings.length} meetings`}
      </button>
    </div>
  );
}

type PreviewPlayerLeader = {
  team: string;
  name: string;
  foopyTotal: number;
  goalsTotal: number;
  disposalsTotal: number;
  games: number;
  playerId?: string;
  apiSportsId?: number;
};

function savedStatsForGame(game: MatchGame) {
  const key = String(game.id ?? "");
  const mapped = (API_SPORTS_MATCH_IDS as Record<string, string>)[key];
  const data = matchStatsJson as Record<string, any>;
  return data[String(mapped ?? "")] ?? data[key] ?? null;
}

function playersForTeamInSavedGame(saved: any, game: MatchGame, team: string): PlayerStat[] {
  const teams = Array.isArray(saved?.teams)
    ? saved.teams
    : Array.isArray(saved?.playerStats)
    ? saved.playerStats
    : [];

  if (teams.length) {
    const fallbackIndex = flexMatchTeam(game.hteam, team) ? 0 : 1;
    const block = getPlayerTeamBlock(teams, getApiTeamId(team), team, fallbackIndex);
    return (block?.players ?? []).map((player: any) => normalizeSavedPlayer(player, team));
  }

  const rawPlayers = flexMatchTeam(game.hteam, team)
    ? saved?.homePlayers
    : flexMatchTeam(game.ateam, team)
    ? saved?.awayPlayers
    : [];

  return Array.isArray(rawPlayers)
    ? rawPlayers.map((player: any) => normalizeSavedPlayer(player, player?.team || player?.club || team))
    : [];
}

function playerSeasonTotalsForTeam(team: string, allGames: MatchGame[], currentGame: MatchGame) {
  const totals = new Map<string, PreviewPlayerLeader>();

  for (const game of completedTeamGamesToDate(team, allGames, currentGame)) {
    const saved = savedStatsForGame(game);
    if (!saved) continue;

    for (const player of playersForTeamInSavedGame(saved, game, team)) {
      const name = safeText(player.name ?? player.player, "");
      if (!name) continue;

      const rating = foopyRating(player);
      const goals = num(player.goals);
      const disposals = num(player.disposals);
      if (rating <= 0 && goals <= 0) continue;

      const known = findPlayerInfo(name, team);
      const key = known?.id ?? `${canonicalTeamKey(team)}-${slugName(name)}`;
      const existing = totals.get(key) ?? {
        team,
        name: known?.name ?? name,
        playerId: known?.id,
        apiSportsId: known?.apiSportsId != null ? Number(known.apiSportsId) : undefined,
        foopyTotal: 0,
        goalsTotal: 0,
        disposalsTotal: 0,
        games: 0,
      };

      existing.foopyTotal += rating;
      existing.goalsTotal += goals;
      existing.disposalsTotal += disposals;
      existing.games += 1;
      totals.set(key, existing);
    }
  }

  return [...totals.values()];
}

function previewPlayerLeaders(
  homeTeam: string,
  awayTeam: string,
  allGames: MatchGame[],
  currentGame: MatchGame,
  squad?: { home: number[]; away: number[] } | null,
) {
  const leadersFor = (team: string, squadIds?: number[]) => {
    let leaders = playerSeasonTotalsForTeam(team, allGames, currentGame);

    // Restrict to players named in this match's squad — the same set shown in
    // the Players tab. When the squad is known and at least one season leader is
    // in it, only squad members are eligible, so a non-playing season star is
    // replaced by the highest-rated player actually in the lineup.
    if (squadIds && squadIds.length) {
      const set = new Set(squadIds.map(Number));
      const inSquad = leaders.filter((l) => l.apiSportsId != null && set.has(Number(l.apiSportsId)));
      if (inSquad.length) leaders = inSquad;
    }

    return {
      topPlayer: [...leaders].sort((a, b) => b.foopyTotal - a.foopyTotal || b.goalsTotal - a.goalsTotal || b.games - a.games)[0] ?? null,
      topScorer: [...leaders].sort((a, b) => b.goalsTotal - a.goalsTotal || b.foopyTotal - a.foopyTotal || b.games - a.games)[0] ?? null,
    };
  };

  const home = leadersFor(homeTeam, squad?.home);
  const away = leadersFor(awayTeam, squad?.away);

  return {
    topPlayers: [home.topPlayer, away.topPlayer].filter((player): player is PreviewPlayerLeader => Boolean(player)),
    topScorers: [home.topScorer, away.topScorer].filter((player): player is PreviewPlayerLeader => Boolean(player)),
  };
}

function PreviewLeaderRow({ player, metric }: { player: PreviewPlayerLeader; metric: "foopy" | "goals" }) {
  const averageFoopy = player.games ? player.foopyTotal / player.games : 0;
  const avgDisposals = player.games ? (player.disposalsTotal / player.games).toFixed(1) : "0.0";
  const foopyBadgeBg = foopyColor(averageFoopy);
  const [failed, setFailed] = useState(false);
  const src = playerImagePath(player.name, player.team);
  const colours = teamColors(player.team);
  const accentColour = ["#000000", "#030303", "#14141e", "#111827"].includes(colours.secondary.toLowerCase())
    ? colours.primary
    : colours.secondary;
  const softAccent = accentColour === "#ffffff" ? "rgba(255,255,255,0.72)" : `${accentColour}cc`;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const content = (
    <div style={{
      position: "relative",
      minWidth: 0,
      height: "100%",
      borderRadius: 16,
      overflow: "hidden",
      background: `linear-gradient(155deg, ${colours.primary}50 0%, rgba(9,11,15,0.98) 52%)`,
      border: "none",
      boxShadow: `0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`,
      boxSizing: "border-box",
    }}>
      {/* Subtle top-right colour blob */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 80% 60% at 90% 0%, ${colours.primary}28 0%, transparent 65%)`,
      }} />

      {/* Team logo */}
      <img
        src={getLogo(player.team)}
        alt=""
        style={{
          position: "absolute",
          top: 10, right: 10,
          zIndex: 3,
          width: 28, height: 28,
          borderRadius: "50%",
          objectFit: "cover",
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      />

      {/* Player image */}
      <div style={{ position: "relative", height: 164, overflow: "hidden" }}>
        {!failed && src ? (
          <Image
            key={src}
            src={src}
            alt={player.name}
            fill
            sizes="180px"
            style={{
              objectFit: "contain",
              objectPosition: "center bottom",
              transform: "scale(1.18)",
              transformOrigin: "center bottom",
              filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.55))",
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "grid", placeItems: "center",
            color: "var(--text-1)", fontSize: 30, fontWeight: 950,
          }}>
            {getInitials(player.name)}
          </div>
        )}
        {/* Fade out bottom of image */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 80,
          background: "linear-gradient(to bottom, transparent 0%, rgba(6,7,10,0.9) 70%, rgba(6,7,10,1) 100%)",
        }} />
      </div>

      {/* Info */}
      <div style={{ position: "relative", zIndex: 2, padding: "2px 12px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
          {player.name}
        </div>
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginTop: 10, paddingTop: 10,
          borderTop: `1px solid rgba(255,255,255,0.07)`,
        }}>
          {/* Foopy */}
          <div>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 44, height: 28, padding: "0 10px",
              borderRadius: 8, background: foopyBadgeBg,
              color: "#fff", fontSize: 14, fontWeight: 1000, fontVariantNumeric: "tabular-nums",
            }}>
              {averageFoopy.toFixed(1)}
            </span>
            <span style={{ display: "block", marginTop: 5, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Foopy
            </span>
          </div>
          {/* Right stat: avg disposals for top players, goals for top scorers */}
          <div style={{ textAlign: "right" }}>
            <strong style={{ display: "block", fontSize: 28, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {metric === "foopy" ? avgDisposals : player.goalsTotal}
            </strong>
            <span style={{ display: "block", marginTop: 5, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {metric === "foopy" ? "Avg Disp" : "Goals"}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accentColour}80, ${accentColour}20)` }} />
    </div>
  );

  return player.playerId ? (
    <Link href={`/player/${player.playerId}`} prefetch={false} style={{ display: "block", minWidth: 0, textDecoration: "none", color: "inherit" }}>
      {content}
    </Link>
  ) : content;
}

function PreviewLeaderboard({ title, players, metric }: { title: string; players: PreviewPlayerLeader[]; metric: "foopy" | "goals" }) {
  return (
    <div style={{
      minWidth: 0,
      padding: "14px",
      borderRadius: 17,
      background: "rgba(255,255,255,0.035)",
      border: "none",
      boxShadow: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 1000, color: "var(--text-1)", marginBottom: 4 }}>
        <span style={{ width: 3, height: 15, borderRadius: 999, background: metric === "foopy" ? "#60a5fa" : "#facc15" }} />
        {title}
      </div>
      {players.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
          {players.map((player) => (
            <PreviewLeaderRow key={`${metric}-${player.playerId ?? player.name}-${player.team}`} player={player} metric={metric} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", placeItems: "center", minHeight: 86, color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 800 }}>
          No data
        </div>
      )}
    </div>
  );
}

function PlayerLeaderboardsBox({ homeTeam, awayTeam, allGames, currentGame, squadPlayers }: {
  homeTeam: string; awayTeam: string; allGames: MatchGame[]; currentGame: MatchGame; squadPlayers?: { home: number[]; away: number[] } | null;
}) {
  const { topPlayers, topScorers } = useMemo(
    () => previewPlayerLeaders(homeTeam, awayTeam, allGames, currentGame, squadPlayers),
    [homeTeam, awayTeam, allGames, currentGame, squadPlayers]
  );

  if (!topPlayers.length && !topScorers.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "0 0 14px" }}>
      <PreviewLeaderboard title="Top players" players={topPlayers} metric="foopy" />
      <PreviewLeaderboard title="Top scorers" players={topScorers} metric="goals" />
    </div>
  );
}

type LadderTeam = {
  team: string; played: number; wins: number; losses: number; draws: number;
  points: number; for: number; against: number;
};

function buildLadder(games: MatchGame[]): (LadderTeam & { rank: number })[] {
  const map: Record<string, LadderTeam> = {};
  const ensure = (name: string) => {
    if (!map[name]) map[name] = { team: name, played: 0, wins: 0, losses: 0, draws: 0, points: 0, for: 0, against: 0 };
    return map[name];
  };
  for (const g of games) {
    if ((Number(g.complete) < 100 && !(g as any).is_final) || !g.hteam || !g.ateam) continue;
    const hs = Number(g.hscore ?? 0), as_ = Number(g.ascore ?? 0);
    const h = ensure(g.hteam), a = ensure(g.ateam);
    h.played++; a.played++;
    h.for += hs; h.against += as_; a.for += as_; a.against += hs;
    if (hs > as_) { h.wins++; h.points += 4; a.losses++; }
    else if (as_ > hs) { a.wins++; a.points += 4; h.losses++; }
    else { h.draws++; a.draws++; h.points += 2; a.points += 2; }
  }
  const sorted = Object.values(map).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : (b.for / Math.max(b.against, 1)) - (a.for / Math.max(a.against, 1))
  );
  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}

const WEATHER_DESC: Record<number, string> = {
  0:"Sunny", 1:"Mostly sunny", 2:"Partly cloudy", 3:"Overcast",
  45:"Foggy", 48:"Icy fog", 51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle",
  61:"Light rain", 63:"Rain", 65:"Heavy rain",
  71:"Light snow", 73:"Snow", 75:"Heavy snow", 77:"Snow grains",
  80:"Showers", 81:"Heavy showers", 82:"Violent showers",
  95:"Thunderstorms", 96:"Thunderstorms", 99:"Severe thunderstorms",
};

// Coloured SVG weather icons keyed by Open-Meteo weather code. Used instead of
// emoji so the icon renders the same — and in colour — on every platform
// (emoji clouds in particular show as a flat white glyph on mobile).
function WeatherIcon({ code, size = 30 }: { code: number; size?: number }) {
  const sun = "#fbbf24";
  const cloud = "#cbd5e1";
  const cloudDark = "#94a3b8";
  const rain = "#38bdf8";
  const snow = "#e0f2fe";
  const bolt = "#facc15";

  // Reusable shapes
  const Sun = ({ cx = 12, cy = 12, r = 5 }: { cx?: number; cy?: number; r?: number }) => (
    <>
      <circle cx={cx} cy={cy} r={r} fill={sun} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = (a * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (r + 2.5), y1 = cy + Math.sin(rad) * (r + 2.5);
        const x2 = cx + Math.cos(rad) * (r + 5),   y2 = cy + Math.sin(rad) * (r + 5);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={sun} strokeWidth={2} strokeLinecap="round" />;
      })}
    </>
  );
  const Cloud = ({ fill = cloud, x = 0, y = 0 }: { fill?: string; x?: number; y?: number }) => (
    <path
      transform={`translate(${x} ${y})`}
      d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.2 3.9 3.9 0 0 1 16.5 18Z"
      fill={fill}
    />
  );
  const drop = (x: number) => <line x1={x} y1={19} x2={x - 1.5} y2={22.5} stroke={rain} strokeWidth={2} strokeLinecap="round" />;
  const flake = (x: number) => <circle cx={x} cy={20.5} r={1.3} fill={snow} />;

  let body: React.ReactNode;
  if (code === 0) {
    body = <Sun cx={12} cy={12} r={6} />;
  } else if (code === 1 || code === 2) {
    body = (<><Sun cx={9} cy={8} r={4} /><Cloud fill={cloud} y={2} /></>);
  } else if (code === 3 || code === 45 || code === 48) {
    body = <Cloud fill={code === 3 ? cloud : cloudDark} y={1} />;
  } else if ([51, 53, 55, 61, 63, 65, 80, 81].includes(code)) {
    body = (<><Cloud fill={cloud} y={-1} />{drop(8)}{drop(12)}{drop(16)}</>);
  } else if ([71, 73, 75, 77].includes(code)) {
    body = (<><Cloud fill={cloud} y={-1} />{flake(8)}{flake(12)}{flake(16)}</>);
  } else if ([82, 95, 96, 99].includes(code)) {
    body = (<><Cloud fill={cloudDark} y={-1} /><path d="M12 18l-3 4h2.2l-1.2 3 4-4.5h-2.3L13 18Z" fill={bolt} /></>);
  } else {
    body = <Cloud fill={cloud} y={1} />;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 26" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {body}
    </svg>
  );
}

function VenueCard({ venue, date, gameId }: { venue: string; date?: string; gameId?: string | number }) {
  const info = lookupVenue(venue);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [attendance, setAttendance] = useState<number | null>(null);

  // Fetch crowd attendance (populated post-game by the sync-attendances cron)
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    fetch(`/api/attendance?game_id=${gameId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.attendance != null) setAttendance(Number(d.attendance)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [gameId]);

  useEffect(() => {
    if (!date) return;
    const day = date.slice(0, 10);
    let cancelled = false;

    // Go through our own server proxy so the browser never touches Open-Meteo
    // directly. Known venues pass coordinates; unknown ones pass the name for
    // the server to geocode.
    const params = new URLSearchParams({ date: day });
    if (info) {
      params.set("lat", String(info.lat));
      params.set("lon", String(info.lon));
    } else if (venue) {
      params.set("venue", venue);
    } else {
      return;
    }

    fetch(`/api/weather?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.weather) setWeather(d.weather); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [info, date, venue]);

  if (!venue) return null;
  // Show the real/sponsor name when we know it, else fall back to Squiggle's name.
  const title = info?.displayName ?? venue;
  // Known venue → drop a pin at its exact coordinates (precise); otherwise
  // fall back to a text search on the venue name.
  const mapsUrl = info
    ? `https://www.google.com/maps/search/?api=1&query=${info.lat},${info.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;

  const divider = <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 18px" }} />;

  return (
    <div style={{
      margin: "0 0 14px",
      borderRadius: 18,
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      border: "none",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</div>
            {info?.location && <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 4 }}>{info.location}</div>}
          </div>
        </div>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#34d058">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </a>
      </div>

      {/* Attendance + Capacity (with % filled bar once the crowd is known) */}
      {info && (() => {
        const capNum = Number(String(info.capacity).replace(/[^0-9]/g, "")) || 0;
        const pct = attendance && capNum ? Math.min(100, Math.round((attendance / capNum) * 100)) : null;
        return (
          <>
            {divider}
            <div style={{ padding: "15px 18px" }}>
              {attendance != null ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Attendance</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{attendance.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Capacity</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{info.capacity}</span>
                    </div>
                  </div>
                  {pct != null && (
                    <div style={{ position: "relative", marginTop: 12, height: 14, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, minWidth: 34, background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#04210f", padding: "0 8px", whiteSpace: "nowrap" }}>{pct}%</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>Capacity</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{info.capacity}</span>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* Weather forecast — live from Open-Meteo for game day */}
      {weather && (
        <>
          {divider}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px 17px" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Weather forecast</span>
            <WeatherIcon code={weather.code} size={30} />
            <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)" }}>{weather.temp}°C</span>
            <span style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>{WEATHER_DESC[weather.code] ?? "—"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function LadderPositionsBox({ homeTeam, awayTeam, allGames }: { homeTeam: string; awayTeam: string; allGames: MatchGame[] }) {
  const ladder = useMemo(() => buildLadder(allGames), [allGames]);
  const rows = ladder.filter(t => flexMatchTeam(t.team, homeTeam) || flexMatchTeam(t.team, awayTeam));
  const compact = useCompactViewport();
  if (rows.length === 0) return null;

  // On compact (mobile) use narrower stat columns so the team name has room
  const sw = compact ? { P: 32, WLD: 54, PTS: 38, PCT: 50 } : { P: 68, WLD: 68, PTS: 68, PCT: 68 };
  const statCell: React.CSSProperties = {
    textAlign: "right", fontSize: compact ? 13 : 15, fontWeight: 700,
    fontVariantNumeric: "tabular-nums", color: "var(--text-1)", flexShrink: 0,
  };

  return (
    <Link href="/ladder" prefetch={false} style={{ textDecoration: "none", display: "block", margin: "0 0 14px", borderRadius: 18,
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      border: "none",
      overflow: "hidden",
    }}>
      {/* title + header */}
      <div style={{ padding: "18px 16px 0" }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" }}>Ladder</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 16px 4px" }}>
        <div style={{ width: 26, flexShrink: 0 }} />
        <div style={{ width: 36, flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        {(["P", "W-L-D", "PTS", "%"] as const).map((h, hi) => (
          <div key={h} style={{ width: [sw.P, sw.WLD, sw.PTS, sw.PCT][hi], textAlign: "right", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", flexShrink: 0 }}>{h}</div>
        ))}
      </div>

      {rows.map((t, i) => {
        const logo = getLogo(t.team);
        const pct = t.against > 0 ? (t.for / t.against * 100).toFixed(1) : "–";
        const wdl = t.draws > 0 ? `${t.wins}-${t.losses}-${t.draws}` : `${t.wins}-${t.losses}`;
        const teamLabel = compact ? getAbbr(t.team) : t.team;
        return (
          <div key={t.team} style={{
            display: "flex", alignItems: "center",
            padding: "14px 16px",
            borderTop: i > 0 ? "0.5px solid rgba(255,255,255,0.07)" : undefined,
          }}>
            <div style={{ width: 26, flexShrink: 0, fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>{t.rank}</div>
            <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
              <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: compact ? 14 : 15, fontWeight: 800, color: "var(--text-1)", paddingLeft: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: '"Druk Wide", "Arial Black", Impact, sans-serif' }}>
              {teamLabel}
            </div>
            <div style={{ ...statCell, width: sw.P }}>{t.played}</div>
            <div style={{ ...statCell, width: sw.WLD }}>{wdl}</div>
            <div style={{ ...statCell, width: sw.PTS, fontWeight: 900 }}>{t.points}</div>
            <div style={{ ...statCell, width: sw.PCT }}>{pct}</div>
          </div>
        );
      })}
    </Link>
  );
}

function InsightsBox({ game, allGames }: { game: MatchGame; allGames: MatchGame[] }) {
  const insights = generateInsights(game.hteam, game.ateam, game, allGames, teamStatsJson as Record<string, any>, API_TEAM_ID_BY_NAME);
  if (!insights.length) return null;

  let lastTeam: string | null | undefined = undefined;

  return (
    <div style={{
      margin: "20px 0 8px",
      background: "var(--surface-1)",
      border: "none",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      <div style={{ padding: "14px 16px 10px", fontWeight: 900, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em" }}>
        Insights
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {insights.map((ins, i) => {
          const barColor = ins.team ? teamColor(ins.team, "primary") : "#3b82f6";
          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 14px",
              background: "var(--surface-1)",
              borderRadius: 10,
              margin: `0 8px ${i === insights.length - 1 ? 8 : 3}px`,
            }}>
              {/* Circular logo on every row */}
              {ins.team
                ? <img src={getLogo(ins.team)} alt={ins.team} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", objectFit: "cover" }} />
                : <div style={{ width: 30, height: 30, flexShrink: 0 }} />
              }
              {/* Team-coloured accent bar */}
              <div style={{ width: 3, alignSelf: "stretch", minHeight: 32, background: barColor, borderRadius: 4, flexShrink: 0, opacity: 0.85 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb", lineHeight: 1.45 }}>
                {ins.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getLiveGameClock(events: LiveEvent[]) {
  const latest = [...events].reverse().find((e) => e.period || e.quarter || e.minute);
  if (!latest) return "Q- · --'";
  return `${eventQuarter(latest)} · ${latest.minute ?? "-"}'`;
}

function normalizeTeamName(name: any) {
  return safeText(name, "")
    .replace("Adelaide Crows", "Adelaide")
    .replace("Brisbane Lions", "Brisbane")
    .replace("Geelong Cats", "Geelong")
    .replace("Gold Coast Suns", "Gold Coast")
    .replace("Greater Western Sydney Giants", "GWS")
    .replace("Greater Western Sydney", "GWS")
    .replace("GWS Giants", "GWS")
    .replace("Hawthorn Hawks", "Hawthorn")
    .replace("Port Adelaide Power", "Port Adelaide")
    .replace("Richmond Tigers", "Richmond")
    .replace("St Kilda Saints", "St Kilda")
    .replace("Sydney Swans", "Sydney")
    .replace("West Coast Eagles", "West Coast")
    .trim();
}

function getApiTeamId(teamName: any) {
  return API_TEAM_ID_BY_NAME[teamName] ?? API_TEAM_ID_BY_NAME[normalizeTeamName(teamName)] ?? 0;
}

function teamPlayedGame(game: MatchGame, team: any) {
  const target = normalizeTeamName(team);
  return normalizeTeamName(game.hteam) === target || normalizeTeamName(game.ateam) === target;
}

function getTeamRecordBeforeGame(team: any, games: MatchGame[], beforeGame: MatchGame) {
  const target = normalizeTeamName(team);
  const beforeTime = beforeGame.date ? new Date(beforeGame.date).getTime() : Infinity;
  let wins = 0;
  let losses = 0;
  let draws = 0;

  games.forEach((game) => {
    if (String(game.id) === String(beforeGame.id)) return;
    if (getStatus(game) !== "FINAL") return;
    if (!teamPlayedGame(game, target)) return;

    const gameTime = game.date ? new Date(game.date).getTime() : 0;
    if (gameTime >= beforeTime) return;

    const homeScore = num(game.hscore);
    const awayScore = num(game.ascore);
    const isHome = normalizeTeamName(game.hteam) === target;

    if (homeScore === awayScore) draws += 1;
    else if ((isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore)) wins += 1;
    else losses += 1;
  });

  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}



function playerTeamFromStatRow(player: any) {
  const mapped = findPlayerByApiSportsId(getApiPlayerId(player));
  return normalizeTeamName(mapped?.club ?? mapped?.team ?? player?.club ?? player?.team ?? "");
}

function knownPlayerTeam(player: PlayerStat) {
  const known = findPlayerInfo(player.name ?? player.player);
  return normalizeTeamName(known?.club ?? known?.team ?? "");
}

function mergeStatsByKnownTeam(homeTeamName: any, awayTeamName: any, rawHome: PlayerStat[], rawAway: PlayerStat[]) {
  const homeTeam = normalizeTeamName(homeTeamName);
  const awayTeam = normalizeTeamName(awayTeamName);
  const allPlayers = [...rawHome, ...rawAway];
  const knownHome = allPlayers.filter((player) => knownPlayerTeam(player) === homeTeam);
  const knownAway = allPlayers.filter((player) => knownPlayerTeam(player) === awayTeam);

  const home = [
    ...rawHome.filter((player) => {
      const knownTeam = knownPlayerTeam(player);
      return !knownTeam || knownTeam === homeTeam;
    }),
    ...knownHome.filter((player) => !rawHome.includes(player)),
  ];

  const away = [
    ...rawAway.filter((player) => {
      const knownTeam = knownPlayerTeam(player);
      return !knownTeam || knownTeam === awayTeam;
    }),
    ...knownAway.filter((player) => !rawAway.includes(player)),
  ];

  return { home, away };
}

function teamBlockRosterScore(block: any, teamName: any) {
  const expected = normalizeTeamName(teamName);
  if (!expected || !Array.isArray(block?.players)) return 0;

  return block.players.reduce((score: number, player: any) => {
    return score + (playerTeamFromStatRow(player) === expected ? 1 : 0);
  }, 0);
}

function getTeamBlock(teamStats: any[], teamId: number, fallbackIndex: number, otherBlock?: any) {
  if (!Array.isArray(teamStats) || !teamStats.length) return null;

  const matched = teamStats.find(
    (t: any) =>
      t !== otherBlock &&
      Number(t.team?.id ?? t.team_id ?? t.id) === Number(teamId)
  );

  if (matched) return matched;

  const remaining = teamStats.find((t: any) => t !== otherBlock);
  return remaining ?? teamStats[fallbackIndex] ?? null;
}

function getPlayerTeamBlock(teamStats: any[], teamId: number, teamName: any, fallbackIndex: number, otherBlock?: any) {
  if (!Array.isArray(teamStats) || !teamStats.length) return null;

  const rosterMatched = [...teamStats]
    .filter((t: any) => t !== otherBlock)
    .map((block: any, index: number) => ({
      block,
      index,
      score: teamBlockRosterScore(block, teamName),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];

  if (rosterMatched && rosterMatched.score > 0) return rosterMatched.block;

  return getTeamBlock(teamStats, teamId, fallbackIndex, otherBlock);
}

function getTeamStatFromBlock(team: any, category: string, key: string) {
  if (!team) return 0;

  if (category === "marks") return Number(team.statistics?.marks ?? 0);

  if (category === "shots") {
    return Number(team.statistics?.scoring?.goals ?? 0) + Number(team.statistics?.scoring?.behinds ?? 0);
  }

  return Number(team.statistics?.[category]?.[key] ?? 0);
}

function ScoreWorm({
  events,
  homeTeamId,
  awayTeamId,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
}: {
  events: LiveEvent[];
  homeTeamId: number;
  awayTeamId: number;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
}) {
  // Sort all goal/behind events by period then minute
  const scoringEvents = events
    .filter((e) => e.type === "GOAL" || e.type === "BEHIND")
    .sort((a, b) => {
      const pd = Number(a.period ?? 0) - Number(b.period ?? 0);
      if (pd !== 0) return pd;
      return Number(a.minute ?? 0) - Number(b.minute ?? 0);
    });

  if (scoringEvents.length === 0) return null;

  // Reconstruct running score from team_id + type — no reliance on homeScore/awayScore
  const pts = (type: string) => (type === "GOAL" ? 6 : 1);
  let home = 0, away = 0;
  const points: { home: number; away: number; period: number }[] = [{ home: 0, away: 0, period: 1 }];

  for (const e of scoringEvents) {
    const tid = Number(e.teamId);
    if (tid === homeTeamId) home += pts(e.type ?? "");
    else if (tid === awayTeamId) away += pts(e.type ?? "");
    else {
      // Fallback: use stored homeScore/awayScore if team_id doesn't match either team
      if (e.homeScore != null && e.awayScore != null) {
        home = Number(e.homeScore);
        away = Number(e.awayScore);
      } else continue;
    }
    points.push({ home, away, period: Number(e.period ?? points[points.length - 1].period) });
  }

  if (points.length < 2) return null;

  const margins = points.map((p) => p.home - p.away);
  const maxAbs = Math.max(...margins.map(Math.abs), 12);

  const W = 600;
  const H = 180;
  const padL = 36;
  const padR = 28;
  const padT = 16;
  const padB = 16;
  const midY = padT + (H - padT - padB) / 2;

  const xOf = (i: number) =>
    padL + (i / (points.length - 1)) * (W - padL - padR);
  const yOf = (margin: number) =>
    midY - (margin / maxAbs) * (midY - padT);

  // Stepped segments: horizontal then vertical
  const segments: { d: string; color: string }[] = [];
  for (let i = 1; i < points.length; i++) {
    const x1 = xOf(i - 1), y1 = yOf(margins[i - 1]);
    const x2 = xOf(i),     y2 = yOf(margins[i]);
    const col = margins[i - 1] > 0 ? homeColor : margins[i - 1] < 0 ? awayColor : "#64748b";
    segments.push({ d: `M${x1.toFixed(1)},${y1.toFixed(1)} H${x2.toFixed(1)}`, color: col });
    segments.push({ d: `M${x2.toFixed(1)},${y1.toFixed(1)} V${y2.toFixed(1)}`, color: col });
  }

  // Quarter break lines where period changes
  const quarterBreakXs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].period > points[i - 1].period) {
      quarterBreakXs.push(xOf(i));
    }
  }

  const lastMargin = margins[margins.length - 1];
  const lastX = xOf(points.length - 1);
  const lastY = yOf(lastMargin);
  const endColor = lastMargin > 0 ? homeColor : lastMargin < 0 ? awayColor : "#64748b";

  const tickStep = maxAbs <= 12 ? 4 : maxAbs <= 30 ? 8 : 12;
  const ticks = Array.from({ length: Math.floor(maxAbs / tickStep) }, (_, i) => (i + 1) * tickStep);

  return (
    <div style={{ margin: "0 0 20px", background: "var(--surface-1)", borderRadius: 12, padding: "10px 4px 6px", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {/* Grid lines */}
        {ticks.flatMap((v) => [v, -v].map((s) => (
          <line key={s} x1={padL} y1={yOf(s)} x2={W - padR} y2={yOf(s)}
            stroke="var(--border-1)" strokeWidth="1" />
        )))}

        {/* Zero line */}
        <line x1={padL} y1={midY} x2={W - padR} y2={midY}
          stroke="var(--border-3)" strokeWidth="1" />

        {/* Quarter breaks */}
        {quarterBreakXs.map((x, i) => (
          <line key={i} x1={x} y1={padT} x2={x} y2={H - padB}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4 3" />
        ))}

        {/* Worm */}
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} stroke={seg.color} strokeWidth="2.5"
            fill="none" strokeLinecap="square" />
        ))}

        {/* End dot */}
        <circle cx={lastX} cy={lastY} r="4.5" fill={endColor} />

        {/* Team labels */}
        <text x={padL - 4} y={padT + 8} fill={homeColor} fontSize="11" fontWeight="700"
          fontFamily="sans-serif" textAnchor="end">{homeAbbr}</text>
        <text x={padL - 4} y={H - padB - 2} fill={awayColor} fontSize="11" fontWeight="700"
          fontFamily="sans-serif" textAnchor="end">{awayAbbr}</text>

        {/* Y-axis numbers */}
        {ticks.map((v) => (
          <g key={v}>
            <text x={W - padR + 4} y={yOf(v) + 4} fill="rgba(255,255,255,0.3)"
              fontSize="9" fontFamily="sans-serif">{v}</text>
            <text x={W - padR + 4} y={yOf(-v) + 4} fill="rgba(255,255,255,0.3)"
              fontSize="9" fontFamily="sans-serif">{v}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Module-level cache so navigating between games in the same round (via the
// round strip) can show the new game's header instantly, since the page
// component remounts on route param change but this module stays loaded.
let cachedAllGames: MatchGame[] = [];

function MatchPageInner() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");

  // Seed from the shared games cache the home page already populated, so a
  // tap from the home page renders the match INSTANTLY (correct game, round
  // strip, scores) instead of flashing a skeleton while /api/games refetches.
  // The background refresh below still runs to pick up live score changes.
  if (cachedAllGames.length === 0) {
    const shared = getGamesCached() as MatchGame[] | null;
    if (shared && shared.length) cachedAllGames = shared;
  }

  const [mounted, setMounted] = useState(() => typeof window !== "undefined");
  // Only the admin sees raw player IDs for unidentified players; the state
  // change forces a re-render so the (module-flag-reading) name helpers update.
  const [, setAdminView] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const admin = !!ADMIN_USER_ID && data.session?.user?.id === ADMIN_USER_ID;
      adminPlayerView = admin;
      setAdminView(admin);
    });
  }, []);
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    (searchParams?.get("tab") as TabKey) ?? "feed"
  );
  const [playerSubTab, setPlayerSubTab] = useState<"all" | "home" | "away">("all");
  const [playerStatMode, setPlayerStatMode] = useState<StatMode>("basic");
  const [playerSortKey, setPlayerSortKey] = useState<SortKey>("foopy");
  const [playerSortDir, setPlayerSortDir] = useState<"desc" | "asc">("desc");
  // User-chosen stat columns for the player tables (persisted). Start with the
  // default set on the server/first render to avoid a hydration mismatch, then
  // load the saved preference after mount.
  const [statCols, setStatCols] = useState<SortKey[]>(DEFAULT_STAT_COLS);
  const [statColsEditorOpen, setStatColsEditorOpen] = useState(false);
  useEffect(() => { setStatCols(loadStatCols()); }, []);
  const applyStatCols = useCallback((next: SortKey[]) => {
    const ordered = STAT_COLUMNS.filter((c) => next.includes(c.id)).map((c) => c.id);
    setStatCols(ordered);
    saveStatCols(ordered);
  }, []);
  const [seasonStats, setSeasonStats] = useState<any[]>([]);
  const [squadPlayers, setSquadPlayers] = useState<{ home: number[]; away: number[] } | null>(null);
  const [unansweredPollCount, setUnansweredPollCount] = useState(0);
  const [hasDuelGame, setHasDuelGame] = useState(false);
  const [game, setGame] = useState<MatchGame | null>(() =>
    cachedAllGames.find((g) => String(g.id) === id) ?? null
  );
  const [savedMatch, setSavedMatch] = useState<SavedMatchStats | null>(null);
  const [homeStats, setHomeStats] = useState<PlayerStat[]>([]);
  const [awayStats, setAwayStats] = useState<PlayerStat[]>([]);
  const [liveHomeStats, setLiveHomeStats] = useState<PlayerStat[]>([]);
  const [liveAwayStats, setLiveAwayStats] = useState<PlayerStat[]>([]);
  const [liveStatsError, setLiveStatsError] = useState("");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(true);
  const [eventCommentCounts, setEventCommentCounts] = useState<Record<string, number>>({});
  const [eventTopComments, setEventTopComments] = useState<Record<string, { body: string; username: string; avatar: string | null }>>({});
  const [eventReactions, setEventReactions] = useState<EventReactionMap>({});
  const [myEventReactions, setMyEventReactions] = useState<MyEventReactionMap>({});
  const [reactionPopup, setReactionPopup] = useState<EventReactionPopupState>(null);
  const seenEventKeys = useRef(new Set<string>());
  // Snapshot of each player's FP at the moment their event first appeared.
  // Keyed by the event's scoreEventKey so the displayed FP never changes as
  // the player accumulates more points during the game.
  const eventFPSnapshots = useRef<Record<string, number>>({});
  // Same idea for foopy rating / disposals / goals, used as a fallback for
  // events whose live_game_feed row doesn't have a stored snapshot yet.
  const eventStatSnapshots = useRef<Record<string, { foopy: number; disposals: number; goals: number; tackles: number; marks: number; hitouts: number }>>({});
  const initialFeedLoaded = useRef(false);
  const [freshEventKeys, setFreshEventKeys] = useState(new Set<string>());
  const [loading, setLoading] = useState(() =>
    !cachedAllGames.some((g) => String(g.id) === id)
  );
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [allGames, setAllGames] = useState<MatchGame[]>(() => cachedAllGames);
  const [roundGames, setRoundGames] = useState<MatchGame[]>(() => {
    const cached = cachedAllGames.find((g) => String(g.id) === id);
    return cached
      ? cachedAllGames
          .filter((g) => String(g.round) === String(cached.round))
          .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime())
      : [];
  });
  const scrollRef = useRef(0);
  const rafRef = useRef<number>(0);
  const matchSectionRef = useRef<HTMLElement>(null);
  const stickyHeaderRoRef  = useRef<ResizeObserver | null>(null);
  const stickyHeaderElRef  = useRef<HTMLDivElement | null>(null);
  const headerContainerRef = useRef<HTMLDivElement>(null); // receives --p; CSS does the rest
  const [stickyHeaderH, setStickyHeaderH] = useState(0);
  /** Prevents re-fetching final stats on every 5-second game-poll tick */
  const finalStatsFetchedRef = useRef(false);
  const gameRef = useRef(game);

  const [liveViewerCount, setLiveViewerCount] = useState(0);
  const [totalViewerCount, setTotalViewerCount] = useState<number | null>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  // Quarter-by-quarter scores from the games/quarters API endpoint.
  const [quarterScores, setQuarterScores] = useState<{
    home: ({ goals: number; behinds: number; total: number } | null)[];
    away: ({ goals: number; behinds: number; total: number } | null)[];
  } | null>(null);
  const [quarterScoresLoading, setQuarterScoresLoading] = useState(true);
  const [quarterScoreDisplayMode, setQuarterScoreDisplayMode] = useState<QuarterScoreDisplayMode>("total");

  const apiSportsGameId = useMemo(() => {
    const mapped = (API_SPORTS_MATCH_IDS as Record<string, any>)[id];
    return String(mapped || getApiSportsGameId(savedMatch, id));
  }, [savedMatch, id]);

  useEffect(() => {
    const read = () => {
      try {
        setQuarterScoreDisplayMode(normalizeQuarterScoreDisplay(localStorage.getItem(QUARTER_SCORE_DISPLAY_KEY)));
      } catch {
        setQuarterScoreDisplayMode("total");
      }
    };
    read();
    window.addEventListener("foopy-settings-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("foopy-settings-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "game") return;
    if (!apiSportsGameId) return;
    const isFinal = game && getStatus(game) === "FINAL";
    fetch(`/api/afl/quarters?id=${apiSportsGameId}${isFinal ? "&final=true" : ""}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const resp = data?.response?.[0];
        const quarters: any[] = resp?.quarters ?? [];
        if (!quarters.length) return;
        // goals, behinds, and points are all CUMULATIVE in the API response
        // (Q2 shows total through Q2, Q3 through Q3, etc.) — use directly, no summing
        const n = (v: any) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
        const home: ({ goals: number; behinds: number; total: number } | null)[] = [];
        const away: ({ goals: number; behinds: number; total: number } | null)[] = [];
        for (let q = 1; q <= 4; q++) {
          const qd = quarters.find((qt: any) => Number(qt.quarter) === q);
          if (!qd) { home.push(null); away.push(null); continue; }
          const hg = n(qd.teams?.home?.goals), hb = n(qd.teams?.home?.behinds), hp = n(qd.teams?.home?.points);
          const ag = n(qd.teams?.away?.goals), ab = n(qd.teams?.away?.behinds), ap = n(qd.teams?.away?.points);
          home.push({ goals: hg, behinds: hb, total: hp || (hg * 6 + hb) });
          away.push({ goals: ag, behinds: ab, total: ap || (ag * 6 + ab) });
        }
        if (home.some(Boolean) || away.some(Boolean)) setQuarterScores({ home, away });
      })
      .catch(() => {})
      .finally(() => setQuarterScoresLoading(false));
  }, [activeTab, apiSportsGameId, game]);

  useEffect(() => {
    if (!apiSportsGameId) return;

    const savedTeamStats =
      (teamStatsJson as Record<string, any>)[String(apiSportsGameId)] ??
      (teamStatsJson as Record<string, any>)[String(id)] ??
      null;

    setTeamStats(savedTeamStats?.teams ?? []);
  }, [apiSportsGameId, id]);

  useEffect(() => {
    setMounted(true);
    window.scrollTo(0, 0); // always start match page at top, prevents scroll-restoration glitch
    // Restore iOS rubber-band/momentum scrolling on this page. The global
    // body rule sets overscroll-behavior-y:none (so the home page's custom
    // pull-to-refresh works), but that also kills the native momentum feel.
    // The match page has no pull-to-refresh, so re-enable it here only.
    document.body.classList.add("momentum-scroll");
    return () => document.body.classList.remove("momentum-scroll");
  }, []);

  // Per-frame work is intentionally tiny: write ONE eased CSS variable.
  // All geometry (height, logo travel/scale, score scale, fades) is expressed
  // in CSS via calc(var(--p)) using transform/opacity only → composited, 60fps.
  const applyScrollVars = useCallback((sp: number) => {
    const hc = headerContainerRef.current;
    if (!hc) return;
    hc.style.setProperty("--p", easeInOut(clamp01(sp)).toFixed(4));
  }, []);

  useLayoutEffect(() => { applyScrollVars(scrollRef.current); });

  useEffect(() => {
    if (!mounted) return;

    // On desktop (non-touch, pointer device) the mouse-wheel fires in large
    // discrete jumps that make height-based animations look jerky.
    // Keep the header fully expanded on desktop; only animate on touch/mobile.
    const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (isDesktop) {
      applyScrollVars(0); // always expanded on desktop
      return;
    }

    const update = () => {
      const sp = matchScrollProgress(window.scrollY || window.pageYOffset || 0);
      scrollRef.current = sp;
      applyScrollVars(sp);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mounted, applyScrollVars]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    if (!mounted || !id) return;

    let cancelled = false;

    async function loadMatch(isFirst = false) {
      try {
        if (isFirst) {
          setError("");
          // If we already have this game's data cached (e.g. switching between
          // games in the same round via the top strip), show it instantly
          // instead of blanking the whole page with a skeleton.
          const cached = cachedAllGames.find((g) => String(g.id) === id) ?? null;
          if (cached) {
            setGame(cached);
            setRoundGames(
              cachedAllGames
                .filter((g) => String(g.round) === String(cached.round))
                .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime())
            );
            setLoading(false);
          } else {
            setLoading(true);
          }
        }

        const gamesUrl = `/api/games?fresh=1&t=${Date.now()}`;
        const res = await fetch(gamesUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load Squiggle games.");

        const games = await res.json();
        const gameList: MatchGame[] = Array.isArray(games) ? games : (games?.games ?? []);
        const found =
          gameList.find((g: MatchGame) => String(g.id) === id) ??
          null;

        if (!cancelled) {
          setAllGames(gameList);
          cachedAllGames = gameList;
          setGame(found);
          setRoundGames(
            found
              ? gameList
                  .filter((g) => String(g.round) === String(found.round))
                  .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime())
              : []
          );
        }
      } catch {
        if (!cancelled && isFirst) {
          setError("Could not load this match.");
          setGame(null);
          setRoundGames([]);
        }
      } finally {
        if (!cancelled && isFirst) setLoading(false);
      }
    }

    loadMatch(true);
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadMatch(false);
    }, 5_000);

    const handleVisibility = () => {
      if (!document.hidden) loadMatch(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mounted, id]);

  useEffect(() => {
    if (!mounted || !game || !id) return;

    const saved =
      (matchStatsJson as Record<string, any>)[String(apiSportsGameId)] ??
      (matchStatsJson as Record<string, any>)[String(id)] ??
      null;

    setSavedMatch(saved);

    if (!saved) {
      setHomeStats([]);
      setAwayStats([]);
      return;
    }

    const homeTeamName = saved.homeTeam || game.hteam;
    const awayTeamName = saved.awayTeam || game.ateam;

    const teams = Array.isArray((saved as any).teams)
      ? (saved as any).teams
      : Array.isArray((saved as any).playerStats)
      ? (saved as any).playerStats
      : [];

    let rawHome: PlayerStat[] = [];
    let rawAway: PlayerStat[] = [];

    if (teams.length) {
      const homeApiTeamId = getApiTeamId(game.hteam);
      const awayApiTeamId = getApiTeamId(game.ateam);

      const homeTeamBlock = getPlayerTeamBlock(teams, homeApiTeamId, homeTeamName, 0);
      const awayTeamBlock = getPlayerTeamBlock(teams, awayApiTeamId, awayTeamName, 1, homeTeamBlock);

      rawHome = (homeTeamBlock?.players || []).map((p: any) => normalizeSavedPlayer(p, homeTeamName));
      rawAway = (awayTeamBlock?.players || []).map((p: any) => normalizeSavedPlayer(p, awayTeamName));
    } else {
      rawHome = (saved.homePlayers || []).map((p: any) => normalizeSavedPlayer(p, p.team || p.club || homeTeamName));
      rawAway = (saved.awayPlayers || []).map((p: any) => normalizeSavedPlayer(p, p.team || p.club || awayTeamName));
    }

    const split = mergeStatsByKnownTeam(homeTeamName, awayTeamName, rawHome, rawAway);
    setHomeStats(split.home.length ? split.home : rawHome);
    setAwayStats(split.away.length ? split.away : rawAway);
  }, [mounted, game, id]);

  const status = getStatus(game);
  const isLiveGame = status === "LIVE";
  const showStatsTabs = status === "LIVE" || status === "FINAL";
  const showPlayersTabs = status === "LIVE" || status === "FINAL" || status === "UPCOMING";

  const tabList = useMemo<TabKey[]>(() => [
    "feed", "chat", "polls",
    ...(hasDuelGame ? (["duels"] as TabKey[]) : []),
    ...(showStatsTabs ? (["game"] as TabKey[]) : []),
    ...(showPlayersTabs ? (["players"] as TabKey[]) : []),
  ], [hasDuelGame, showStatsTabs, showPlayersTabs]);

  const [tabAnimDir, setTabAnimDir] = useState<1 | -1>(1);
  const goToTab = useCallback((next: TabKey) => {
    setActiveTab(prev => {
      if (next === prev) return prev;
      const oldIdx = tabList.indexOf(prev);
      const newIdx = tabList.indexOf(next);
      setTabAnimDir(newIdx > oldIdx ? 1 : -1);
      return next;
    });
  }, [tabList]);

  // Swipe-to-switch-tabs (on the content area below the tab bar)
  const tabTouchRef = useRef<{ x: number; y: number; skip: boolean } | null>(null);
  const onTabTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    let el = e.target as HTMLElement | null;
    let skip = false;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth + 2) { skip = true; break; }
      el = el.parentElement;
    }
    tabTouchRef.current = { x: t.clientX, y: t.clientY, skip };
  }, []);
  const onTabTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = tabTouchRef.current;
    tabTouchRef.current = null;
    if (!start || start.skip) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = tabList.indexOf(activeTab);
    if (idx === -1) return;
    if (dx < 0 && idx < tabList.length - 1) goToTab(tabList[idx + 1]);
    else if (dx > 0 && idx > 0) goToTab(tabList[idx - 1]);
  }, [tabList, activeTab, goToTab]);

  // Swipe-to-change-match (on the top header/score area)
  const headerTouchRef = useRef<{ x: number; y: number } | null>(null);
  const onHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    headerTouchRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onHeaderTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = headerTouchRef.current;
    headerTouchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = roundGames.findIndex(g => String(g.id) === id);
    if (idx === -1) return;
    if (dx < 0 && idx < roundGames.length - 1) router.push(`/match/${roundGames[idx + 1].id}`);
    else if (dx > 0 && idx > 0) router.push(`/match/${roundGames[idx - 1].id}`);
  }, [roundGames, id, router]);

  // Current quarter number — max of live events period AND the period parsed from game.timestr
  // (game.timestr like "Q4 2:14" updates faster than events, so avoids stale period after a quarter break)
  const periodFromEvents = liveEvents.reduce((max, e) => Math.max(max, Number((e as any).period ?? 0)), 0);
  const periodFromTimestr = (() => {
    const ts = String(game?.timestr ?? "");
    const qMatch = ts.match(/^Q(\d)/i);
    if (qMatch) return parseInt(qMatch[1]);
    const tsl = ts.toLowerCase();
    if (tsl.includes("quarter time") || tsl.startsWith("1/4")) return 1;
    if (tsl.includes("half time") || tsl.startsWith("1/2")) return 2;
    if (tsl.includes("three quarter") || tsl.startsWith("3/4")) return 3;
    return 0;
  })();
  const currentPeriod = Math.max(periodFromEvents, periodFromTimestr);


  useEffect(() => { gameRef.current = game; }, [game]);

  const displayLiveEvents = useMemo(() => liveEvents, [liveEvents]);

  const loadEventReactions = useCallback(async () => {
    if (!id) return;
    const visitorId = getEventReactionVisitorId();
    if (!visitorId) return;

    try {
      const params = new URLSearchParams({ gameId: id, visitorId });
      const res = await fetch(`/api/event-reactions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.unavailable) return;
      setEventReactions(json.reactions ?? {});
      setMyEventReactions(normaliseMyReactionMap(json.mine));
    } catch (err) {
      console.error("[event-reactions] load failed:", err);
    }
  }, [id]);

  const handleEventReaction = useCallback(async (eventKey: string, emoji: string) => {
    if (!id || !eventKey) return;
    if (!isValidReactionEmoji(emoji)) return;
    const visitorId = getEventReactionVisitorId();
    if (!visitorId) return;

    const previousEmoji = (myEventReactions[eventKey] ?? []).find((selectedEmoji) => isValidReactionEmoji(selectedEmoji));
    const nextSelected = previousEmoji === emoji ? [] : [emoji];
    setReactionPopup(null);
    setEventReactions((current) => optimisticEventReactionMap(current, eventKey, emoji, previousEmoji));
    setMyEventReactions((current) => {
      const next = { ...current };
      if (nextSelected.length > 0) next[eventKey] = nextSelected;
      else delete next[eventKey];
      return next;
    });

    try {
      const res = await fetch("/api/event-reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: Number(id), eventKey, emoji, visitorId }),
      });
      if (!res.ok) {
        console.warn("[event-reactions] save failed:", await res.text());
        loadEventReactions();
        return;
      }
      const json = await res.json();
      if (json.unavailable) return;
      setEventReactions(json.reactions ?? {});
      setMyEventReactions(normaliseMyReactionMap(json.mine));
    } catch (err) {
      console.warn("[event-reactions] save failed:", err);
      loadEventReactions();
    }
  }, [id, loadEventReactions, myEventReactions]);

  useEffect(() => {
    if (!id) return;
    loadEventReactions();
    const interval = setInterval(loadEventReactions, 30_000);
    const channel = supabase
      .channel(`event-reactions-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_event_reactions", filter: `game_id=eq.${Number(id)}` },
        () => loadEventReactions()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, loadEventReactions]);

  // Count unanswered open polls — always runs so tab badge is visible before entering the tab
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function fetchCount() {
      const currentStatus = game ? getStatus(game) : "UPCOMING";

      const { data: pollRows } = await supabase
        .from("match_polls")
        .select("id, quarter")
        .eq("game_id", Number(id));
      if (cancelled) return;
      if (!pollRows?.length) { setUnansweredPollCount(0); return; }

      const uid = (await supabase.auth.getSession()).data.session?.user?.id;
      let votedPollIds = new Set<string>();
      if (uid) {
        const { data: voteRows } = await supabase
          .from("match_poll_votes")
          .select("poll_id")
          .in("poll_id", pollRows.map((p: any) => p.id))
          .eq("user_id", uid);
        votedPollIds = new Set((voteRows ?? []).map((v: any) => v.poll_id));
      }

      const open = pollRows.filter((p: any) => {
        if (currentStatus === "FINAL") return false;
        if (p.quarter === null) return currentStatus === "UPCOMING";
        return currentPeriod <= p.quarter;
      });
      if (!cancelled) setUnansweredPollCount(open.filter((p: any) => !votedPollIds.has(p.id)).length);
    }
    fetchCount();
    return () => { cancelled = true; };
  }, [id, game, currentPeriod]);

  // Detect feed events the user hasn't seen yet and glow them once. "Seen"
  // is persisted to localStorage per game so the glow only fires for events
  // that appeared since the user's last visit — not on every reload.
  useEffect(() => {
    if (displayLiveEvents.length === 0) return;

    if (!initialFeedLoaded.current) {
      const persisted = loadSeenEventKeys(id);
      const fresh = new Set<string>();
      displayLiveEvents.forEach((event, index) => {
        const ek = stableEventIdentityKey(event, index);
        // First-ever visit to this game: seed silently, don't glow everything.
        if (persisted.size > 0 && !persisted.has(ek)) fresh.add(ek);
        seenEventKeys.current.add(ek);
      });
      saveSeenEventKeys(id, seenEventKeys.current);
      initialFeedLoaded.current = true;
      if (fresh.size > 0) {
        setFreshEventKeys(fresh);
        const t = setTimeout(() => setFreshEventKeys(new Set()), 2200);
        return () => clearTimeout(t);
      }
      return;
    }

    // Subsequent polls: only animate genuinely new events
    const fresh = new Set<string>();
    displayLiveEvents.forEach((event, index) => {
      const ek = stableEventIdentityKey(event, index);
      if (!seenEventKeys.current.has(ek)) {
        fresh.add(ek);
        seenEventKeys.current.add(ek);
      }
    });
    if (fresh.size > 0) {
      saveSeenEventKeys(id, seenEventKeys.current);
      setFreshEventKeys(fresh);
      const t = setTimeout(() => setFreshEventKeys(new Set()), 2200);
      return () => clearTimeout(t);
    }
  }, [displayLiveEvents, id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(!!data.session));
  }, []);

  // Track sticky header height so the table thead can stick just below it.
  // A callback ref (rather than useRef + useEffect) because the header div
  // doesn't exist on the first render (page is still loading data), so an
  // effect with `[]` deps would see a null ref and never re-measure once the
  // div actually mounts.
  const stickyHeaderRef = useCallback((el: HTMLDivElement | null) => {
    if (stickyHeaderRoRef.current) {
      stickyHeaderRoRef.current.disconnect();
      stickyHeaderRoRef.current = null;
    }
    stickyHeaderElRef.current = el;
    if (!el) return;
    const measure = () => setStickyHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    stickyHeaderRoRef.current = ro;
  }, []);

  // Switching tabs can change the header's contents (e.g. the stat-mode
  // toggle only shows on the Players tab), which changes its height — but
  // that doesn't always trigger the ResizeObserver above, so re-measure
  // explicitly when the active tab changes.
  useEffect(() => {
    const el = stickyHeaderElRef.current;
    if (!el) return;
    setStickyHeaderH(el.offsetHeight);
    const raf = requestAnimationFrame(() => setStickyHeaderH(el.offsetHeight));
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "game" && !showStatsTabs) setActiveTab("feed");
    if (activeTab === "players" && !showPlayersTabs) setActiveTab("feed");
  }, [showStatsTabs, showPlayersTabs, activeTab]);

  useEffect(() => {
    if (status !== "UPCOMING" || seasonStats.length > 0) return;
    fetch("/api/player-season-stats")
      .then(r => r.ok ? r.json() : [])
      .then(data => setSeasonStats(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [status, seasonStats.length]);

  useEffect(() => {
    if (status !== "UPCOMING" || !game?.hteam || !game?.ateam || !game?.date || squadPlayers) return;
    const date = new Date(game.date).toISOString().slice(0, 10);
    fetch(`/api/match-players?date=${date}&home=${encodeURIComponent(game.hteam)}&away=${encodeURIComponent(game.ateam)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSquadPlayers(data); })
      .catch(() => {});
  }, [status, game?.hteam, game?.ateam, game?.date, squadPlayers]);


  useEffect(() => {
    if (!id) return;
    fetch(`/api/duels/game?game_id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHasDuelGame(!!d.duelGame); })
      .catch(() => {});
  }, [id]);


  useEffect(() => {
    if (!mounted || !game || !apiSportsGameId) return;

    const status = getStatus(game);

    // ── Game is FINAL: keep re-fetching for up to 5 minutes so APISports has
    //    time to publish final stats before we permanently lock the cache. ──
    if (status === "FINAL") {
      if (finalStatsFetchedRef.current) return;

      let attempts = 0;
      const MAX_ATTEMPTS = 10; // every 30s for ~5 min
      let cancelled = false;

      async function fetchFinalStats() {
        if (cancelled) return;
        attempts++;
        const isFinal = attempts >= MAX_ATTEMPTS;

        try {
          const r = await fetch(
            `/api/afl/player-stats?id=${apiSportsGameId}${isFinal ? "&final=true" : ""}`,
            { cache: "no-store" }
          );
          if (!r.ok) return;
          const data = await r.json();
          const apiMatch = data?.response?.[0];
          if (!apiMatch?.teams?.length) return;

          const homeApiTeamId = getApiTeamId(game.hteam);
          const awayApiTeamId = getApiTeamId(game.ateam);

          const homeTeamBlock = getPlayerTeamBlock(apiMatch.teams, homeApiTeamId, game.hteam, 0);
          const awayTeamBlock = getPlayerTeamBlock(apiMatch.teams, awayApiTeamId, game.ateam, 1, homeTeamBlock);

          const home = (homeTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.hteam));
          const away = (awayTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.ateam));
          const split = mergeStatsByKnownTeam(game.hteam, game.ateam, home, away);

          if (!cancelled) {
            setLiveHomeStats(split.home.length ? split.home : home);
            setLiveAwayStats(split.away.length ? split.away : away);
          }
        } catch {}
      }

      finalStatsFetchedRef.current = true;
      fetchFinalStats();
      const finalInterval = setInterval(() => {
        if (attempts >= MAX_ATTEMPTS) { clearInterval(finalInterval); return; }
        fetchFinalStats();
      }, 30_000);

      return () => { cancelled = true; clearInterval(finalInterval); };
    }

    if (status !== "LIVE") {
      setLiveHomeStats([]);
      setLiveAwayStats([]);
      setLiveStatsError("");
      return;
    }

    let cancelled = false;

    async function loadLivePlayerStats() {
      try {
        setLiveStatsError("");

        // Reads the live_player_stats cache (fed by the cron's 15s polling
        // loop) — never calls API-Sports directly. Rebuild the same
        // {teams:[{team:{id},players:[...]}]} shape API-Sports itself
        // returns, so all the normalisation below stays unchanged.
        const res = await fetch(`/api/afl/live-player-stats?id=${apiSportsGameId}`, { cache: "no-store" });
        if (!res.ok) throw new Error();

        const data = await res.json();
        const rows: any[] = data?.players ?? [];

        const byTeam = new Map<number, any[]>();
        for (const r of rows) {
          const tid = Number(r.team_id ?? 0);
          const list = byTeam.get(tid) ?? [];
          list.push({
            player: { id: r.player_id, name: r.player_name },
            goals: { total: r.goals, assists: r.goal_assists },
            behinds: r.behinds,
            kicks: r.kicks,
            handballs: r.handballs,
            disposals: r.disposals,
            marks: r.marks,
            tackles: r.tackles,
            hitouts: r.hitouts,
            insides50: r.inside50s,
            clearances: r.clearances,
            clangers: r.clangers,
            rebounds50: r.rebound50s,
            free_kicks: { for: r.frees_for, against: r.frees_against },
          });
          byTeam.set(tid, list);
        }

        const apiMatch = {
          teams: Array.from(byTeam.entries()).map(([teamId, players]) => ({
            team: { id: teamId },
            players,
          })),
        };

        if (!apiMatch?.teams?.length) {
          // The request SUCCEEDED, but API-Sports simply has no player stats
          // for this game yet. This is common for live games — their AFL
          // player-stat feed lags the live score and often only populates
          // near/after the game. It is NOT a failure, so don't show an error:
          // leave the stats empty (the tabs show a calm "not in yet" state)
          // and keep polling — they'll appear once API-Sports publishes them.
          if (!cancelled) {
            setLiveHomeStats([]);
            setLiveAwayStats([]);
            setLiveStatsError("");
          }
          return;
        }

        const homeApiTeamId = getApiTeamId(game.hteam);
        const awayApiTeamId = getApiTeamId(game.ateam);

        const homeTeamBlock = getPlayerTeamBlock(apiMatch.teams, homeApiTeamId, game.hteam, 0);
        const awayTeamBlock = getPlayerTeamBlock(apiMatch.teams, awayApiTeamId, game.ateam, 1, homeTeamBlock);

        const home = (homeTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.hteam));
        const away = (awayTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.ateam));
        const split = mergeStatsByKnownTeam(game.hteam, game.ateam, home, away);

        if (!cancelled) {
          setLiveHomeStats(split.home.length ? split.home : home);
          setLiveAwayStats(split.away.length ? split.away : away);
        }
      } catch {
        // A genuine fetch/network failure (not just missing data). Poll
        // continues every 10s, so frame it as transient rather than fatal.
        if (!cancelled) setLiveStatsError("Couldn't refresh live stats — retrying…");
      }
    }

    loadLivePlayerStats();
    // 10s poll is a fallback — Realtime below pushes updates as soon as the
    // cron's 15s loop writes them, so this rarely has to do the work.
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadLivePlayerStats();
    }, 10_000);

    const handleVisibility = () => {
      if (!document.hidden) loadLivePlayerStats();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const statsChannel = supabase
      .channel(`live-player-stats-${apiSportsGameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_player_stats", filter: `match_id=eq.${apiSportsGameId}` },
        () => { if (!cancelled) loadLivePlayerStats(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(statsChannel);
    };
  }, [mounted, game, apiSportsGameId]);

  /** Process raw rows from Supabase into display-ready LiveEvents */
  const processSupabaseEvents = useCallback((rows: any[]) => {
    if (!game) return;

    function periodLabel(p: number) {
      return p === 1 ? "1/4 TIME" : p === 2 ? "HALF TIME" : p === 3 ? "3/4 TIME" : p === 4 ? "FULL TIME" : `Q${p} TIME`;
    }

    const homeApiId = getApiTeamId(game.hteam);
    const awayApiId = getApiTeamId(game.ateam);

    const normalised = [...(rows as any[])]
      // Inferred placeholders are no longer created; ignore any legacy rows.
      .filter((e: any) => !e.inferred)
      .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))
      .map((e: any) => ({
        rowKey: e.id ? `feed_${e.id}` : undefined,
        quarter: `Q${e.period ?? "-"}`,
        period: e.period,
        minute: e.minute,
        type: e.type,
        teamId: e.team_id,
        playerId: e.player_id,
        playerName: e.player_name ?? null,
        homeScore: e.home_score,
        awayScore: e.away_score,
        playerFP: e.player_fp ?? null,
        playerFoopy: e.player_foopy ?? null,
        playerDisposals: e.player_disposals ?? null,
        playerGoals: e.player_goals ?? null,
        playerTackles: e.player_tackles ?? null,
        playerMarks: e.player_marks ?? null,
        playerHitouts: e.player_hitouts ?? null,
      }));

    const chronological = [...normalised].sort((a, b) => {
      if (Number(a.period) !== Number(b.period)) return Number(a.period) - Number(b.period);
      return Number(a.minute ?? 0) - Number(b.minute ?? 0);
    });

    const withTeam = chronological.map((e: any) => {
      const tid = Number(e.teamId);
      const teamName = tid === homeApiId ? game.hteam : tid === awayApiId ? game.ateam : teamNameFromEvent(e);
      return { ...e, teamName };
    }).filter((e: any) => eventBelongsToMatch(e, game.hteam, game.ateam));

    const derivedBreaks: any[] = [];
    for (let i = 1; i < chronological.length; i++) {
      const prev = Number(chronological[i - 1].period ?? 0);
      const curr = Number(chronological[i].period ?? 0);
      if (curr > prev && prev > 0) {
        const lastOfPrev = [...withTeam].reverse().find((event: any) => Number(event.period ?? 0) === prev);
        derivedBreaks.push({
          type: "QUARTER_BREAK", quarter: `Q${prev}`, period: prev, minute: 999,
          label: periodLabel(prev),
          homeScore: lastOfPrev?.homeScore ?? 0, awayScore: lastOfPrev?.awayScore ?? 0,
        });
      }
    }

    const timestr = String(game?.timestr ?? "").toLowerCase();
    const breakPeriod =
      (timestr.includes("quarter time") || timestr.startsWith("1/4")) ? 1
      : (timestr.includes("half time") || timestr.startsWith("1/2")) ? 2
      : (timestr.includes("three quarter") || timestr.startsWith("3/4")) ? 3
      : status === "FINAL" ? 4 : 0;

    if (breakPeriod > 0 && !derivedBreaks.some(b => b.period === breakPeriod)) {
      const ofPeriod = withTeam.filter(e => Number(e.period ?? 0) === breakPeriod);
      const last = ofPeriod[ofPeriod.length - 1];
      derivedBreaks.push({
        type: "QUARTER_BREAK", quarter: `Q${breakPeriod}`, period: breakPeriod, minute: 999,
        label: periodLabel(breakPeriod),
        homeScore: last?.homeScore ?? game?.hscore ?? 0,
        awayScore: last?.awayScore ?? game?.ascore ?? 0,
      });
    }

    const sorted = [...withTeam, ...derivedBreaks].sort((a, b) => {
      if (Number(a.period) !== Number(b.period)) return Number(b.period) - Number(a.period);
      return Number(b.minute ?? 0) - Number(a.minute ?? 0);
    });

    setLiveEvents(sorted);
    setFeedError("");
  }, [game, status]);

  useEffect(() => {
    if (!mounted || !apiSportsGameId || !game) return;

    let cancelled = false;

    // ── 1. Load existing events via server route (bypasses RLS) ─────────────
    async function loadFromSupabase() {
      try {
        const res = await fetch(`/api/afl/feed-events?id=${apiSportsGameId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => res.status.toString());
          console.error("[feed] API error:", res.status, text);
          setFeedError(`Could not load feed. (${res.status}: ${text})`);
          setFeedLoading(false);
          return;
        }
        const json = await res.json();
        if (json.error) {
          console.error("[feed] Supabase error:", json.error);
          setFeedError(`Could not load feed. (${json.error})`);
          setFeedLoading(false);
          return;
        }
        processSupabaseEvents(json.events ?? []);
        setFeedLoading(false);
      } catch (err) {
        console.error("[feed] fetch error:", err);
        if (!cancelled) { setFeedError("Could not load feed."); setFeedLoading(false); }
      }
    }

    // ── 2. Trigger a sync from APISports → Supabase ─────────────────────────
    async function triggerSync() {
      try {
        await fetch(`/api/afl/sync-events?id=${apiSportsGameId}`, { cache: "no-store" });
      } catch {}
    }

    loadFromSupabase();
    triggerSync().then(() => {
      if (!cancelled) loadFromSupabase();
    });

    // Re-sync and reload every 10s while visible
    const syncInterval = setInterval(() => {
      if (document.hidden) return;
      triggerSync().then(() => {
        if (!cancelled) loadFromSupabase();
      });
    }, 10_000);

    const handleVisibility = () => {
      if (document.hidden) return;
      triggerSync().then(() => {
        if (!cancelled) loadFromSupabase();
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── 3. Subscribe to Realtime — new events pushed automatically ───────────
    const channel = supabase
      .channel(`live-feed-${apiSportsGameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_game_feed", filter: `api_game_id=eq.${apiSportsGameId}` },
        () => { if (!cancelled) loadFromSupabase(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [mounted, apiSportsGameId, game, processSupabaseEvents]);

  // Track live viewers via Supabase Realtime Presence + persist to match_viewers
  useEffect(() => {
    if (!id) return;

    // Presence for live count
    const presenceChannel = supabase.channel(`match-viewers-${id}`, {
      config: { presence: { key: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setLiveViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await presenceChannel.track({ joined_at: Date.now() });
      });

    // Persist this view via the server-side endpoint (bypasses RLS, works for
    // both signed-in and anonymous visitors).
    // Use a stable session ID so repeated page loads don't inflate the count.
    try {
      const sessionKey = `foopy_viewer_${id}`;
      let sessionId = sessionStorage.getItem(sessionKey);
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(sessionKey, sessionId);
      }
      supabase.auth.getUser().then(({ data }) => {
        fetch("/api/afl/record-view", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game_id: Number(id), user_id: data.user?.id ?? null, session_id: sessionId }),
        }).catch(() => {});
      });
    } catch {}

    return () => { supabase.removeChannel(presenceChannel); };
  }, [id]);

  // Fetch total unique viewer count — for live games every 60s, for FINAL once.
  useEffect(() => {
    if (!id) return;
    async function fetchTotalViewers() {
      try {
        const res = await fetch(`/api/afl/viewer-count?id=${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (json.count != null) setTotalViewerCount(json.count);
      } catch {}
    }
    fetchTotalViewers();
    if (status === "FINAL") return; // no polling needed
    const iv = setInterval(fetchTotalViewers, 60_000);
    return () => clearInterval(iv);
  }, [id, status]);

  // Award +10 aura once per live game viewed
  useEffect(() => {
    if (!id || !mounted) return;
    // Fire when Squiggle marks LIVE, OR when the game is clearly in progress
    // (currentPeriod > 0 means timestr shows a quarter/half) but complete=0 hasn't updated yet
    const isGameLive = status === "LIVE" || (status !== "FINAL" && currentPeriod > 0);
    if (!isGameLive) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const res = await fetch("/api/aura/award", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ event_type: "live_game_view", related_id: String(id) }),
      });
      const data = await res.json();
      if (res.ok && data.awarded) auraToastEmitter.emit(10, "viewing a live game");
    });
  }, [id, mounted, status, currentPeriod]);

  useEffect(() => {
    if (!id) return;

    const gameId = Number(id);

    supabase
      .from("feed_comments")
      .select("event_key, body, likes, user_id, parent_id")
      .eq("game_id", gameId)
      .not("event_key", "is", null)
      .then(async ({ data }) => {
        if (!data) return;

        const counts: Record<string, number> = {};
        // Only top-level comments (no parent) are candidates for top comment preview
        const topCandidates: Record<string, { body: string; likes: number; user_id: string }> = {};

        for (const row of data as { event_key: string; body: string; likes: number | null; user_id: string; parent_id: string | null }[]) {
          counts[row.event_key] = (counts[row.event_key] ?? 0) + 1;
          if (!row.parent_id) {
            const likes = row.likes ?? 0;
            const existing = topCandidates[row.event_key];
            if (!existing || likes > existing.likes) {
              topCandidates[row.event_key] = { body: row.body, likes, user_id: row.user_id };
            }
          }
        }

        setEventCommentCounts(counts);

        // Load profiles for top comment authors
        const userIds = Array.from(new Set(Object.values(topCandidates).map((c) => c.user_id)));
        if (userIds.length === 0) return;
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);
        const profileMap: Record<string, { name: string; avatar: string | null }> = {};
        for (const p of profiles ?? []) {
          profileMap[p.id] = {
            name: (p as any).display_name || (p as any).username || "User",
            avatar: (p as any).avatar_url ?? null,
          };
        }
        const topMap: Record<string, { body: string; username: string; avatar: string | null }> = {};
        for (const [key, c] of Object.entries(topCandidates)) {
          const prof = profileMap[c.user_id];
          topMap[key] = { body: c.body, username: prof?.name ?? "User", avatar: prof?.avatar ?? null };
        }
        setEventTopComments(topMap);
      });
  }, [id, liveEvents]);

  // Refetch event comment counts whenever the user navigates back to this page
  // (e.g. after posting a comment on an event subpage). usePathname() changes
  // on every client-side navigation so this runs each time the path becomes
  // /match/[id] again, even when Next.js keeps the component in its router cache.
  useEffect(() => {
    if (!id) return;
    // Only run when we're on the match root — not on event subpages
    if (pathname !== `/match/${id}`) return;
    const gameId = Number(id);
    supabase
      .from("feed_comments")
      .select("event_key, body, likes, user_id, parent_id")
      .eq("game_id", gameId)
      .not("event_key", "is", null)
      .then(async ({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        const topCandidates: Record<string, { body: string; likes: number; user_id: string }> = {};
        for (const row of data as { event_key: string; body: string; likes: number | null; user_id: string; parent_id: string | null }[]) {
          counts[row.event_key] = (counts[row.event_key] ?? 0) + 1;
          if (!row.parent_id) {
            const likes = row.likes ?? 0;
            const existing = topCandidates[row.event_key];
            if (!existing || likes > existing.likes) {
              topCandidates[row.event_key] = { body: row.body, likes, user_id: row.user_id };
            }
          }
        }
        setEventCommentCounts(counts);
        const userIds = Array.from(new Set(Object.values(topCandidates).map(c => c.user_id)));
        if (!userIds.length) return;
        const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds);
        const profileMap: Record<string, { name: string; avatar: string | null }> = {};
        for (const p of profiles ?? []) profileMap[(p as any).id] = { name: (p as any).display_name || (p as any).username || "User", avatar: (p as any).avatar_url ?? null };
        const topMap: Record<string, { body: string; username: string; avatar: string | null }> = {};
        for (const [key, c] of Object.entries(topCandidates)) {
          const prof = profileMap[c.user_id];
          topMap[key] = { body: c.body, username: prof?.name ?? "User", avatar: prof?.avatar ?? null };
        }
        setEventTopComments(topMap);
      });
  }, [id, pathname]);

  // Declared here (before any early returns) so hook call count is always stable.
  // Use live/final API stats when available; fall back to static JSON for older games.
  const useLiveStats = (isLiveGame || status === "FINAL") && liveHomeStats.length > 0;
  const displayHomeStats = useLiveStats ? liveHomeStats : homeStats;
  const displayAwayStats = useLiveStats ? liveAwayStats : awayStats;

  // Snapshot each player's FP/foopy rating/disposals/goals the first time their
  // event appears. Already-snapshotted events are skipped so the displayed
  // values never change as the player accumulates more stats during the game.
  useEffect(() => {
    const allStats = [...displayHomeStats, ...displayAwayStats];
    if (allStats.length === 0) return;
    displayLiveEvents.forEach((event, index) => {
      if (event.type === "QUARTER_BREAK") return;
      const ek = scoreEventKey(event, index);

      const haveFP = eventFPSnapshots.current[ek] != null;
      const haveStats = eventStatSnapshots.current[ek] != null;
      if (haveFP && haveStats) return;

      if (!haveFP && (event as any).playerFP != null) {
        eventFPSnapshots.current[ek] = (event as any).playerFP;
      }
      if (!haveStats && (event as any).playerFoopy != null) {
        eventStatSnapshots.current[ek] = {
          foopy: (event as any).playerFoopy,
          disposals: (event as any).playerDisposals ?? 0,
          goals: (event as any).playerGoals ?? 0,
          tackles: (event as any).playerTackles ?? 0,
          marks: (event as any).playerMarks ?? 0,
          hitouts: (event as any).playerHitouts ?? 0,
        };
      }

      if (eventFPSnapshots.current[ek] != null && eventStatSnapshots.current[ek] != null) return;

      const player = findPlayerForLiveEvent(event, safeText(game?.hteam, ""), safeText(game?.ateam, ""));
      if (!player) return;
      const stat = allStats.find(p =>
        ((p as any).name || (p as any).player || "").toLowerCase() === (player.name || "").toLowerCase()
      );
      if (!stat) return;
      if (eventFPSnapshots.current[ek] == null) eventFPSnapshots.current[ek] = fantasyPoints(stat);
      if (eventStatSnapshots.current[ek] == null) {
        eventStatSnapshots.current[ek] = {
          foopy: foopyRating(stat),
          disposals: num((stat as any).disposals) || (num((stat as any).kicks) + num((stat as any).handballs)),
          // Prefer the server's event-order goal count (deterministic, frozen at
          // the moment scored). Only fall back to the live cumulative total for
          // legacy rows that predate that column — and that total can lag to 0.
          goals: (event as any).playerGoals ?? num((stat as any).goals),
          tackles: (event as any).playerTackles ?? num((stat as any).tackles),
          marks: (event as any).playerMarks ?? num((stat as any).marks),
          hitouts: (event as any).playerHitouts ?? num((stat as any).hitouts),
        };
      }
    });
  }, [displayLiveEvents, displayHomeStats, displayAwayStats, game]);

  if (!mounted || loading) {
    return (
      <main style={pageStyle} className="page-enter">
        {/* Scoreboard skeleton — mirrors the real centered match header */}
        <div style={{ padding: "18px 20px 20px", borderBottom: "1px solid var(--border-2)", background: "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 60%, var(--bg) 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14, maxWidth: 520, margin: "0 auto" }}>
            {/* Home — logo + name */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
              <div className="skeleton" style={{ width: 50, height: 50, borderRadius: "50%" }} />
              <div className="skeleton skeleton-line" style={{ width: 70, height: 11 }} />
            </div>
            {/* Centre — score + status */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div className="skeleton" style={{ width: 104, height: 30, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: 82, height: 24, borderRadius: 999 }} />
            </div>
            {/* Away — logo + name */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
              <div className="skeleton" style={{ width: 50, height: 50, borderRadius: "50%" }} />
              <div className="skeleton skeleton-line" style={{ width: 70, height: 11 }} />
            </div>
          </div>
        </div>
        {/* Tab bar skeleton */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-2)", padding: "0 8px" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: 1, padding: "14px 4px", display: "flex", justifyContent: "center" }}>
              <div className="skeleton skeleton-line" style={{ width: 48 }} />
            </div>
          ))}
        </div>
        {/* Feed skeleton rows */}
        <div style={{ padding: "16px 16px 0" }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 18, alignItems: "flex-start" }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="skeleton skeleton-line" style={{ width: "40%" }} />
                <div className="skeleton skeleton-line" style={{ width: "80%" }} />
                <div className="skeleton skeleton-line" style={{ width: "60%" }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main style={pageStyle} className="page-enter">
        <section style={emptyStyle}>
          <h1>Match not found</h1>
          <p style={mutedStyle}>{error || `No game found for ID: ${id}`}</p>
        </section>
      </main>
    );
  }

  const homeAbbr = getAbbr(game.hteam);
  const awayAbbr = getAbbr(game.ateam);

  const homeApiTeamId = getApiTeamId(game.hteam);
  const awayApiTeamId = getApiTeamId(game.ateam);
  const homeTeamBlock = getTeamBlock(teamStats, homeApiTeamId, 0);
  const awayTeamBlock = getTeamBlock(teamStats, awayApiTeamId, 1, homeTeamBlock);

  const homeFreesFromApi = getTeamStatFromBlock(homeTeamBlock, "disposals", "free_kicks");
  const awayFreesFromApi = getTeamStatFromBlock(awayTeamBlock, "disposals", "free_kicks");
  const homeFrees = homeFreesFromApi || teamFreesFor(displayHomeStats);
  const awayFrees = awayFreesFromApi || teamFreesFor(displayAwayStats);
  const freeKickTotal = homeFrees + awayFrees;
  const homeFreePct = percent(homeFrees, freeKickTotal);
  const awayFreePct = 100 - homeFreePct;
  const umpireText = umpireMessage(game.hteam, game.ateam, homeFrees, awayFrees);
  const latestFeedPeriod = liveEvents.reduce((max, event) => {
    if (event.type === "QUARTER_BREAK") return max;
    return Math.max(max, Number(event.period ?? 0));
  }, 0);
  const liveFeedIsStale = status === "LIVE" && currentPeriod > 0 && liveEvents.length > 0 && latestFeedPeriod < currentPeriod;
  const statusBadgeTone =
    status === "FINAL"
      ? { bg: "var(--surface-3)", border: "var(--border-3)", color: "var(--text-1)", label: "Full time" }
      : { bg: "#1d4ed8", border: "#60a5fa", color: "#eff6ff", label: status };
  const homeScoreDisplay =
    status === "UPCOMING" ? getTeamRecordBeforeGame(game.hteam, allGames, game) : game.hscore;
  const awayScoreDisplay =
    status === "UPCOMING" ? getTeamRecordBeforeGame(game.ateam, allGames, game) : game.ascore;
  const homeRecord = formatRecord(getTeamRecordBeforeGame(game.hteam, allGames, game));
  const awayRecord = formatRecord(getTeamRecordBeforeGame(game.ateam, allGames, game));
  const compactClock = formatTimestr(game.timestr) || getLiveGameClock(liveEvents);
  const compactStatusLabel =
    status === "LIVE" ? (compactClock || "LIVE") :
    status === "FINAL" ? "FT" :
    timeUntilStart(game.date, now);

  return (
    <main key={id} style={pageStyle} className="page-enter">
      <style>{`
        /* ── Collapsing match header — driven by a single --p (0..1) var ──────
           Only transform / opacity / one height-calc animate. 60fps on mobile. */
        .mh {
          position: relative;
          display: grid;
          /* centred trio: [flex margin] logo  score  logo [flex margin] */
          grid-template-columns: minmax(0,1fr) auto auto auto minmax(0,1fr);
          column-gap: 18px;
          align-items: center;
          height: calc(${HEADER_MAX_H}px - ${HEADER_COLLAPSE}px * var(--p, 0));
          padding: 0 12px;
          box-sizing: border-box;
          /* contain layout only (NOT paint) so the 2nd line is never clipped */
          contain: layout;
          background: linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 60%, var(--bg) 100%);
          border-bottom: 1px solid var(--border-1);
          will-change: height;
        }
        .mh-glow { position: absolute; inset: 0; pointer-events: none; opacity: calc(1 - var(--p,0) * 1.5); will-change: opacity; }
        .mh-slot { position: relative; display: flex; align-items: center; justify-content: center; height: 100%; z-index: 2; gap: 6px; }
        .mh-slot-l { grid-column: 2; }
        .mh-center { grid-column: 3; }
        .mh-slot-r { grid-column: 4; }
        .mh-logo { display: block; width: 68px; height: 68px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,0.12); flex-shrink: 0; will-change: transform; text-decoration: none; cursor: pointer; }
        .mh-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        /* shrink toward the inner (score-facing) edge so logos keep framing the score */
        .mh-slot-l .mh-logo { transform-origin: right center; transform: scale(calc(1 - 0.5 * var(--p,0))); }
        .mh-slot-r .mh-logo { transform-origin: left center;  transform: scale(calc(1 - 0.5 * var(--p,0))); }
        .mh-name { position: absolute; top: calc(50% + 44px); left: 50%; transform: translateX(-50%); white-space: nowrap; text-align: center; opacity: calc(1 - var(--p,0) * 2.1); will-change: opacity; }
        .mh-name > div { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mh-center { position: relative; z-index: 1; min-width: 0; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(5px * (1 - var(--p,0))); overflow: visible; }
        .mh-score {
          max-width: 100%; white-space: nowrap; text-overflow: ellipsis;
          line-height: 1.12; font-weight: 1000; letter-spacing: -0.03em; color: var(--text-1);
          font-variant-numeric: tabular-nums;
          font-size: clamp(26px, 9.5vw, 46px);
          transform: scale(calc(1 - 0.45 * var(--p,0)));
          transform-origin: center center; will-change: transform, opacity;
          opacity: clamp(0, calc(1.8 - var(--p,0) * 3.6), 1);
          max-height: clamp(0px, calc(52px - 52px * var(--p,0)), 52px);
          overflow: hidden;
        }
        .mh-gb {
          font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.45);
          font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
          line-height: 1; white-space: nowrap; margin-top: -4px;
          transform: scale(calc(1 - 0.45 * var(--p,0)));
          transform-origin: center center; will-change: transform, opacity;
          opacity: clamp(0, calc(1.8 - var(--p,0) * 3.6), 1);
          max-height: clamp(0px, calc(16px - 16px * var(--p,0)), 16px);
          overflow: hidden;
        }
        .mh-sub { line-height: 1.3; transform: scale(calc(1 - 0.18 * var(--p,0))); transform-origin: center center; will-change: transform; white-space: nowrap; }
        .mh-mini {
          font-size: 20px; font-weight: 1000; font-variant-numeric: tabular-nums;
          letter-spacing: -0.03em; color: var(--text-1); line-height: 1; flex-shrink: 0;
          overflow: hidden; white-space: nowrap;
          max-width: clamp(0px, calc((var(--p,0) - 0.42) * 130px), 52px);
          opacity: clamp(0, calc((var(--p,0) - 0.42) * 4.5), 1);
          will-change: max-width, opacity;
        }
        .mh-venue { position: absolute; left: 12px; right: 12px; bottom: 10px; text-align: center; opacity: calc(1 - var(--p,0) * 2.2); pointer-events: none; will-change: opacity; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        @media (hover: hover) and (pointer: fine) {
          .mh {
            height: calc(${HEADER_MAX_H}px - 118px * var(--p, 0));
            column-gap: calc(22px - 4px * var(--p, 0));
            padding: 0 20px;
          }
          .mh-logo {
            width: calc(68px - 30px * var(--p, 0));
            height: calc(68px - 30px * var(--p, 0));
            transform: none !important;
            will-change: width, height;
          }
          .mh-score {
            font-size: calc(46px - 20px * var(--p, 0));
            transform: none;
            will-change: font-size, opacity;
          }
          .mh-sub {
            transform: none;
          }
          .mh-mini { font-size: 22px; }
          .mh-name > div {
            max-width: 160px;
          }
        }

        @keyframes tab-slide-in-right {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes tab-slide-in-left {
          from { opacity: 0; transform: translateX(-32px); }
          to   { opacity: 1; transform: none; }
        }
        .tab-slide-in-right { animation: tab-slide-in-right 0.22s var(--spring-soft, ease) both; }
        .tab-slide-in-left { animation: tab-slide-in-left 0.22s var(--spring-soft, ease) both; }
        @media (prefers-reduced-motion: reduce) {
          .tab-slide-in-right, .tab-slide-in-left { animation: none; }
        }
      `}</style>
      <section ref={matchSectionRef} style={matchCentreStyle}>
        {/* ── Sticky header + tabs ── */}
        {(() => {
          const tabList: string[] = [
            "feed", "chat", "polls", ...(hasDuelGame ? ["duels"] : []),
            ...(showStatsTabs ? ["game"] : []),
            ...(showPlayersTabs ? ["players"] : []),
          ];
          const activeIdx = tabList.indexOf(activeTab);
          const tabCount = tabList.length;
          const indicatorLeft = activeIdx >= 0 ? `${(activeIdx / tabCount) * 100}%` : "0%";
          const indicatorWidth = `${100 / tabCount}%`;

          return (
            <div ref={stickyHeaderRef} style={{
              position: "sticky",
              top: "var(--round-strip-h, 0px)",
              width: "100%",
              zIndex: 70,
              background: "rgba(10,10,15,0.94)",
              backdropFilter: "blur(22px) saturate(180%)", WebkitBackdropFilter: "blur(22px) saturate(180%)",
              borderBottom: "1px solid var(--border-2)",
            }}>
              {/* ─── Collapsing match header — single grid, morphs via --p ─── */}
              <div ref={headerContainerRef} className="mh" onTouchStart={onHeaderTouchStart} onTouchEnd={onHeaderTouchEnd}>
                {/* Team-colour glow (fades as header collapses) */}
                <div className="mh-glow" style={{
                  background: `radial-gradient(ellipse 60% 85% at 16% 50%, ${teamColor(game.hteam ?? "")}33 0%, transparent 66%),
                               radial-gradient(ellipse 60% 85% at 84% 50%, ${teamColor(game.ateam ?? "")}33 0%, transparent 66%)`,
                }} />

                {/* Left column — home logo + name */}
                <div className="mh-slot mh-slot-l">
                  <Link href={`/team/${toTeamSlug(game.hteam ?? "")}`} aria-label={`${game.hteam ?? "Home"} team page`} className="mh-logo" style={{ background: `${teamColor(game.hteam ?? "")}22` }}>
                    <img src={getLogo(game.hteam)} alt={game.hteam ?? ""} />
                  </Link>
                  {status !== "UPCOMING" && <span className="mh-mini">{scoreText(game.hscore)}</span>}
                  <div className="mh-name">
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>{game.hteam ?? "Home"}</div>
                    {homeRecord && <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{homeRecord}</div>}
                  </div>
                </div>

                {/* Center column — score/time + status (bounded, never overlaps logos) */}
                <div className="mh-center">
                  {status === "UPCOMING" ? (
                    <div className="mh-score" style={{ fontWeight: 900 }}>{formatMatchTime(game.date)}</div>
                  ) : (
                    <>
                      <div className="mh-score">
                        {scoreText(game.hscore)}
                        <span style={{ fontWeight: 300, color: "rgba(255,255,255,0.25)", margin: "0 6px" }}>–</span>
                        {scoreText(game.ascore)}
                      </div>
                      <div className="mh-gb">
                        {game.hgoals ?? 0}.{game.hbehinds ?? 0}
                        <span style={{ margin: "0 4px", color: "rgba(255,255,255,0.25)" }}>–</span>
                        {game.agoals ?? 0}.{game.abehinds ?? 0}
                      </div>
                    </>
                  )}
                  <div className="mh-sub">
                    {status === "LIVE" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 999, background: "#16a34a" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 2px rgba(255,255,255,0.22)", animation: "livePulse 1.8s ease-in-out infinite", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", whiteSpace: "nowrap" }}>
                          {`Live${(game.timestr || getLiveGameClock(liveEvents)) ? ` · ${formatTimestr(game.timestr) || getLiveGameClock(liveEvents)}` : ""}`}
                        </span>
                      </span>
                    ) : status === "FINAL" ? (
                      <span style={{ display: "inline-block", padding: "5px 18px", borderRadius: 999, background: statusBadgeTone.bg, border: `1px solid ${statusBadgeTone.border}`, color: statusBadgeTone.color, fontSize: 13, fontWeight: 800 }}>
                        Full time
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                        {getCountdownText(game.date, now)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right column — away logo + name */}
                <div className="mh-slot mh-slot-r">
                  {status !== "UPCOMING" && <span className="mh-mini">{scoreText(game.ascore)}</span>}
                  <Link href={`/team/${toTeamSlug(game.ateam ?? "")}`} aria-label={`${game.ateam ?? "Away"} team page`} className="mh-logo" style={{ background: `${teamColor(game.ateam ?? "")}22` }}>
                    <img src={getLogo(game.ateam)} alt={game.ateam ?? ""} />
                  </Link>
                  <div className="mh-name">
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>{game.ateam ?? "Away"}</div>
                    {awayRecord && <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{awayRecord}</div>}
                  </div>
                </div>

                {/* Bottom line — viewer count for live/final */}
                {status !== "UPCOMING" && (
                  <div className="mh-venue" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
                      {status === "FINAL" ? (totalViewerCount ?? "—") : Math.max(1, liveViewerCount)}
                    </span>
                  </div>
                )}
              </div>

              <nav style={{ display: "flex", width: "100%", position: "relative" }}>
                {/* Sliding underline indicator */}
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: indicatorLeft,
                  width: indicatorWidth,
                  height: 2,
                  background: "#fff",
                  borderRadius: "1px 1px 0 0",
                  transition: "left 0.2s cubic-bezier(0.4,0,0.2,1), width 0.2s cubic-bezier(0.4,0,0.2,1)",
                  pointerEvents: "none",
                }} />
                {(["feed","chat","polls", ...(hasDuelGame ? ["duels" as const] : [])] as const).map(t => (
                  <button key={t} type="button" onClick={() => goToTab(t)} style={{
                    flex: 1, padding: "13px 4px 11px",
                    background: "none", border: "none",
                    borderBottom: "2px solid transparent",
                    color: activeTab === t ? "#fff" : "#64748b",
                    fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                    textTransform: "capitalize",
                    transition: "color 0.15s ease",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>
                    {t === "feed" && status === "UPCOMING" ? "Preview" : t === "duels" ? "⚔" : t.charAt(0).toUpperCase() + t.slice(1)}
                    {t === "polls" && unansweredPollCount > 0 && activeTab !== "polls" && (
                      <span style={{
                        fontSize: 10, fontWeight: 900, lineHeight: 1,
                        background: "#ef4444", color: "var(--text-1)",
                        borderRadius: 999, padding: "2px 5px",
                        minWidth: 16, textAlign: "center",
                      }}>
                        {unansweredPollCount}
                      </span>
                    )}
                  </button>
                ))}
                {(showStatsTabs || showPlayersTabs) && (
                  <>
                    {([...(showStatsTabs ? ["game" as TabKey] : []), ...(showPlayersTabs ? ["players" as TabKey] : [])]).map((t) => (
                      <button key={t} type="button" onClick={() => goToTab(t)} style={{
                        flex: 1, padding: "13px 4px 11px",
                        background: "none", border: "none",
                        borderBottom: "2px solid transparent",
                        color: activeTab === t ? "#fff" : "#64748b",
                        fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
                        cursor: "pointer", whiteSpace: "nowrap",
                        textTransform: "capitalize",
                        transition: "color 0.15s ease",
                      }}>
                        {t === "game" ? "Stats" : "Players"}
                      </button>
                    ))}
                  </>
                )}
              </nav>
              {activeTab === "players" && (
                <nav style={{ display: "flex", borderTop: "1px solid var(--border-2)" }}>
                  {(["all", "home", "away"] as const).map(t => {
                    const label = t === "all" ? "All" : t === "home" ? homeAbbr : awayAbbr;
                    return (
                      <button key={t} type="button" onClick={() => setPlayerSubTab(t)} style={{
                        flex: 1, padding: "9px 4px",
                        background: "none", border: "none",
                        borderBottom: `2px solid ${playerSubTab === t ? "#fff" : "transparent"}`,
                        color: playerSubTab === t ? "#fff" : "#64748b",
                        fontSize: 12, fontWeight: playerSubTab === t ? 700 : 500,
                        cursor: "pointer", whiteSpace: "nowrap",
                        transition: "color 0.15s ease",
                      }}>
                        {label}
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
          );
        })()}

        <div
          key={activeTab}
          className={tabAnimDir > 0 ? "tab-slide-in-right" : "tab-slide-in-left"}
          onTouchStart={onTabTouchStart}
          onTouchEnd={onTabTouchEnd}
        >
        {activeTab === "feed" && (
          <section style={sectionStyle}>
            {status === "UPCOMING" && game.date && (Date.parse(game.date) - Date.now()) < 10 * 24 * 60 * 60 * 1000 && (
              <div style={{ padding: "16px 16px 0" }}>
                <WinnerPick
                  matchId={id}
                  homeTeam={game.hteam}
                  awayTeam={game.ateam}
                  gameStatus={status}
                  homeScore={game.hscore}
                  awayScore={game.ascore}
                />
              </div>
            )}
            {/* Active in-game polls pinned at top of feed */}
            {isLiveGame && currentPeriod > 0 && (
              <FeedActivePolls
                gameId={Number(id)}
                currentPeriod={currentPeriod}
                onOpenPolls={() => goToTab("polls")}
              />
            )}

            {liveStatsError && status === "LIVE" && <p style={statsLoadingStyle}>{liveStatsError}</p>}

            {feedLoading && displayLiveEvents.length === 0 && (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.15)",
                  borderTopColor: "#fff",
                  animation: "spin 0.75s linear infinite",
                }} />
              </div>
            )}

            {!feedLoading && feedError && <p style={statsLoadingStyle}>{feedError}</p>}

            {!feedLoading && !feedError && displayLiveEvents.length === 0 && status === "UPCOMING" && (
              <>
                {game.venue && <VenueCard venue={game.venue} date={game.date} gameId={id} />}
                <InsOutsBox
                  homeTeam={safeText(game.hteam, "")}
                  awayTeam={safeText(game.ateam, "")}
                  gameId={id}
                />
                <HeadToHeadBox
                  homeTeam={safeText(game.hteam, "")}
                  awayTeam={safeText(game.ateam, "")}
                />
                <TeamFormBox
                  homeTeam={safeText(game.hteam, "")}
                  awayTeam={safeText(game.ateam, "")}
                  allGames={allGames}
                  currentGame={game}
                />
                <PlayerLeaderboardsBox
                  homeTeam={safeText(game.hteam, "")}
                  awayTeam={safeText(game.ateam, "")}
                  allGames={allGames}
                  currentGame={game}
                  squadPlayers={squadPlayers}
                />
                <LadderPositionsBox
                  homeTeam={safeText(game.hteam, "")}
                  awayTeam={safeText(game.ateam, "")}
                  allGames={allGames}
                />
                {new Date(game.date ?? "").getTime() - now < 5 * 24 * 60 * 60 * 1000 && (
                  <InsightsBox game={game} allGames={allGames} />
                )}
              </>
            )}

            {!feedLoading && !feedError && displayLiveEvents.length === 0 && status === "FINAL" && (
              <div style={emptyFeedStyle}>
                <strong>No live feed events available yet.</strong>
              </div>
            )}

            {!feedLoading && (displayLiveEvents.length > 0 || status === "LIVE") && (
              <div style={liveFeedListStyle}>
                {displayLiveEvents.map((event, index) => {
                  const ek = scoreEventKey(event, index);
                  const commentKey = commentKeyForEvent(eventCommentCounts, event, index);
                  const isFresh = freshEventKeys.has(stableEventIdentityKey(event, index));
                  // Use the snapshots captured when this event first appeared.
                  const eventPlayerFP: number | null = eventFPSnapshots.current[ek] ?? null;
                  const eventPlayerStats = eventStatSnapshots.current[ek] ?? null;
                  const eventMeta = liveFeedEventMeta(event, index, game.hteam, game.ateam);

                  return (
                    <div
                      key={ek}
                      style={isFresh ? {
                        animation: "feed-event-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
                        borderRadius: 18,
                      } : undefined}
                    >
                      {event.type === "QUARTER_BREAK" ? (
                        <QuarterBreakFeedBox
                          label={(event as any).label}
                          homeTeam={game.hteam}
                          awayTeam={game.ateam}
                          homeScore={event.homeScore}
                          awayScore={event.awayScore}
                        />
                      ) : (
                        <LiveFeedPlayer
                          event={event}
                          isNew={isFresh}
                          homeTeam={game.hteam}
                          awayTeam={game.ateam}
                          eventKey={commentKey}
                          commentCount={commentCountForEvent(eventCommentCounts, event, index)}
                          topComment={eventTopComments[commentKey]}
                          playerFP={eventPlayerFP}
                          playerFoopy={eventPlayerStats?.foopy ?? null}
                          playerDisposals={eventPlayerStats?.disposals ?? null}
                          playerGoals={eventPlayerStats?.goals ?? null}
                          playerTackles={eventPlayerStats?.tackles ?? null}
                          playerMarks={eventPlayerStats?.marks ?? null}
                          playerHitouts={eventPlayerStats?.hitouts ?? null}
                          reactions={eventReactions[commentKey] ?? []}
                          myReactions={myEventReactions[commentKey] ?? []}
                          onOpenReactionPopup={() => setReactionPopup({ eventKey: commentKey, label: eventMeta.label })}
                          onCommentClick={() => {
                            const inferredTeam = safeText((event as any).teamName, "");
                            const apiTeam = teamNameFromEvent(event);
                            const eventTeam = safeText(inferredTeam || apiTeam, "");
                            const player = findPlayerForLiveEvent(event, safeText(game.hteam, ""), safeText(game.ateam, ""));
                            const team = safeText(eventTeam || player?.club || player?.team, "");
                            const name = ((event as any).optimistic || (event as any).inferred)
                              ? team || "Team"
                              : safePlayerName(player?.name || event.playerName, event.playerId, team);
                            const label = `${name} · ${safeText(event.type, "").toUpperCase()}`;
                            const type = safeText(event.type, "").toUpperCase();
                            const quarter = eventQuarter(event);
                            const minute = String(event.minute ?? "");
                            const aliases = eventKeyAliases(event, index);
                            const params = new URLSearchParams({
                              label,
                              aliases: aliases.join(","),
                              ...(team ? { team } : {}),
                              ...(type ? { type } : {}),
                              ...(quarter ? { quarter } : {}),
                              ...(minute ? { minute } : {}),
                            });
                            router.push(`/match/${id}/${encodeURIComponent(commentKey)}?${params}`);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
                {/* Always show MATCH STARTED at the bottom — it's the chronological first event */}
                <QuarterBreakFeedBox label="MATCH STARTED" />
              </div>
            )}
          </section>
        )}

        {activeTab === "game" && (
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>Game Stats</h2>

            <QuarterScoresTable
              quarterScores={quarterScores}
              isLoading={quarterScoresLoading}
              hteam={game.hteam}
              ateam={game.ateam}
              currentPeriod={currentPeriod}
              displayMode={quarterScoreDisplayMode}
            />

            <div style={gameHeaderStyle}>
              <div style={gameTeamStyle}>
                <img src={getLogo(game.hteam)} alt={game.hteam} style={gameLogoStyle} />
                <strong>{homeAbbr}</strong>
              </div>
              <div style={gameTeamStyleRight}>
                <strong>{awayAbbr}</strong>
                <img src={getLogo(game.ateam)} alt={game.ateam} style={gameLogoStyle} />
              </div>
            </div>

            <div style={compareListStyle}>
              {[
                ["Disposals", "disposals", "disposals"],
                ["Kicks", "disposals", "kicks"],
                ["Handballs", "disposals", "handballs"],
                ["Marks", "marks", "marks"],
                ["Hitouts", "stoppages", "hitouts"],
                ["Clearances", "stoppages", "clearances"],
                ["Goals Kicked", "scoring", "goals"],
                ["Behinds Kicked", "scoring", "behinds"],
              ].map(([label, category, key]) => {
                const apiHomeTotal = getTeamStatFromBlock(homeTeamBlock, category, key);
                const apiAwayTotal = getTeamStatFromBlock(awayTeamBlock, category, key);
                const fallbackKey = key === "free_kicks" ? "freesFor" : key;
                const homeTotal = apiHomeTotal || teamTotal(displayHomeStats, fallbackKey);
                const awayTotal = apiAwayTotal || teamTotal(displayAwayStats, fallbackKey);
                const total = homeTotal + awayTotal;
                const homePct = percent(homeTotal, total);
                const awayPct = 100 - homePct;

                return (
                  <div key={key} style={compareRowStyle}>
                    <div style={compareTopStyle}>
                      <span style={compareValueStyle}>{homeTotal}</span>
                      <span style={compareLabelStyle}>{label}</span>
                      <span style={compareValueRightStyle}>{awayTotal}</span>
                    </div>

                    <div style={barShellStyle}>
                      <div style={{ ...barLeftStyle, width: `${homePct}%`, background: matchupBarColors(game.hteam, game.ateam).home }} />
                      <div style={{ ...barRightStyle, width: `${awayPct}%`, background: matchupBarColors(game.hteam, game.ateam).away }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={freeKickBoxStyle}>
              <div style={freeKickTitleStyle}>Free Kick Count</div>

              <div style={freeKickMainStyle}>
                <div style={freeKickTeamStyle}>
                  <img src={getLogo(game.hteam)} alt={game.hteam} style={freeKickLogoStyle} />
                  <span style={freeKickAbbrStyle}>{homeAbbr}</span>
                  <strong style={freeKickNumberStyle}>{homeFrees}</strong>
                </div>

                <div style={freeKickMiddleStyle}>FF</div>

                <div style={freeKickTeamRightStyle}>
                  <strong style={freeKickNumberStyle}>{awayFrees}</strong>
                  <span style={freeKickAbbrStyle}>{awayAbbr}</span>
                  <img src={getLogo(game.ateam)} alt={game.ateam} style={freeKickLogoStyle} />
                </div>
              </div>

              <div style={freeKickBarShellStyle}>
                <div style={{ ...freeKickBarLeftStyle, width: `${homeFreePct}%`, background: matchupBarColors(game.hteam, game.ateam).home }} />
                <div style={{ ...freeKickBarRightStyle, width: `${awayFreePct}%`, background: matchupBarColors(game.hteam, game.ateam).away }} />
              </div>

            </div>

            <div style={{ padding: "0 16px 16px" }}>
              <WinnerPick
                matchId={id}
                homeTeam={game.hteam}
                awayTeam={game.ateam}
                gameStatus={status}
                homeScore={game.hscore}
                awayScore={game.ascore}
              />
            </div>

            {/* Venue card at the bottom of the stats page once the match has started */}
            {status !== "UPCOMING" && game.venue && (
              <div style={{ padding: "0 16px" }}>
                <VenueCard venue={game.venue} date={game.date} gameId={id} />
              </div>
            )}
          </section>
        )}

        {(() => {
          const allMatchPlayers = [...displayHomeStats, ...displayAwayStats];
          const bestRating = allMatchPlayers.reduce((best, p) => Math.max(best, foopyRating(p)), 0);
          return (
            <>
              {activeTab === "players" && status === "UPCOMING" && (() => {
                const homeIds = new Set<number>(squadPlayers?.home ?? []);
                const awayIds = new Set<number>(squadPlayers?.away ?? []);
                function inSquad(p: any, ids: Set<number>) {
                  if (!ids.size) return true;
                  return ids.has(Number(p.apiSportsId));
                }
                const homeSeasonStats = seasonStats.filter(p => teamsMatch(p.team, game.hteam ?? "") && inSquad(p, homeIds));
                const awaySeasonStats = seasonStats.filter(p => teamsMatch(p.team, game.ateam ?? "") && inSquad(p, awayIds));
                const allSeasonStats = [...homeSeasonStats, ...awaySeasonStats];
                const shown = playerSubTab === "all" ? allSeasonStats : playerSubTab === "home" ? homeSeasonStats : awaySeasonStats;
                return (
                  <section style={{ borderBottom: "1px solid var(--border-2)" }}>
                    <SeasonAvgTable stats={shown} />
                  </section>
                );
              })()}

              {activeTab === "players" && status !== "UPCOMING" && playerSubTab === "all" && (
                <section style={{ borderBottom: "1px solid var(--border-2)" }}>
                  <StatTable stats={allMatchPlayers} isLive={isLiveGame} isFinal={status === "FINAL"} currentPeriod={currentPeriod} gameId={Number(id)} bestRating={bestRating} stickyTop={stickyHeaderH} statMode={playerStatMode} sortKey={playerSortKey} sortDir={playerSortDir} onSort={(k) => { if(playerSortKey===k) setPlayerSortDir(d=>d==="desc"?"asc":"desc"); else{setPlayerSortKey(k);setPlayerSortDir("desc");} }} columns={statCols} />
                </section>
              )}

              {activeTab === "players" && status !== "UPCOMING" && playerSubTab === "home" && (
                <section style={{ borderBottom: "1px solid var(--border-2)" }}>
                  <StatTable stats={displayHomeStats} isLive={isLiveGame} isFinal={status === "FINAL"} currentPeriod={currentPeriod} team={game.hteam} gameId={Number(id)} bestRating={bestRating} stickyTop={stickyHeaderH} statMode={playerStatMode} sortKey={playerSortKey} sortDir={playerSortDir} onSort={(k) => { if(playerSortKey===k) setPlayerSortDir(d=>d==="desc"?"asc":"desc"); else{setPlayerSortKey(k);setPlayerSortDir("desc");} }} columns={statCols} />
                </section>
              )}

              {activeTab === "players" && status !== "UPCOMING" && playerSubTab === "away" && (
                <section style={{ borderBottom: "1px solid var(--border-2)" }}>
                  <StatTable stats={displayAwayStats} isLive={isLiveGame} isFinal={status === "FINAL"} currentPeriod={currentPeriod} team={game.ateam} gameId={Number(id)} bestRating={bestRating} stickyTop={stickyHeaderH} statMode={playerStatMode} sortKey={playerSortKey} sortDir={playerSortDir} onSort={(k) => { if(playerSortKey===k) setPlayerSortDir(d=>d==="desc"?"asc":"desc"); else{setPlayerSortKey(k);setPlayerSortDir("desc");} }} columns={statCols} />
                </section>
              )}

              {activeTab === "players" && status !== "UPCOMING" && (
                <div style={{ display: "flex", justifyContent: "center", padding: "18px 16px calc(28px + env(safe-area-inset-bottom))" }}>
                  <button type="button" onClick={() => setStatColsEditorOpen(true)} style={editStatColsBtnStyle}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
                    </svg>
                    Edit stat columns
                  </button>
                </div>
              )}
            </>
          );
        })()}

        {statColsEditorOpen && (
          <StatColumnsEditor
            selected={statCols}
            onChange={applyStatCols}
            onClose={() => setStatColsEditorOpen(false)}
          />
        )}

        {activeTab === "chat" && (
          <section style={{ ...sectionStyle, padding: 0 }}>
            <MatchComments gameId={Number(id)} highlight={searchParams?.get("highlight") ?? null} />
          </section>
        )}

        {activeTab === "polls" && (
          <section style={sectionStyle}>
            <MatchPolls
              gameId={Number(id)}
              status={status}
              currentPeriod={currentPeriod}
              homeTeam={game.hteam}
              awayTeam={game.ateam}
              homeStats={displayHomeStats}
              awayStats={displayAwayStats}
              onUnansweredCount={setUnansweredPollCount}
            />
          </section>
        )}

        {activeTab === "duels" && (
          <section style={sectionStyle}>
            <DuelsTab
              gameId={Number(id)}
              gameStarted={status === "LIVE" || status === "FINAL"}
              apiSportsGameId={apiSportsGameId}
              matchHomeStats={liveHomeStats}
              matchAwayStats={liveAwayStats}
              matchHomeTeam={game?.hteam}
              matchAwayTeam={game?.ateam}
              onDuelGameFound={setHasDuelGame}
            />
          </section>
        )}
        </div>
      </section>
      {reactionPopup && (
        <EventReactionPopup
          label={reactionPopup.label}
          reactions={eventReactions[reactionPopup.eventKey] ?? []}
          myReactions={myEventReactions[reactionPopup.eventKey] ?? []}
          onClose={() => setReactionPopup(null)}
          onSelect={(emoji) => handleEventReaction(reactionPopup.eventKey, emoji)}
        />
      )}
    </main>
  );
}

/* ================= MATCH COMMENTS ================= */

type CommentProfile = { id: string; username?: string; display_name?: string; avatar_url?: string; verified?: boolean };
type MatchComment = {
  id: string; game_id: number; user_id: string; parent_id: string | null;
  body: string; likes: number; created_at: string; event_key?: string | null;
  profile?: CommentProfile | null; liked?: boolean; replies?: MatchComment[];
};

function mcRelTime(dateString: string) {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateString).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function MatchComments({ gameId, highlight }: { gameId: number; highlight: string | null }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [comments, setComments] = useState<MatchComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<MatchComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState<Set<string>>(new Set());
  const [dupToast, setDupToast] = useState(false);
  const [sort, setSort] = useState<"live" | "top">("live");
  const [cooldown, setCooldown] = useState(0);
  const [commentsSent, setCommentsSent] = useState(0);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function showDupToast() {
    setDupToast(true);
    setTimeout(() => setDupToast(false), 2500);
  }

  function insertSticker(name: string) {
    setBody(prev => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}:${name} `);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startReply(comment: MatchComment) {
    setReplyThreadId(null);
    setReplyTo(comment);
    const name = comment.profile?.username || comment.profile?.display_name;
    if (name) setBody(`@${name} `);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const replyThread = useMemo(
    () => (replyThreadId ? findMatchCommentById(comments, replyThreadId) : null),
    [comments, replyThreadId]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        supabase.from("profiles").select("username, display_name, avatar_url").eq("id", uid).maybeSingle()
          .then(({ data: p }) => {
            if (p) { setMyAvatar(p.avatar_url ?? null); setMyName(p.display_name || p.username || ""); }
          });
      }
    });
  }, []);

  const load = useCallback(async (currentSort: "live" | "top" = "live") => {
    setLoading(true);
    const query = supabase
      .from("feed_comments")
      .select("id, game_id, user_id, parent_id, body, likes, created_at, event_key")
      .eq("game_id", gameId)
      .is("event_key", null);

    const { data: rows, error } = currentSort === "top"
      ? await query.order("likes", { ascending: false }).order("created_at", { ascending: false })
      : await query.order("created_at", { ascending: false });

    if (error || !rows) { console.error("Chat load error:", error); setLoading(false); return; }

    // Load profiles separately
    const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
    const profileMap = new Map<string, CommentProfile>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url, verified").in("id", userIds);
      for (const p of profiles ?? []) profileMap.set(p.id, p as CommentProfile);
    }

    let likedIds = new Set<string>();
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (uid) {
      const { data: likes } = await supabase.from("feed_comment_likes").select("comment_id").eq("user_id", uid);
      likedIds = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
    }

    const all: MatchComment[] = (rows as unknown[]).map((r: unknown) => {
      const row = r as MatchComment;
      return { ...row, profile: profileMap.get(row.user_id) ?? null, liked: likedIds.has(row.id), replies: [] };
    });

    const byId: Record<string, MatchComment> = {};
    const topLevel: MatchComment[] = [];
    for (const c of all) byId[c.id] = c;
    for (const c of all) {
      if (c.parent_id) {
        const directParent = byId[c.parent_id];
        if (directParent) {
          // Flatten to 2 levels: if the direct parent is itself a reply,
          // attach this comment under the grandparent instead
          const effectiveParent = directParent.parent_id
            ? (byId[directParent.parent_id] ?? directParent)
            : directParent;
          effectiveParent.replies!.push(c);
        } else {
          topLevel.push(c); // orphan — parent was deleted
        }
      } else {
        topLevel.push(c);
      }
    }

    setComments(topLevel);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    if (!highlight || loading) return;
    const el = document.getElementById(`c-${highlight}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlight, loading]);

  useEffect(() => { load(sort); }, [load, sort]);

  async function submit(replyTarget: MatchComment | null = replyTo, text = body, onSent?: () => void) {
    if (!text.trim() || !userId || submitting) return false;

    // Check for duplicate — same text already sent by this user in this section
    const trimmed = text.trim().toLowerCase();
    const allComments = comments.flatMap(c => [c, ...(c.replies ?? [])]);
    const isDuplicate = allComments.some(
      c => c.user_id === userId && c.body.trim().toLowerCase() === trimmed
    );
    if (isDuplicate) { showDupToast(); return false; }

    setSubmitting(true);
    const trimmedBody = text.trim();
    const { data: inserted, error } = await supabase.from("feed_comments").insert({
      game_id: gameId, user_id: userId,
      // Flatten to 2 levels: reply to a reply links to the original top-level comment
      parent_id: replyTarget ? (replyTarget.parent_id ?? replyTarget.id) : null,
      body: trimmedBody, event_key: null,
    }).select("id").single();
    if (error) {
      console.error("Chat insert error:", error);
      setSubmitting(false);
      return false;
    } else {
      const newCommentId = (inserted as { id: string } | null)?.id;
      // Notify parent comment author of reply
      if (replyTarget && replyTarget.user_id && replyTarget.user_id !== userId) {
        await createNotification(replyTarget.user_id, "reply_comment", userId, {
          comment_body: trimmedBody.slice(0, 100),
          comment_id: replyTarget.id,
          game_id: gameId,
          event_key: null,
        });
      }
      // Notify any @mentioned users
      await notifyMentions(trimmedBody, userId, {
        comment_body: trimmedBody.slice(0, 100),
        comment_id: newCommentId,
        game_id: gameId,
        event_key: null,
      });
      onSent ? onSent() : setBody("");
      setReplyTo(null);
      const newCount = commentsSent + 1;
      setCommentsSent(newCount);
      if (newCount > 3) setCooldown(30);
      await load(sort);
    }
    setSubmitting(false);
    return true;
  }

  async function handleLike(c: MatchComment) {
    if (!userId || liking.has(c.id)) return;
    setLiking(prev => new Set(prev).add(c.id));
    if (c.liked) {
      await supabase.from("feed_comment_likes").delete().eq("comment_id", c.id).eq("user_id", userId);
    } else {
      await supabase.from("feed_comment_likes").insert({ comment_id: c.id, user_id: userId });
      // Notify comment author of like
      if (c.user_id !== userId) {
        createNotification(c.user_id, "like_comment", userId, {
          comment_body: c.body.slice(0, 100),
          comment_id: c.id,
          game_id: gameId,
          event_key: null,
        });
      }
    }
    await load(sort);
    setLiking(prev => { const s = new Set(prev); s.delete(c.id); return s; });
  }

  async function handleDelete(id: string) {
    await supabase.from("feed_comments").delete().eq("id", id);
    await load(sort);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 108px)" }}>

      {/* Duplicate toast */}
      {dupToast && (
        <div style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 12px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "none",
          background: "rgba(15,15,15,0.96)",
          border: "1px solid rgba(251,146,60,0.3)",
          borderRadius: 999,
          padding: "9px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(251,146,60,0.12)",
          animation: "xpToastIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
          whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fb923c", background: "rgba(251,146,60,0.15)", borderRadius: 999, padding: "2px 10px" }}>
            ✕
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Comment already sent
          </span>
        </div>
      )}

      {/* Chat header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 10px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>
          Comments
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>{comments.length > 0 ? comments.length : ""}</span>
        </span>
        {/* Sort pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["live", "top"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              background: sort === s ? "var(--text-1)" : "var(--border-1)",
              color: sort === s ? "var(--bg)" : "var(--text-3)",
              transition: "all 0.15s",
            }}>
              {s === "live" ? "Live" : "Top"}
            </button>
          ))}
        </div>
      </div>

      {/* Comments list */}
      <div style={{ flex: 1, padding: "10px 0 4px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div style={{ width: 24, height: 24, border: "2px solid var(--border-2)", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : comments.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 20px", color: "var(--text-2)", textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9" y1="10" x2="15" y2="10" /><line x1="9" y1="14" x2="13" y2="14" />
            </svg>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)", marginBottom: 5 }}>Start the conversation</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Be the first to react!</div>
          </div>
        ) : (
          comments.map(c => (
            <MCRow key={c.id} comment={c} userId={userId} onLike={handleLike} onDelete={handleDelete}
              onReply={startReply} onViewReplies={(comment) => setReplyThreadId(comment.id)} liking={liking} />
          ))
        )}
      </div>

      {replyThread && (
        <MatchRepliesPopup
          comment={replyThread}
          userId={userId}
          onClose={() => setReplyThreadId(null)}
          onLike={handleLike}
          onDelete={handleDelete}
          onViewReplies={(comment) => setReplyThreadId(comment.id)}
          liking={liking}
          onSubmitReply={(text) => submit(replyThread, text, () => undefined)}
          submitting={submitting}
          cooldown={cooldown}
          onSignIn={() => router.push("/login")}
        />
      )}

      {/* Input — sticky to viewport bottom */}
      <div style={{ position: "sticky", bottom: 0, zIndex: 50, borderTop: "1px solid var(--border-2)", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", background: "var(--bottom-nav-bg)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        {!userId ? (
          <button onClick={() => router.push("/login")} style={{ width: "100%", height: 48, borderRadius: 16, background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "var(--text-1)", fontWeight: 900, fontSize: 15, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(59,130,246,0.3)" }}>
            Sign in to chat
          </button>
        ) : (
          <>
            {replyTo && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "7px 12px", background: "rgba(59,130,246,.1)", borderRadius: 12, border: "1px solid rgba(59,130,246,.22)" }}>
                <span style={{ color: "var(--text-2)", fontSize: 12, fontWeight: 700 }}>
                  Replying to <span style={{ color: "#60a5fa", fontWeight: 900 }}>{replyTo.profile?.display_name || replyTo.profile?.username || "user"}</span>
                </span>
                <button onClick={() => setReplyTo(null)} style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--surface-3)", border: "none", color: "var(--text-2)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            )}
            {cooldown > 0 && (
              <div style={{ marginBottom: 8, padding: "7px 12px", borderRadius: 12, background: "rgba(251,146,60,.1)", border: "1px solid rgba(251,146,60,.25)", fontSize: 12, fontWeight: 700, color: "#fb923c", textAlign: "center" as const }}>
                Wait {cooldown}s before commenting again
              </div>
            )}
            <StickerPicker onPick={insertSticker} />
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <MiniAvatar name={myName} url={myAvatar} size={38} />
              <MentionTextarea
                textareaRef={inputRef}
                value={body}
                onChange={setBody}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !cooldown) { e.preventDefault(); submit(); } }}
                placeholder={cooldown > 0 ? `Wait ${cooldown}s…` : replyTo ? "Write a reply…" : "Write a comment…"}
                rows={1}
                maxLength={500}
                style={{ width: "100%", minHeight: 44, maxHeight: 110, background: "var(--surface-3)", border: "1.5px solid var(--border-3)", borderRadius: 999, color: "var(--text-1)", fontSize: 14, padding: "11px 16px", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.45 }}
              />
              <button
                onClick={() => submit()}
                disabled={!body.trim() || submitting || cooldown > 0}
                style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 2px 12px rgba(59,130,246,0.35)", border: "none", color: "var(--text-1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: !body.trim() || submitting || cooldown > 0 ? 0.38 : 1, transition: "opacity 0.15s" }}
              >
                {submitting
                  ? <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  : cooldown > 0
                  ? <span style={{ fontSize: 11, fontWeight: 900 }}>{cooldown}s</span>
                  : <SendArrowIcon />
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CommentBody({ text }: { text: string }) {
  const router = useRouter();
  const parts = text.split(/(@\w+)/g);
  return (
    <p style={{ margin: 0, fontSize: 14, color: "var(--text-1)", lineHeight: 1.5, wordBreak: "break-word" }}>
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

function MCRow({ comment, userId, onLike, onDelete, onReply, onViewReplies, liking, isReply = false, hideRepliesToggle = false }: {
  comment: MatchComment; userId: string | null;
  onLike: (c: MatchComment) => void; onDelete: (id: string) => void;
  onReply: (c: MatchComment) => void; onViewReplies: (c: MatchComment) => void; liking: Set<string>; isReply?: boolean; hideRepliesToggle?: boolean;
}) {
  const router = useRouter();
  const name = comment.profile?.display_name || comment.profile?.username || "User";
  const username = comment.profile?.username;
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiked = comment.liked;
  const isLiking = liking.has(comment.id);
  const replyCount = comment.replies?.length ?? 0;

  return (
    <div id={`c-${comment.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: isReply ? "10px 16px 6px 54px" : "12px 16px 6px", marginBottom: 0 }}>
      <div
        onClick={() => username && router.push(`/profile/${username}`)}
        style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: username ? "pointer" : "default" }}
      >
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 13, fontWeight: 950, color: "#60a5fa" }}>{name[0]?.toUpperCase()}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {/* Username + badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
            <span
              onClick={() => username && router.push(`/profile/${username}`)}
              style={{ fontWeight: 800, fontSize: 13, color: "var(--text-1)", cursor: username ? "pointer" : "default", lineHeight: 1 }}
            >
              {name}
            </span>
            {comment.profile?.verified && <VerifiedBadge size={13} />}
          </div>
          {/* Body */}
          <CommentText text={comment.body} style={{ margin: 0, fontSize: 14, color: "var(--text-1)", lineHeight: 1.45, wordBreak: "break-word" }} />
          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{mcRelTime(comment.created_at)}</span>
            {userId && (
              <>
                <button onClick={() => onReply(comment)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--text-3)" }}>
                  Reply
                </button>
                {isOwn && (
                  <button onClick={() => onDelete(comment.id)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#ef4444" }}>
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
          {!hideRepliesToggle && replyCount > 0 && (
            <button
              onClick={() => onViewReplies(comment)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "8px 0 0", fontSize: 12, fontWeight: 800, color: "var(--text-3)", cursor: "pointer" }}
            >
              <span style={{ width: 20, height: 1, background: "var(--border-2)", display: "inline-block" }} />
              {`View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>

        {/* Like — right column TikTok-style */}
        <button
          onClick={() => onLike(comment)}
          disabled={!userId || isLiking}
          aria-label={isLiked ? "Unlike comment" : "Like comment"}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", padding: "2px 0 0", cursor: userId ? "pointer" : "default", color: isLiked ? "#f43f5e" : "var(--text-3)", opacity: isLiking ? 0.5 : 1, minWidth: 30 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? "#f43f5e" : "none"} stroke={isLiked ? "#f43f5e" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {comment.likes > 0 && <span style={{ fontSize: 11, fontWeight: 800 }}>{comment.likes}</span>}
        </button>
      </div>
    </div>
  );
}

function MatchRepliesPopup({ comment, userId, onClose, onLike, onDelete, onViewReplies, liking, onSubmitReply, submitting, cooldown, onSignIn }: {
  comment: MatchComment; userId: string | null; onClose: () => void;
  onLike: (c: MatchComment) => void; onDelete: (id: string) => void;
  onViewReplies: (c: MatchComment) => void; liking: Set<string>;
  onSubmitReply: (text: string) => Promise<boolean>;
  submitting: boolean;
  cooldown: number;
  onSignIn: () => void;
}) {
  const replyCount = comment.replies?.length ?? 0;
  const [replyBody, setReplyBody] = useState("");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("oldest");
  const popupInputRef = useRef<HTMLTextAreaElement>(null);
  const replyPlaceholder = cooldown > 0 ? `Wait ${cooldown}s...` : "Reply...";
  const submitReply = async () => {
    const sent = await onSubmitReply(replyBody);
    if (sent) setReplyBody("");
  };
  const focusReplyInput = () => setTimeout(() => popupInputRef.current?.focus(), 0);

  return (
    <div style={matchReplyModalBackdropStyle} onClick={onClose}>
      <section style={matchReplyModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={matchReplyModalHeaderStyle}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>
            Replies
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>{replyCount > 0 ? replyCount : ""}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {replyCount > 1 && (
              <div style={{ display: "flex", borderRadius: 999, border: "1px solid var(--border-2)", overflow: "hidden" }}>
                {(["oldest", "newest"] as const).map(dir => (
                  <button key={dir} onClick={() => setSortDir(dir)} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: sortDir === dir ? "var(--surface-3)" : "transparent", color: sortDir === dir ? "var(--text-1)" : "var(--text-3)" }}>
                    {dir === "oldest" ? "Oldest" : "Newest"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onClose} style={matchReplyModalCloseStyle}>×</button>
          </div>
        </div>
        <div style={matchReplyParentStyle}>
          <MCRow comment={comment} userId={userId} onLike={onLike} onDelete={onDelete} onReply={() => focusReplyInput()} onViewReplies={onViewReplies} liking={liking} hideRepliesToggle />
        </div>
        <div style={matchReplyListStyle}>
          {replyCount === 0 ? (
            <div style={matchReplyEmptyStyle}>No replies yet.</div>
          ) : (
            [...comment.replies!]
              .sort((a, b) => {
                const ta = new Date(a.created_at).getTime();
                const tb = new Date(b.created_at).getTime();
                return sortDir === "newest" ? tb - ta : ta - tb;
              })
              .map((reply) => (
                <MCRow key={reply.id} comment={reply} userId={userId} onLike={onLike} onDelete={onDelete}
                  onReply={() => {
                    const name = reply.profile?.username || reply.profile?.display_name;
                    if (name) setReplyBody(`@${name} `);
                    focusReplyInput();
                  }}
                  onViewReplies={onViewReplies} liking={liking} />
              ))
          )}
        </div>
        <div style={matchReplyComposerStyle}>
          {!userId ? (
            <button onClick={onSignIn} style={matchReplySignInStyle}>Sign in to reply</button>
          ) : (
            <>
              {cooldown > 0 && (
                <div style={matchReplyCooldownStyle}>Wait {cooldown}s before replying again</div>
              )}
              <div style={matchReplyInputRowStyle}>
                <MentionTextarea
                  textareaRef={popupInputRef}
                  value={replyBody}
                  onChange={setReplyBody}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !cooldown) { e.preventDefault(); submitReply(); } }}
                  placeholder={replyPlaceholder}
                  rows={1}
                  maxLength={500}
                  style={matchReplyTextareaStyle}
                />
                <button
                  onClick={submitReply}
                  disabled={!replyBody.trim() || submitting || cooldown > 0}
                  style={{ ...matchReplySendBtnStyle, opacity: !replyBody.trim() || submitting || cooldown > 0 ? 0.38 : 1 }}
                  aria-label="Send reply"
                >
                  {submitting
                    ? <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    : cooldown > 0
                    ? <span style={{ fontSize: 11, fontWeight: 900 }}>{cooldown}s</span>
                    : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" /></svg>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function findMatchCommentById(comments: MatchComment[], id: string): MatchComment | null {
  for (const comment of comments) {
    if (comment.id === id) return comment;
    const found = findMatchCommentById(comment.replies ?? [], id);
    if (found) return found;
  }
  return null;
}

const matchReplyModalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  background: "rgba(0,0,0,0.68)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px 10px",
};

const matchReplyModalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  height: "min(82dvh, 720px)",
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 24px 80px rgba(0,0,0,0.68)",
  display: "flex",
  flexDirection: "column",
};

const matchReplyModalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 16px 11px",
  borderBottom: "1px solid var(--border-1)",
};

const matchReplyModalCloseStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "none",
  background: "var(--border-1)",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='%23e5e7eb' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'/%3E%3Cline x1='6' y1='6' x2='18' y2='18'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  backgroundSize: "17px 17px",
  color: "var(--text-1)",
  fontSize: 0,
  lineHeight: 1,
  cursor: "pointer",
};

const matchReplyParentStyle: CSSProperties = {
  padding: "4px 0 12px",
  borderBottom: "1px solid var(--border-1)",
  flexShrink: 0,
};

const matchReplyListStyle: CSSProperties = {
  overflowY: "auto",
  padding: "8px 0 14px",
  flex: 1,
  minHeight: 0,
};

const matchReplyEmptyStyle: CSSProperties = {
  padding: "28px 16px",
  color: "var(--text-3)",
  fontSize: 13,
  fontWeight: 800,
  textAlign: "center",
};

const matchReplyComposerStyle: CSSProperties = {
  borderTop: "1px solid var(--border-2)",
  padding: "10px 14px 12px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  flexShrink: 0,
};

const matchReplyInputRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
};

const matchReplyTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  maxHeight: 96,
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

const matchReplySendBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
  boxShadow: "0 2px 12px rgba(59,130,246,0.35)",
  border: "none",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  transition: "opacity 0.15s",
};

const matchReplySignInStyle: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
  color: "var(--text-1)",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
};

const matchReplyCooldownStyle: CSSProperties = {
  marginBottom: 8,
  padding: "7px 12px",
  borderRadius: 12,
  background: "rgba(251,146,60,.1)",
  border: "1px solid rgba(251,146,60,.25)",
  fontSize: 12,
  fontWeight: 700,
  color: "#fb923c",
  textAlign: "center",
};

/* ================= POLLS ================= */

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID ?? "";

const POLL_CATEGORIES: Record<string, { label: string; shortLabel: string; stat: string; type: "team" | "player" | "player_all" }> = {
  team_winner:       { label: "Pick the winner",                      shortLabel: "Winner",       stat: "winner",     type: "team" },
  team_goals:        { label: "Which team kicks more goals?",         shortLabel: "Team Goals",   stat: "goals",      type: "team" },
  team_disposals:    { label: "Which team gets more disposals?",      shortLabel: "Disposals",    stat: "disposals",  type: "team" },
  team_marks:        { label: "Which team takes more marks?",         shortLabel: "Marks",        stat: "marks",      type: "team" },
  team_free_kicks:   { label: "Which team gets more free kicks?",     shortLabel: "Free Kicks",   stat: "freesFor",   type: "team" },
  team_hitouts:      { label: "Which team wins the hitout count?",    shortLabel: "Hitouts",      stat: "hitouts",    type: "team" },
  team_clearances:   { label: "Which team gets more clearances?",     shortLabel: "Clearances",   stat: "clearances", type: "team" },
  team_inside50s:    { label: "Which team gets more inside 50s?",     shortLabel: "Inside 50s",   stat: "inside50s",  type: "team" },
  player_disposals:  { label: "Player to record the most disposals",  shortLabel: "Disposals",    stat: "disposals",  type: "player" },
  player_goals:      { label: "Player to kick the most goals",        shortLabel: "Top Goalkicker", stat: "goals",    type: "player" },
  player_marks:      { label: "Player to take the most marks",        shortLabel: "Most Marks",   stat: "marks",      type: "player" },
  player_tackles:    { label: "Player to make the most tackles",      shortLabel: "Most Tackles", stat: "tackles",    type: "player" },
  player_hitouts:    { label: "Player to record the most hitouts",    shortLabel: "Most Hitouts", stat: "hitouts",    type: "player" },
  player_clearances: { label: "Player to record the most clearances", shortLabel: "Clearances",   stat: "clearances", type: "player" },
  player_foopy:      { label: "Player with the highest Foopy rating", shortLabel: "Foopy Rating", stat: "foopy",      type: "player" },
  anytime_goal:      { label: "Player to kick a goal",                shortLabel: "Anytime Goal", stat: "goals",      type: "player_all" },
  goals_2plus:       { label: "Player to kick 2+ goals",              shortLabel: "2+ Goals",     stat: "goals",      type: "player_all" },
  goals_3plus:       { label: "Player to kick 3+ goals",              shortLabel: "3+ Goals",     stat: "goals",      type: "player_all" },
  goals_4plus:       { label: "Player to kick 4+ goals",              shortLabel: "4+ Goals",     stat: "goals",      type: "player_all" },
  disp_20plus:       { label: "Player to get 20+ disposals",          shortLabel: "20+ Disposals",stat: "disposals",  type: "player_all" },
  disp_25plus:       { label: "Player to get 25+ disposals",          shortLabel: "25+ Disposals",stat: "disposals",  type: "player_all" },
  disp_30plus:       { label: "Player to get 30+ disposals",          shortLabel: "30+ Disposals",stat: "disposals",  type: "player_all" },
  disp_35plus:       { label: "Player to get 35+ disposals",          shortLabel: "35+ Disposals",stat: "disposals",  type: "player_all" },
};

type Poll = {
  id: string;
  question: string;
  poll_type: "team" | "player" | "player_all" | "over_under";
  category_key: string | null;
  created_at: string;
  quarter: number | null; // which quarter this poll was created in (null = pre-game)
  options: PollOption[];
};

type PollOption = {
  id: string;
  label: string;
  position: number;
};

/* ── Feed: active polls banner ── */

function FeedActivePolls({ gameId, currentPeriod, onOpenPolls }: {
  gameId: number;
  currentPeriod: number;
  onOpenPolls: () => void;
}) {
  const [activePolls, setActivePolls] = useState<Poll[]>([]);

  useEffect(() => {
    supabase
      .from("match_polls")
      .select("id, question, poll_type, category_key, created_at, quarter, options:match_poll_options(id, label, position)")
      .eq("game_id", gameId)
      .eq("quarter", currentPeriod)
      .then(({ data }) => {
        setActivePolls((data as unknown as Poll[]) ?? []);
      });
  }, [gameId, currentPeriod]);

  if (activePolls.length === 0) return null;

  return (
    <div style={{ margin: "12px 16px 4px" }}>
      {activePolls.map(poll => (
        <button
          key={poll.id}
          onClick={onOpenPolls}
          style={{
            width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
            background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.08))",
            border: "1.5px solid rgba(59,130,246,0.3)",
            borderRadius: 16, padding: "12px 14px", marginBottom: 8,
            cursor: "pointer",
          }}
        >
          {/* Poll icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "rgba(59,130,246,0.18)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#60a5fa", letterSpacing: "0.06em", marginBottom: 2 }}>
              LIVE POLL · Q{currentPeriod}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {poll.question}
            </div>
          </div>
          {/* Arrow */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// A poll is "open" (voteable) if:
//   - pre-game poll (quarter === null) AND status === "UPCOMING"
//   - in-game poll (quarter !== null) AND currentPeriod <= poll.quarter AND not FINAL
function isPollOpen(poll: Poll, status: string, currentPeriod: number): boolean {
  if (status === "FINAL") return false;
  if (poll.quarter === null) return status === "UPCOMING";
  // Still open while current quarter hasn't moved past the poll's quarter
  return currentPeriod <= poll.quarter;
}

function resolveWinner(poll: Poll, homeStats: PlayerStat[], awayStats: PlayerStat[], homeTeam: string, awayTeam: string): string | null {
  // Over/Under polls: parse question to get player name, threshold, and stat
  if (poll.poll_type === "over_under") {
    const dashParts = poll.question.split(" — ");
    const playerName = dashParts[0]?.trim();
    const ouPart = dashParts[1]; // e.g. "Over/Under 31.5 Disposals"
    const m = ouPart?.match(/Over\/Under\s+([\d.]+)\s+(\w+)/i);
    if (!m || !playerName) return null;
    const threshold = parseFloat(m[1]);
    const statName = m[2].toLowerCase() as keyof PlayerStat;
    const allStats = [...homeStats, ...awayStats];
    const ps = allStats.find(p => (p.name || p.player || "").toLowerCase() === playerName.toLowerCase());
    if (!ps) return null;
    const val = num(ps[statName]);
    return val >= threshold ? "Over" : "Under";
  }

  const cat = poll.category_key ? POLL_CATEGORIES[poll.category_key] : null;
  if (!cat) return null;
  const stat = cat.stat as keyof PlayerStat;

  if (cat.type === "team") {
    const homeTotal = homeStats.reduce((s, p) => s + num(p[stat]), 0);
    const awayTotal = awayStats.reduce((s, p) => s + num(p[stat]), 0);
    if (homeTotal > awayTotal) return homeTeam;
    if (awayTotal > homeTotal) return awayTeam;
    return null;
  }

  const allStats = [...homeStats, ...awayStats];
  let best: string | null = null;
  let bestVal = -1;
  for (const opt of poll.options) {
    const ps = allStats.find(p => (p.name || p.player || "").toLowerCase() === opt.label.toLowerCase());
    if (!ps) continue;
    const val = stat === "foopy" ? foopyRating(ps) : num(ps[stat]);
    if (val > bestVal) { bestVal = val; best = opt.label; }
  }
  return best;
}

function pollOptionMatchesWinner(optionLabel: string, winner: string | null) {
  if (!winner) return false;
  const wLow = winner.toLowerCase();
  const oLow = optionLabel.toLowerCase();
  // Over/Under: winner is "Over" or "Under"; option label is "Over 31.5" / "Under 31.5"
  if (wLow === "over" || wLow === "under") return oLow.startsWith(wLow);
  return normaliseTeamKey(optionLabel) === normaliseTeamKey(winner);
}

type VoteRow = { poll_id: string; option_id: string; user_id: string };

type LeaderEntry = {
  userId: string;
  xp: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function PollLeaderboard({
  polls,
  allVotes,
  homeStats,
  awayStats,
  homeTeam,
  awayTeam,
}: {
  polls: Poll[];
  allVotes: VoteRow[];
  homeStats: PlayerStat[];
  awayStats: PlayerStat[];
  homeTeam: string;
  awayTeam: string;
}) {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (polls.length === 0 || allVotes.length === 0) { setLoading(false); return; }

    // Compute aura earned per user from correct votes
    const auraMap: Record<string, number> = {};
    for (const poll of polls) {
      const winner = resolveWinner(poll, homeStats, awayStats, homeTeam, awayTeam);
      if (!winner) continue;
      const winOpt = poll.options.find(o => pollOptionMatchesWinner(o.label, winner));
      if (!winOpt) continue;
      // Match the same tiers used when awarding aura
      const optCount = poll.options.length;
      const aura = optCount >= 4 ? 40 : optCount === 3 ? 30 : 20;
      for (const v of allVotes) {
        if (v.poll_id === poll.id && v.option_id === winOpt.id) {
          auraMap[v.user_id] = (auraMap[v.user_id] ?? 0) + aura;
        }
      }
    }

    const top10 = Object.entries(auraMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (top10.length === 0) { setLoading(false); return; }

    // Fetch profiles for top users
    const userIds = top10.map(([id]) => id);
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds)
      .then(({ data }) => {
        const profileMap: Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }> = {};
        for (const p of (data ?? []) as any[]) profileMap[p.id] = p;
        setEntries(
          top10.map(([userId, xp]) => ({
            userId,
            xp,
            username: profileMap[userId]?.username ?? null,
            displayName: profileMap[userId]?.display_name ?? null,
            avatarUrl: profileMap[userId]?.avatar_url ?? null,
          }))
        );
        setLoading(false);
      });
  }, [polls, allVotes, homeStats, awayStats, homeTeam, awayTeam]);

  const router = useRouter();

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
      <div style={{ width: 20, height: 20, border: "2px solid var(--border-2)", borderTop: "2px solid #fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );
  if (entries.length === 0) return null;

  return (
    <div style={{ background: "var(--surface-2)", border: "none", borderRadius: 16, overflow: "hidden", marginBottom: 4 }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Poll Leaderboard</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)" }}>Aura from polls</span>
      </div>

      {/* Rows */}
      {entries.map((e, i) => {
        const label = e.username || e.displayName || "User";
        const initials = label.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

        return (
          <div
            key={e.userId}
            onClick={() => e.username && router.push(`/album/${e.username}`)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 14px",
              borderTop: i > 0 ? "1px solid var(--border-1)" : "none",
              cursor: e.username ? "pointer" : "default",
            }}
          >
            {/* Rank */}
            <div style={{ width: 22, textAlign: "center", flexShrink: 0 }}>
              {i < 3
                ? <span style={{ fontSize: 15 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                : <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-4)" }}>{i + 1}</span>
              }
            </div>

            {/* Avatar */}
            <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", border: "2px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-3)" }}>
              {e.avatarUrl
                ? <img src={e.avatarUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 12, fontWeight: 900, color: "var(--text-3)" }}>{initials}</span>
              }
            </div>

            {/* Name */}
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {e.username ? `@${e.username}` : e.displayName || "User"}
            </div>

            {/* Aura */}
            <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 900, background: "linear-gradient(135deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              +{e.xp}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MatchPolls({
  gameId,
  status,
  currentPeriod,
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  onUnansweredCount,
}: {
  gameId: number;
  status: string;
  currentPeriod: number;
  homeTeam: string;
  awayTeam: string;
  homeStats: PlayerStat[];
  awayStats: PlayerStat[];
  onUnansweredCount?: (n: number) => void;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [allVotes, setAllVotes] = useState<{ poll_id: string; option_id: string; user_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pollCommentCounts, setPollCommentCounts] = useState<Record<string, number>>({});

  const isAdmin = !!ADMIN_USER_ID && userId === ADMIN_USER_ID;
  const showResults = status === "FINAL";
  const [autoCreating, setAutoCreating] = useState<"idle" | "creating" | "done">("idle");

  async function autoCreatePoll() {
    if (!userId || autoCreating !== "idle") return;

    const all = [...homeStats, ...awayStats].filter(p => !!(p.player || p.name));
    const pname = (p: PlayerStat) => p.player || p.name || "";

    // Score potential polls and pick the best one not already created
    type Candidate = { question: string; key: string; type: string; options: string[]; score: number };
    const candidates: Candidate[] = [];

    const addPlayer = (sorted: PlayerStat[], statKey: keyof PlayerStat, minVal: number, catKey: string, question: string) => {
      const top = sorted.filter(p => Number((p as any)[statKey] ?? 0) >= minVal).slice(0, 2);
      if (top.length < 2) return;
      const va = Number((top[0] as any)[statKey] ?? 0);
      const vb = Number((top[1] as any)[statKey] ?? 0);
      const diff = Math.abs(va - vb);
      const score = diff === 0 ? 100 : diff / Math.max(va, 1) < 0.15 ? 85 : diff / Math.max(va, 1) < 0.35 ? 65 : diff / Math.max(va, 1) < 0.6 ? 45 : 20;
      candidates.push({ question, key: catKey, type: "player", options: [pname(top[0]), pname(top[1])], score });
    };

    // Foopy rating
    const byFoopy = [...all].sort((a, b) => foopyRating(b) - foopyRating(a));
    if (byFoopy.length >= 2) {
      const [a, b] = byFoopy;
      const fa = foopyRating(a), fb = foopyRating(b);
      if (fa > 2) {
        const diff = Math.abs(fa - fb);
        candidates.push({ question: POLL_CATEGORIES.player_foopy.label, key: "player_foopy", type: "player", options: [pname(a), pname(b)], score: diff < 0.3 ? 100 : diff < 0.8 ? 85 : diff < 1.5 ? 65 : 40 });
      }
    }
    const ns = (p: PlayerStat, k: keyof PlayerStat) => Number((p as any)[k] ?? 0);
    addPlayer([...all].sort((a,b)=>ns(b,"goals")-ns(a,"goals")), "goals", 1, "player_goals", POLL_CATEGORIES.player_goals.label);
    addPlayer([...all].sort((a,b)=>ns(b,"disposals")-ns(a,"disposals")), "disposals", 15, "player_disposals", POLL_CATEGORIES.player_disposals.label);
    addPlayer([...all].sort((a,b)=>ns(b,"marks")-ns(a,"marks")), "marks", 3, "player_marks", POLL_CATEGORIES.player_marks.label);
    addPlayer([...all].sort((a,b)=>ns(b,"clearances")-ns(a,"clearances")), "clearances", 3, "player_clearances", POLL_CATEGORIES.player_clearances.label);
    addPlayer([...all].sort((a,b)=>ns(b,"hitouts")-ns(a,"hitouts")), "hitouts", 5, "player_hitouts", POLL_CATEGORIES.player_hitouts.label);
    addPlayer([...all].sort((a,b)=>ns(b,"tackles")-ns(a,"tackles")), "tackles", 4, "player_tackles", POLL_CATEGORIES.player_tackles.label);
    // Team polls intentionally excluded — auto polls are always player matchups

    // Avoid duplicating a poll category already on this game
    const usedKeys = new Set(polls.map(p => p.category_key));
    const available = candidates.filter(c => !usedKeys.has(c.key)).sort((a, b) => b.score - a.score);
    if (available.length === 0) return;

    // Pick randomly from top 3 for variety
    const top = available.slice(0, Math.min(3, available.length));
    const pick = top[Math.floor(Math.random() * top.length)];

    setAutoCreating("creating");
    try {
      const { data: poll, error } = await supabase
        .from("match_polls")
        .insert({ game_id: gameId, user_id: userId, question: pick.question, poll_type: pick.type, category_key: pick.key, quarter: currentPeriod > 0 ? currentPeriod : null })
        .select("id").single();
      if (error || !poll) { setAutoCreating("idle"); return; }
      await supabase.from("match_poll_options").insert(pick.options.map((label, i) => ({ poll_id: (poll as any).id, label, position: i })));
      await loadPolls();
      setAutoCreating("done");
      setTimeout(() => setAutoCreating("idle"), 2000);
    } catch { setAutoCreating("idle"); }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  const loadPolls = useCallback(async () => {
    setLoading(true);
    const { data: pollRows } = await supabase
      .from("match_polls")
      .select("id, question, poll_type, category_key, created_at, quarter, options:match_poll_options(id, label, position)")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (!pollRows) { setLoading(false); return; }
    setPolls(pollRows as Poll[]);

    // Fetch comment counts for all polls in this game
    const pollKeys = (pollRows as any[]).map((p) => `poll_${p.id}`);
    if (pollKeys.length > 0) {
      supabase
        .from("feed_comments")
        .select("event_key")
        .eq("game_id", gameId)
        .in("event_key", pollKeys)
        .then(({ data }) => {
          if (!data) return;
          const counts: Record<string, number> = {};
          for (const row of data as { event_key: string }[]) {
            counts[row.event_key] = (counts[row.event_key] ?? 0) + 1;
          }
          setPollCommentCounts(counts);
        });
    }

    const pollIds = (pollRows as any[]).map((p) => p.id);
    if (pollIds.length > 0) {
      const { data: voteRows } = await supabase
        .from("match_poll_votes")
        .select("poll_id, option_id, user_id")
        .in("poll_id", pollIds);

      if (voteRows) {
        setAllVotes(voteRows as { poll_id: string; option_id: string; user_id: string }[]);
        const counts: Record<string, number> = {};
        for (const v of voteRows as any[]) {
          counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
        }
        setVoteCounts(counts);

        const uid = (await supabase.auth.getSession()).data.session?.user.id;
        if (uid) {
          const myVotes: Record<string, string> = {};
          for (const v of voteRows as any[]) {
            if (v.user_id === uid) myVotes[v.poll_id] = v.option_id;
          }
          setUserVotes(myVotes);
        }
      }
    }

    setLoading(false);
  }, [gameId]);

  useEffect(() => { loadPolls(); }, [loadPolls]);

  // Keep parent badge count up to date
  useEffect(() => {
    if (!onUnansweredCount || loading) return;
    const count = polls.filter(p => isPollOpen(p, status, currentPeriod) && !userVotes[p.id]).length;
    onUnansweredCount(count);
  }, [polls, userVotes, status, currentPeriod, loading, onUnansweredCount]);

  // When the game goes FINAL, trigger server-side aura finalization for ALL voters.
  // The finalize endpoint is idempotent — aura_events unique constraint prevents double-awarding.
  const finalizeCalledRef = useRef(false);
  useEffect(() => {
    if (status !== "FINAL" || loading || polls.length === 0 || finalizeCalledRef.current) return;
    finalizeCalledRef.current = true;
    fetch(`/api/polls/finalize?game_id=${gameId}`, { cache: "no-store" }).catch(() => {});
  }, [status, loading, polls.length, gameId]);

  async function vote(pollId: string, optionId: string) {
    if (!userId) return;
    const existingVote = userVotes[pollId];
    // Allow changing vote before the game starts; block re-votes once live/final
    if (existingVote && status !== "UPCOMING") return;
    if (existingVote === optionId) return; // tapping the same option — no-op

    if (existingVote) {
      // Delete old vote then insert new one
      const { error } = await supabase.from("match_poll_votes").delete().eq("poll_id", pollId).eq("user_id", userId);
      if (error) {
        console.error("Failed to change poll vote", error);
        return;
      }
    }

    const { error } = await supabase.from("match_poll_votes").insert({ poll_id: pollId, option_id: optionId, user_id: userId });
    if (error) {
      console.error("Failed to submit poll vote", error);
      return;
    }

    setUserVotes((prev) => ({ ...prev, [pollId]: optionId }));
    setVoteCounts((prev) => {
      const next = { ...prev };
      if (existingVote) next[existingVote] = Math.max(0, (next[existingVote] ?? 0) - 1);
      next[optionId] = (next[optionId] ?? 0) + 1;
      return next;
    });
    setAllVotes((prev) => [
      ...prev.filter((v) => !(v.poll_id === pollId && v.user_id === userId)),
      { poll_id: pollId, option_id: optionId, user_id: userId },
    ]);
  }

  async function deletePoll(pollId: string) {
    await supabase.from("match_polls").delete().eq("id", pollId);
    await loadPolls();
  }

  return (
    <div style={{ padding: "16px 0" }}>
      {isAdmin && !creating && (
        <div style={{ display: "flex", gap: 8, margin: "0 16px 16px" }}>
          <button onClick={() => setCreating(true)} style={{ ...createPollBtnStyle, margin: 0, flex: 1 }}>
            + New Poll
          </button>
          <button
            onClick={autoCreatePoll}
            disabled={autoCreating !== "idle"}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 12,
              background: autoCreating === "done" ? "rgba(74,222,128,.15)" : "rgba(168,85,247,.15)",
              border: `1px solid ${autoCreating === "done" ? "rgba(74,222,128,.4)" : "rgba(168,85,247,.4)"}`,
              color: autoCreating === "done" ? "#4ade80" : "#c084fc",
              fontWeight: 800, fontSize: 14, cursor: autoCreating !== "idle" ? "default" : "pointer",
              opacity: autoCreating === "creating" ? 0.6 : 1, transition: "all 0.2s",
            }}
          >
            {autoCreating === "creating" ? "Creating…" : autoCreating === "done" ? "✓ Created!" : "⚡ Auto Poll"}
          </button>
        </div>
      )}

      {creating && (
        <CreatePollForm
          gameId={gameId}
          userId={userId!}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          currentQuarter={status !== "UPCOMING" && currentPeriod > 0 ? currentPeriod : null}
          onDone={() => { setCreating(false); loadPolls(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div style={{ width: 24, height: 24, border: "2px solid var(--border-2)", borderTop: "2px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : polls.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "var(--text-2)", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>No polls yet</div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>Check back soon!</div>
        </div>
      ) : (
        <>
          {status === "FINAL" && polls.length > 0 && (
            <div style={{ padding: "0 16px 4px" }}>
              <PollLeaderboard
                polls={polls}
                allVotes={allVotes}
                homeStats={homeStats}
                awayStats={awayStats}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
          {[...polls]
            .sort((a, b) => {
              // Active polls (open for current quarter) float to top
              const aActive = isPollOpen(a, status, currentPeriod);
              const bActive = isPollOpen(b, status, currentPeriod);
              if (aActive !== bActive) return aActive ? -1 : 1;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })
            .map(poll => {
              const open = isPollOpen(poll, status, currentPeriod);
              return (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  userVote={userVotes[poll.id]}
                  voteCounts={voteCounts}
                  showResults={showResults}
                  winner={showResults ? resolveWinner(poll, homeStats, awayStats, homeTeam, awayTeam) : null}
                  canVote={!!userId && open}
                  canChangeVote={!!userId && !!userVotes[poll.id] && status === "UPCOMING"}
                  votingLocked={!open}
                  isLivePoll={poll.quarter !== null}
                  onVote={optionId => vote(poll.id, optionId)}
                  onDelete={isAdmin ? () => deletePoll(poll.id) : undefined}
                  gameId={gameId}
                  userId={userId}
                  homeStats={homeStats}
                  awayStats={awayStats}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  commentCount={pollCommentCounts[`poll_${poll.id}`] ?? 0}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PollCard({
  poll,
  userVote,
  voteCounts,
  showResults,
  winner,
  canVote,
  canChangeVote,
  votingLocked,
  isLivePoll,
  onVote,
  onDelete,
  gameId,
  userId,
  homeStats,
  awayStats,
  homeTeam,
  awayTeam,
  commentCount,
}: {
  poll: Poll;
  userVote?: string;
  voteCounts: Record<string, number>;
  showResults: boolean;
  winner: string | null;
  canVote: boolean;
  canChangeVote?: boolean;
  votingLocked?: boolean;
  isLivePoll?: boolean;
  onVote: (optionId: string) => void;
  onDelete?: () => void;
  gameId: number;
  userId: string | null;
  homeStats: PlayerStat[];
  awayStats: PlayerStat[];
  homeTeam: string;
  awayTeam: string;
  commentCount?: number;
}) {
  const router = useRouter();
  const hasVoted = !!userVote;
  const totalVotes = poll.options.reduce((sum, o) => sum + (voteCounts[o.id] ?? 0), 0);
  const sorted = [...poll.options].sort((a, b) => a.position - b.position);
  const isPlayerAll = poll.poll_type === "player_all";
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [playerPickerSearch, setPlayerPickerSearch] = useState("");

  const optionColor = (label: string) => {
    const c = pollOptionColors(label, poll.poll_type);
    return String((c as any).background ?? "#6d28d9");
  };

  const cat = poll.category_key ? POLL_CATEGORIES[poll.category_key] : null;
  const showBar = showResults || hasVoted || votingLocked;
  const canAct = (canVote || canChangeVote) && !votingLocked;

  // Over/under player image
  const ouPlayerName = poll.poll_type === "over_under" ? (poll.question.split(" — ")[0] ?? "") : "";
  const ouInfo = ouPlayerName ? findPlayerInfo(ouPlayerName) : null;
  const ouTeam = ouInfo?.club ?? ouInfo?.team ?? "";
  const ouImg = ouPlayerName ? playerImagePath(ouPlayerName, ouTeam) : "";
  const ouColors = liveFeedTeamColors(ouTeam);

  function getImage(label: string): string {
    if (poll.poll_type === "team") return getLogo(label);
    const info = findPlayerInfo(label);
    const team = info?.club ?? info?.team ?? "";
    return playerImagePath(label, team);
  }

  function renderOption(opt: PollOption) {
    const count = voteCounts[opt.id] ?? 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const isMyVote = userVote === opt.id;
    const isWinner = showResults && pollOptionMatchesWinner(opt.label, winner);
    const wrong = showResults && isMyVote && winner !== null && !isWinner;
    const img = getImage(opt.label);
    const isTeam = poll.poll_type === "team";
    const isOu = poll.poll_type === "over_under";
    const ouIsOver = isOu && opt.label.toLowerCase().startsWith("over");

    const inner = (
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1, width: "100%" }}>
        {/* % pill (shown after voting) */}
        {showBar && (
          <div style={{ minWidth: 46, height: 32, borderRadius: 99, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: isMyVote ? "#22c55e" : "#fff", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
          </div>
        )}
        {/* Image */}
        {isOu ? (
          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: ouIsOver ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18 }}>{ouIsOver ? "↑" : "↓"}</span>
          </div>
        ) : isTeam ? (
          <img src={img} alt={opt.label} style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.08)" }}>
            <img src={img} alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}
        {/* Label */}
        <span style={{ fontSize: 15, fontWeight: 800, color: isMyVote ? "#22c55e" : "#fff", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isTeam ? getAbbr(opt.label) : opt.label}
          {isWinner && <span style={{ marginLeft: 8, fontSize: 13 }}>✓</span>}
        </span>
        {/* Check if selected and not showing bar */}
        {!showBar && isMyVote && (
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
      </div>
    );

    const style: React.CSSProperties = {
      position: "relative", overflow: "hidden",
      borderRadius: 14,
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${wrong ? "rgba(239,68,68,0.3)" : isMyVote && !showBar ? "rgba(59,130,246,0.5)" : "transparent"}`,
      padding: "12px 14px",
      width: "100%", textAlign: "left", display: "block",
      cursor: canAct ? "pointer" : "default",
    };

    const fill = showBar ? (
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: wrong ? "rgba(239,68,68,0.15)" : isMyVote ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.07)", transition: "width 0.6s ease", zIndex: 0 }} />
    ) : null;

    return canAct
      ? <button key={opt.id} type="button" onClick={() => onVote(opt.id)} style={style}>{fill}{inner}</button>
      : <div key={opt.id} style={style}>{fill}{inner}</div>;
  }

  return (
    <div style={pollCardStyle}>
      {/* Question */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {poll.poll_type === "over_under" && ouPlayerName && (
            <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${ouColors.primary}`, background: "rgba(255,255,255,0.06)" }}>
              {ouImg && <img src={ouImg} alt={ouPlayerName} loading="eager" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            </div>
          )}
          <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.3, letterSpacing: "-0.02em" }}>{poll.question}</span>
        </div>
        {onDelete && <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 16, cursor: "pointer", flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>}
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isPlayerAll && !hasVoted && !votingLocked && canVote ? (
          <>
            <button type="button" onClick={() => { setPlayerPickerOpen(true); setPlayerPickerSearch(""); }}
              style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left", width: "100%" }}>
              Pick a player
            </button>
            {playerPickerOpen && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
                onClick={() => setPlayerPickerOpen(false)}>
                <div style={{ width: "min(90vw, 420px)", height: "min(90vw, 420px)", background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid var(--border-1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{poll.question}</span>
                    <button type="button" onClick={() => setPlayerPickerOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 18, cursor: "pointer" }}>✕</button>
                  </div>
                  <div style={{ padding: "10px 12px 6px", flexShrink: 0 }}>
                    <input value={playerPickerSearch} onChange={e => setPlayerPickerSearch(e.target.value)} placeholder="Search players…" autoFocus
                      style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-1)", fontSize: 14, padding: "9px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px" }}>
                    {sorted.filter(o => !playerPickerSearch.trim() || o.label.toLowerCase().includes(playerPickerSearch.toLowerCase())).map(o => {
                      const info = findPlayerInfo(o.label);
                      const team = info?.club ?? info?.team ?? "";
                      const img = playerImagePath(o.label, team);
                      const colors = liveFeedTeamColors(team);
                      return (
                        <button key={o.id} type="button" onClick={() => { onVote(o.id); setPlayerPickerOpen(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                          <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${colors.primary}` }}>
                            {img && <img src={img} alt={o.label} loading="eager" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{o.label}</div>
                            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{team}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : isPlayerAll && (hasVoted || votingLocked) ? (
          sorted.filter(o => o.id === userVote || (voteCounts[o.id] ?? 0) > 0)
            .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
            .slice(0, 5).map(opt => renderOption(opt))
        ) : (
          sorted.map(opt => renderOption(opt))
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>
          {totalVotes.toLocaleString()} votes
          {(votingLocked || !canVote) && <span style={{ color: "rgba(255,255,255,0.2)" }}> · {isLivePoll ? `Q${poll.quarter} closed` : "Poll closed"}</span>}
          {isLivePoll && canVote && <span style={{ color: "#22c55e" }}> · Live Q{poll.quarter}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            const statsStr = cat ? (isPlayerAll && userVote
              ? sorted.filter(o => o.id === userVote)
              : sorted
            ).map(opt => {
              let val: number | string = "–";
              if (cat.type === "player") {
                const ps = [...homeStats, ...awayStats].find(p => ((p as any).name || (p as any).player || "").toLowerCase() === opt.label.toLowerCase());
                if (ps) val = cat.stat === "foopy" ? foopyRating(ps) : num(ps[cat.stat as keyof PlayerStat]);
              } else {
                const isHome = normaliseTeamKey(opt.label) === normaliseTeamKey(homeTeam);
                const isAway = normaliseTeamKey(opt.label) === normaliseTeamKey(awayTeam);
                if (isHome) val = homeStats.reduce((s, p) => s + num(p[cat.stat as keyof PlayerStat]), 0);
                else if (isAway) val = awayStats.reduce((s, p) => s + num(p[cat.stat as keyof PlayerStat]), 0);
              }
              return `${opt.label}:${val}`;
            }).join(",") : "";
            const params = new URLSearchParams({ label: poll.question, ...(cat ? { stat: cat.stat, pollType: poll.poll_type } : {}), ...(statsStr ? { stats: statsStr } : {}) });
            router.push(`/match/${gameId}/poll_${poll.id}?${params}`);
          }}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {(commentCount ?? 0) > 0 ? commentCount : "Comments"}
        </button>
      </div>
    </div>
  );
}

function CreatePollForm({
  gameId,
  userId,
  homeTeam,
  awayTeam,
  currentQuarter,
  onDone,
  onCancel,
}: {
  gameId: number;
  userId: string;
  homeTeam: string;
  awayTeam: string;
  currentQuarter: number | null; // null = pre-game
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Over/Under state
  const [ouMode, setOuMode] = useState(false);
  const [ouPlayer, setOuPlayer] = useState("");
  const [ouPlayerSearch, setOuPlayerSearch] = useState("");
  const [ouStat, setOuStat] = useState("disposals");
  const [ouValue, setOuValue] = useState("");
  const [ouPlayerPickerOpen, setOuPlayerPickerOpen] = useState(false);

  const OU_STATS = [
    { key: "disposals", label: "Disposals" },
    { key: "goals",     label: "Goals" },
    { key: "marks",     label: "Marks" },
    { key: "tackles",   label: "Tackles" },
    { key: "hitouts",   label: "Hitouts" },
    { key: "clearances",label: "Clearances" },
    { key: "kicks",     label: "Kicks" },
    { key: "handballs", label: "Handballs" },
  ];

  const selectedCat = selectedKey ? POLL_CATEGORIES[selectedKey] : null;

  const allPlayers = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const matches = (playerClub: string, teamName: string) => {
      const a = norm(playerClub), b = norm(teamName);
      return a === b || a.includes(b) || b.includes(a);
    };
    const match = (team: string) => (p: any) => {
      const club = String(p.club || p.team || "");
      return matches(club, team);
    };
    const home = (playerStatsJson as any[]).filter(match(homeTeam)).map(p => ({ name: String(p.name), team: homeTeam }));
    const away = (playerStatsJson as any[]).filter(match(awayTeam)).map(p => ({ name: String(p.name), team: awayTeam }));
    return [...home, ...away];
  }, [homeTeam, awayTeam]);

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return allPlayers;
    const q = playerSearch.toLowerCase();
    return allPlayers.filter(p => p.name.toLowerCase().includes(q));
  }, [allPlayers, playerSearch]);

  function togglePlayer(name: string) {
    setSelectedPlayers(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  const ouQuestion = ouPlayer && ouValue ? `${ouPlayer} — Over/Under ${ouValue} ${OU_STATS.find(s => s.key === ouStat)?.label ?? ouStat}` : "";
  const canSubmitOu = ouMode && !!ouPlayer && !!ouValue && Number(ouValue) > 0;

  const canSubmit = ouMode ? canSubmitOu : selectedKey && selectedCat && (
    selectedCat.type === "team" || selectedCat.type === "player_all" || selectedPlayers.length >= 2
  );

  const [submitError, setSubmitError] = useState("");

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");

    if (ouMode) {
      const { data: poll, error } = await supabase
        .from("match_polls")
        .insert({ game_id: gameId, user_id: userId, question: ouQuestion, poll_type: "over_under", category_key: null, quarter: currentQuarter })
        .select("id").single();
      if (error || !poll) { setSubmitError(error?.message ?? "Failed"); setSubmitting(false); return; }
      await supabase.from("match_poll_options").insert([
        { poll_id: (poll as any).id, label: `Over ${ouValue}`, position: 0 },
        { poll_id: (poll as any).id, label: `Under ${ouValue}`, position: 1 },
      ]);
      setSubmitting(false);
      onDone();
      return;
    }

    if (!selectedCat) return;
    const options = selectedCat.type === "team"
      ? [homeTeam, awayTeam]
      : selectedCat.type === "player_all"
        ? allPlayers.map(p => p.name)
        : selectedPlayers;

    const { data: poll, error } = await supabase
      .from("match_polls")
      .insert({ game_id: gameId, user_id: userId, question: selectedCat.label, poll_type: selectedCat.type, category_key: selectedKey, quarter: currentQuarter })
      .select("id")
      .single();

    if (error || !poll) {
      setSubmitError(error?.message ?? "Failed to create poll");
      setSubmitting(false);
      return;
    }

    const { error: optError } = await supabase.from("match_poll_options").insert(
      options.map((label, i) => ({ poll_id: (poll as any).id, label, position: i }))
    );

    if (optError) {
      setSubmitError(optError.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onDone();
  }

  const teamCats = Object.entries(POLL_CATEGORIES).filter(([, v]) => v.type === "team");
  const playerCats = Object.entries(POLL_CATEGORIES).filter(([, v]) => v.type === "player");
  const predictionCats = Object.entries(POLL_CATEGORIES).filter(([, v]) => v.type === "player_all");

  function selectCategory(key: string) { setSelectedKey(key); setSelectedPlayers([]); setOuMode(false); }

  return (
    <div style={createFormStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)" }}>Create Poll</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>

      {/* Category picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Teams</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {teamCats.map(([key, cat]) => (
            <button key={key} onClick={() => { setSelectedKey(key); setSelectedPlayers([]); }}
              style={{ padding: "10px 12px", borderRadius: 10, background: selectedKey === key ? "rgba(59,130,246,.18)" : "var(--border-1)", border: selectedKey === key ? "1px solid rgba(59,130,246,.5)" : "1px solid var(--border-2)", color: selectedKey === key ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: selectedKey === key ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
              {cat.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {playerCats.map(([key, cat]) => (
            <button key={key} onClick={() => { setSelectedKey(key); setSelectedPlayers([]); }}
              style={{ padding: "10px 12px", borderRadius: 10, background: selectedKey === key ? "rgba(59,130,246,.18)" : "var(--border-1)", border: selectedKey === key ? "1px solid rgba(59,130,246,.5)" : "1px solid var(--border-2)", color: selectedKey === key ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: selectedKey === key ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
              {cat.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Predictions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {predictionCats.map(([key, cat]) => (
            <button key={key} onClick={() => { setSelectedKey(key); setSelectedPlayers([]); setOuMode(false); }}
              style={{ padding: "10px 12px", borderRadius: 10, background: selectedKey === key ? "rgba(59,130,246,.18)" : "var(--border-1)", border: selectedKey === key ? "1px solid rgba(59,130,246,.5)" : "1px solid var(--border-2)", color: selectedKey === key ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: selectedKey === key ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
              {cat.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Over / Under</div>
        <button onClick={() => { setOuMode(true); setSelectedKey(null); }}
          style={{ padding: "10px 12px", borderRadius: 10, background: ouMode ? "rgba(59,130,246,.18)" : "var(--border-1)", border: ouMode ? "1px solid rgba(59,130,246,.5)" : "1px solid var(--border-2)", color: ouMode ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: ouMode ? 800 : 600, cursor: "pointer", textAlign: "left", width: "100%" }}>
          Custom Over/Under line
        </button>
      </div>

      {/* Over/Under builder */}
      {ouMode && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Player picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Player</div>
            <button onClick={() => { setOuPlayerPickerOpen(true); setOuPlayerSearch(""); }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: ouPlayer ? "rgba(59,130,246,.12)" : "var(--surface-3)", border: ouPlayer ? "1px solid rgba(59,130,246,.4)" : "1px solid var(--border-2)", color: ouPlayer ? "#93c5fd" : "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
              {ouPlayer || "Select a player…"}
            </button>
            {/* Player picker popup */}
            {ouPlayerPickerOpen && (
              <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
                onClick={() => setOuPlayerPickerOpen(false)}>
                <div style={{ width: "min(90vw, 420px)", height: "min(90vw, 420px)", background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid var(--border-1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>Select Player</span>
                    <button onClick={() => setOuPlayerPickerOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 18, cursor: "pointer" }}>✕</button>
                  </div>
                  <div style={{ padding: "10px 12px 6px", flexShrink: 0 }}>
                    <input value={ouPlayerSearch} onChange={e => setOuPlayerSearch(e.target.value)} placeholder="Search…" autoFocus
                      style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-1)", fontSize: 14, padding: "9px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px" }}>
                    {allPlayers.filter(p => !ouPlayerSearch.trim() || p.name.toLowerCase().includes(ouPlayerSearch.toLowerCase())).map(p => (
                      <button key={p.name} onClick={() => { setOuPlayer(p.name); setOuPlayerPickerOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 10, border: "none", background: ouPlayer === p.name ? "rgba(59,130,246,.18)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.06)" }}>
                          {playerImagePath(p.name, p.team) && <img src={playerImagePath(p.name, p.team)} alt="" loading="eager" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.team}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stat + value row */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stat</div>
              <select value={ouStat} onChange={e => setOuStat(e.target.value)}
                style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-1)", fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                {OU_STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Line</div>
              <input type="number" value={ouValue} onChange={e => setOuValue(e.target.value)} placeholder="e.g. 23.5" step="0.5" min="0"
                style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, color: "var(--text-1)", fontSize: 13, padding: "10px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Preview */}
          {ouQuestion && (
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", fontSize: 13, fontWeight: 700, color: "#93c5fd" }}>
              {ouQuestion}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.3)", color: "#4ade80", fontSize: 12, fontWeight: 800 }}>Over {ouValue}</div>
                <div style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 8, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#f87171", fontSize: 12, fontWeight: 800 }}>Under {ouValue}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Player picker (shown when a player category is selected) */}
      {selectedCat?.type === "player_all" && (
        <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          All {allPlayers.length} match players will be shown as options — voters pick who they think will do it.
        </div>
      )}
      {selectedCat?.type === "player" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pick players to include</div>
          {selectedPlayers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {selectedPlayers.map(name => (
                <button key={name} onClick={() => togglePlayer(name)}
                  style={{ padding: "5px 10px", borderRadius: 999, background: "#3b82f6", border: "none", color: "var(--text-1)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {name} ✕
                </button>
              ))}
            </div>
          )}
          <input
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, padding: "8px 12px", outline: "none", fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredPlayers.map(p => {
              const sel = selectedPlayers.includes(p.name);
              return (
                <button key={`${p.name}-${p.team}`} onClick={() => togglePlayer(p.name)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: sel ? "rgba(59,130,246,.2)" : "transparent", border: sel ? "1px solid rgba(59,130,246,.4)" : "1px solid transparent", color: sel ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: sel ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, minWidth: 32 }}>{getAbbr(p.team)}</span>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {submitError && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#f87171", fontSize: 12, fontWeight: 600 }}>
          {submitError}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit || submitting}
        style={{ width: "100%", padding: 12, borderRadius: 12, background: "#3b82f6", color: "var(--text-1)", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", opacity: (!canSubmit || submitting) ? 0.4 : 1 }}
      >
        {submitting ? "Creating…" : "Create Poll"}
      </button>
    </div>
  );
}

function pollOptionColors(label: string, pollType: string): React.CSSProperties {
  if (pollType === "over_under") {
    const isOver = label.toLowerCase().startsWith("over");
    return { background: isOver ? "#16a34a" : "#dc2626", borderColor: isOver ? "#16a34a" : "#dc2626" };
  }
  if (pollType === "team") {
    const c = liveFeedTeamColors(label);
    return { background: c.primary, borderColor: c.primary };
  }
  const info = findPlayerInfo(label);
  const team = info?.club ?? info?.team ?? "";
  if (!team) return {};
  const c = liveFeedTeamColors(team);
  return { background: c.primary, borderColor: c.primary };
}

function PollOptionInner({ label, pollType, winner = false }: { label: string; pollType: string; winner?: boolean; myVote?: boolean }) {
  if (pollType === "over_under") {
    const isOver = label.toLowerCase().startsWith("over");
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isOver ? "rgba(34,197,94,.18)" : "rgba(239,68,68,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 16 }}>{isOver ? "↑" : "↓"}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: isOver ? "#4ade80" : "#f87171", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {winner && <CorrectPollTick />}
      </div>
    );
  }
  if (pollType === "team") {
    const logo = getLogo(label);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <img src={logo} alt={label} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {winner && <CorrectPollTick />}
      </div>
    );
  }

  const info = findPlayerInfo(label);
  const team = info?.club ?? info?.team ?? "";
  const img = playerImagePath(label, team);
  const colors = liveFeedTeamColors(team);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${colors.primary}`, background: `${colors.primary}40` }}>
        {img && <img src={img} alt={label} loading="eager" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {winner && <CorrectPollTick />}
    </div>
  );
}

function CorrectPollTick() {
  return (
    <span
      aria-label="Correct answer"
      title="Correct answer"
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#22c55e",
        color: "var(--text-1)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Check size={13} strokeWidth={3} />
    </span>
  );
}

/* ================= STYLES ================= */

const createPollBtnStyle: CSSProperties = { display: "block", margin: "0 16px 16px", padding: "10px 16px", borderRadius: 12, background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.3)", color: "#60a5fa", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const pollCardStyle: CSSProperties = { background: "var(--surface-1)", border: "none", borderRadius: 16, padding: "14px 14px 12px" };
const pollQuestionStyle: CSSProperties = { fontSize: 18, fontWeight: 900, color: "var(--text-1)", lineHeight: 1.3, display: "block", letterSpacing: "-0.02em" };
const pollResultRowStyle: CSSProperties = { padding: "0" };
const pollOptionBtnStyle: CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1.5px solid var(--border-2)", color: "var(--text-1)", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", transition: "background 0.15s, border-color 0.15s" };
const createFormStyle: CSSProperties = { margin: "0 16px 16px", padding: "16px", borderRadius: 16, background: "var(--surface-1)", border: "none" };
const pollTypeToggleStyle: CSSProperties = { flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" };

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(90px + env(safe-area-inset-bottom))" };
const matchCentreStyle: CSSProperties = { width: "100%", maxWidth: 760, margin: "0 auto", background: "var(--surface-1)", minHeight: "100dvh", borderLeft: "1px solid var(--border-2)", borderRight: "1px solid var(--border-2)" };
// (scoreboard + tab styles now inline in JSX)
const sectionStyle: CSSProperties = { padding: "18px", borderBottom: "1px solid var(--border-2)" };
const sectionHeadingStyle: CSSProperties = { margin: "0 0 14px", textAlign: "center", fontSize: 18, fontWeight: 950 };
const feedCardStyle: CSSProperties = { padding: "16px 0", borderTop: "1px solid var(--border-2)" };
const feedTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#9ca3af", fontSize: 13, fontWeight: 800 };
const feedScoreStyle: CSSProperties = { display: "inline-flex", alignItems: "center" };
const tinyLogoStyle: CSSProperties = { width: 16, height: 16, objectFit: "contain", verticalAlign: "middle", margin: "0 5px" };
const miniLogoStyle: CSSProperties = { width: 14, height: 14, objectFit: "contain" };
const statsLoadingStyle: CSSProperties = { margin: "12px 0 0", color: "#facc15", fontSize: 13, fontWeight: 800 };
const liveStatsBadgeStyle: CSSProperties = { width: "fit-content", margin: "0 auto 14px", padding: "7px 12px", borderRadius: 999, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)", color: "#4ade80", fontSize: 12, fontWeight: 1000, letterSpacing: ".08em" };
const liveFeedListStyle: CSSProperties = { marginTop: 12, display: "flex", flexDirection: "column", gap: 14 };
const liveFeedBoxStyle: CSSProperties = { minHeight: 96, display: "grid", gridTemplateColumns: "68px minmax(0, 1fr)", alignItems: "center", gap: 14, background: "var(--bg)", borderRadius: 18, padding: "16px 16px 16px 14px", overflow: "hidden" };
const liveFeedInfoStyle: CSSProperties = { minWidth: 0 };
const liveFeedNameRowStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, minWidth: 0 };
const liveFeedNameStyle: CSSProperties = { color: "var(--text-1)", fontSize: 17, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "1 1 auto" };
const liveFeedActionStyle: CSSProperties = { fontSize: 24, lineHeight: 1, fontWeight: 900, letterSpacing: ".04em" };
const liveFeedScoreRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5 };
const liveFeedScoreTextStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" };
const liveFeedTimeBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(148,163,184,0.95)", lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
const liveFeedQuarterStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "rgba(148,163,184,0.95)", letterSpacing: "0.02em" };
const liveFeedTimeDotStyle: CSSProperties = { fontSize: 13, color: "rgba(148,163,184,0.95)", fontWeight: 900 };
const liveFeedMinuteStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "rgba(148,163,184,0.95)" };
const commentCountStyle: CSSProperties = { fontSize: 13, fontWeight: 850, color: "inherit", fontVariantNumeric: "tabular-nums" };
const eventReactionBarStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 13px 14px", minHeight: 44, overflow: "hidden" };
const eventReactionSummaryButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, height: 32, border: "none", background: "transparent", color: "rgba(148,163,184,0.95)", padding: 0, fontSize: 14, fontWeight: 850, cursor: "pointer", flexShrink: 0, lineHeight: 1 };
const eventReactionLeadStyle: CSSProperties = { display: "inline-flex", alignItems: "center", color: "rgba(226,232,240,0.95)" };
const eventReactionSummaryGlyphsStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5 };
const eventReactionSummaryEmptyStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(148,163,184,0.95)" };
const eventReactionSummaryCountStyle: CSSProperties = { color: "inherit", fontSize: 14, fontWeight: 850, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", lineHeight: 1 };
const eventReactionBarSpacerStyle: CSSProperties = { flex: "1 1 auto", minWidth: 10 };
const eventReactionCommentStyle: CSSProperties = { height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: "none", color: "rgba(148,163,184,0.9)", padding: "0 0 0 8px", fontSize: 13, fontWeight: 850, cursor: "pointer", flexShrink: 0 };
const eventReactionPopupBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0, overflow: "hidden" };
const eventReactionPopupPanelStyle: CSSProperties = { width: "min(620px, 100vw)", maxHeight: "86dvh", margin: "0 auto", display: "flex", flexDirection: "column", background: "rgba(10,12,16,0.8)", border: "1px solid rgba(148,163,184,0.16)", borderBottom: "none", borderRadius: "26px 26px 0 0", boxShadow: "0 -12px 60px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset", overflow: "hidden", backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)", paddingBottom: "env(safe-area-inset-bottom)" };
const eventReactionPopupOptionActiveStyle: CSSProperties = { background: "rgba(255,255,255,0.12)", color: "var(--text-1)", borderColor: "rgba(255,255,255,0.45)", boxShadow: "0 0 0 1px rgba(255,255,255,0.1) inset" };
const eventReactionTopRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 10px", overflowX: "auto", WebkitOverflowScrolling: "touch", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const eventReactionTopChipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "var(--text-1)", cursor: "pointer", flexShrink: 0 };
const eventReactionTopChipActiveStyle: CSSProperties = { background: "rgba(56,189,248,0.2)", borderColor: "rgba(56,189,248,0.6)" };
const eventReactionTopChipCountStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "rgba(226,232,240,0.92)", fontVariantNumeric: "tabular-nums", lineHeight: 1 };
const eventReactionEmojiSectionLabelStyle: CSSProperties = { color: "rgba(203,213,225,0.6)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 16px 6px" };
const eventReactionEmojiBodyStyle: CSSProperties = { flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "0 10px 10px" };
const eventReactionEmojiGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))", gap: 2 };
const eventReactionEmojiButtonStyle: CSSProperties = { aspectRatio: "1 / 1", minHeight: 42, borderRadius: 12, border: "1px solid transparent", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", minWidth: 0 };
const eventReactionEmojiGlyphStyle: CSSProperties = { fontSize: 27, lineHeight: 1 };
const eventReactionEmojiLoadingStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" };
const eventReactionEmojiEmptyStyle: CSSProperties = { textAlign: "center", padding: "44px 20px", color: "rgba(148,163,184,0.8)", fontSize: 13, fontWeight: 700 };
const eventReactionCatBarStyle: CSSProperties = { flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.25)", overflowX: "auto", WebkitOverflowScrolling: "touch" };
const eventReactionCatTabStyle: CSSProperties = { minWidth: 42, height: 38, borderRadius: 999, border: "1px solid transparent", background: "transparent", color: "var(--text-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px", cursor: "pointer", flexShrink: 0, opacity: 0.6, transition: "opacity 0.15s ease, background 0.15s ease" };
const eventReactionCatTabActiveStyle: CSSProperties = { opacity: 1, background: "rgba(255,255,255,0.1)" };
const eventReactionSheetHandleStyle: CSSProperties = { width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.22)", margin: "8px auto 2px" };
const eventReactionBurstLayerStyle: CSSProperties = { position: "absolute", left: "50%", top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 5 };
const eventReactionBurstEmojiStyle: CSSProperties = { position: "absolute", left: 0, bottom: 0, fontSize: 22, lineHeight: 1, willChange: "transform, opacity" };
const playerBubbleStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-3)", fontSize: 11, fontWeight: 700 };
const playerAvatarWrapStyle: CSSProperties = {
  width: 48,
  height: 48,
  position: "relative",
  borderRadius: "50%",
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0
};
const playerAvatarImageStyle: CSSProperties = { objectFit: "cover", objectPosition: "center top" };
const playerInitialsStyle: CSSProperties = { color: "var(--text-1)", fontSize: 15, fontWeight: 900 };
const emptyFeedStyle: CSSProperties = { marginTop: 12, background: "var(--surface-2)", border: "none", borderRadius: 14, padding: "20px 16px", color: "var(--text-3)", fontSize: 14, fontWeight: 600, textAlign: "center" };
const countdownBoxStyle: CSSProperties = {
  margin: "18px 0 8px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};
const countdownLabelStyle: CSSProperties = { color: "#facc15", fontSize: 11, fontWeight: 1000, letterSpacing: ".16em" };
const countdownTimeStyle: CSSProperties = { marginTop: 8, color: "var(--text-1)", fontSize: 36, lineHeight: 1, fontWeight: 1000, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" };
const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0 };
const statsTableShellStyle: CSSProperties = { position: "relative", background: "var(--surface-1)" };
const statsStickyHeaderStyle: CSSProperties = {
  position: "sticky",
  zIndex: 60,
  height: 36,
  background: "rgba(9,10,14,0.96)",
  borderTop: "1px solid var(--border-2)",
  borderBottom: "1px solid var(--border-2)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.36)",
  backdropFilter: "blur(18px) saturate(160%)",
  WebkitBackdropFilter: "blur(18px) saturate(160%)",
  touchAction: "pan-y",
  userSelect: "none",
};
const statsHeaderViewportStyle: CSSProperties = { position: "relative", height: "100%", overflow: "hidden" };
const statsHeaderFrozenStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  zIndex: 2,
  display: "flex",
  background: "rgba(9,10,14,0.98)",
};
const statsHeaderScrollerStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  height: "100%",
  display: "grid",
  willChange: "transform",
};
const statsHeaderCellStyle: CSSProperties = {
  appearance: "none",
  border: "none",
  borderRight: "1px solid rgba(255,255,255,0.035)",
  borderRadius: 0,
  height: 36,
  minWidth: 0,
  padding: "0 6px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  background: "transparent",
  fontFamily: "inherit",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
const statsHeaderArrowStyle: CSSProperties = { fontSize: 10, lineHeight: 1, color: "inherit" };
const thStyle: CSSProperties = { position: "sticky", top: 0, zIndex: 2, backgroundColor: "var(--bg)", textAlign: "center", padding: "9px 10px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap", fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-3)" };
const thPlayerStyle: CSSProperties = {
  ...thStyle,
  left: 0,
  zIndex: 5,
  minWidth: 180,
  textAlign: "left",
};
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: "1px solid var(--border-1)", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "center" };
const tdPlayerStyle: CSSProperties = {
  ...tdStyle,
  position: "sticky",
  left: 0,
  zIndex: 3,
  // Match the match-centre container (matchCentreStyle = --surface-1) so the
  // opaque sticky column blends with the transparent stat rows beside it,
  // rather than showing the darker page --bg.
  backgroundColor: "var(--surface-1)",
  fontWeight: 800,
  fontSize: 14,
  color: "var(--text-1)",
  minWidth: 180,
  textAlign: "left",
};
// ── Compact stats-table body cells (match StatTable) ─────────────────────────
// Tighter than the shared td/th so more stat columns fit on a phone.
const statCellStyle: CSSProperties = { ...tdStyle, padding: "12px 3px", fontSize: 13 };
const tdAvatarStyle: CSSProperties = {
  ...tdStyle, position: "sticky", left: 0, zIndex: 4, backgroundColor: "var(--surface-1)",
  padding: "8px 0", textAlign: "center",
};
// Surname column — stays beside the avatar while the stats move underneath.
// NB: the <td> stays a real table-cell (no display:flex — that would break
// table-layout:fixed column sizing); the flex lives on an inner wrapper.
const tdNameStyle: CSSProperties = {
  ...tdStyle,
  position: "sticky",
  left: AVATAR_COL_W,
  zIndex: 3,
  backgroundColor: "var(--surface-1)",
  textAlign: "left",
  padding: "8px 4px 8px 2px",
  fontWeight: 800,
  fontSize: 13,
  color: "var(--text-1)",
  overflow: "hidden",
};
const tdNameInnerStyle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 2, minWidth: 0, maxWidth: "100%", lineHeight: 1.1 };
// Comment count, styled like the speech-bubble icon on feed event cards
// (lucide MessageCircle, muted color, no filled badge) — sits beside the
// foopy rating instead of overlaid on the avatar.
const statNameCommentStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, minHeight: 12, color: "rgba(148,163,184,0.9)", fontSize: 9.5, fontWeight: 800 };
// Foopy rating badge shown next to the surname.
const statNameRatingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 14, padding: "0 3px", borderRadius: 4, border: "1px solid var(--bg)", color: "var(--text-1)", fontWeight: 900, fontSize: 9, lineHeight: 1.4 };
// "Edit stat columns" button + its bottom-sheet editor.
const editStatColsBtnStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text-2)", fontSize: 13.5, fontWeight: 800, cursor: "pointer", WebkitTapHighlightColor: "transparent" };
const statEditorBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 20000, background: "rgba(0,0,0,0.68)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 10px", boxSizing: "border-box", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" };
const statEditorPanelStyle: CSSProperties = { width: "min(560px, 100%)", maxHeight: "calc(86dvh - env(safe-area-inset-top))", display: "flex", flexDirection: "column", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderBottom: "none", borderRadius: "22px 22px 0 0", padding: "0 16px calc(16px + env(safe-area-inset-bottom))", boxSizing: "border-box", boxShadow: "0 -10px 50px rgba(0,0,0,0.65)", animation: "rb-up 0.26s cubic-bezier(0.22,1,0.36,1)" };
const statEditorHandleStyle: CSSProperties = { width: 38, height: 4, borderRadius: 999, background: "var(--border-3)", margin: "10px auto 4px" };
const statEditorTitleRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px 2px" };
const statEditorDoneStyle: CSSProperties = { appearance: "none", border: "none", background: "none", color: "#0ea5e9", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: "4px 2px" };
const statEditorHintStyle: CSSProperties = { margin: "0 0 10px", fontSize: 12.5, color: "var(--text-3)", fontWeight: 500, lineHeight: 1.5 };
const statEditorListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", overscrollBehavior: "contain", paddingBottom: 6 };
const statEditorRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 15, WebkitTapHighlightColor: "transparent" };
const statEditorRowOnStyle: CSSProperties = { background: "var(--surface-3)", border: "1px solid var(--border-2)" };
const statEditorBadgeStyle: CSSProperties = { minWidth: 38, textAlign: "center", padding: "4px 7px", borderRadius: 8, background: "var(--surface-4)", color: "var(--text-3)", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em", flexShrink: 0 };
const playerNameCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 14, width: "100%", minWidth: 0, overflow: "hidden" };
const playerInfoStyle: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 auto", overflow: "hidden" };
const playerNameTextStyle: CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" };
const ratingPillStyle: CSSProperties = { display: "inline-block", minWidth: 40, padding: "3px 7px", borderRadius: 7, color: "var(--text-1)", fontWeight: 900, fontSize: 12, border: "1.5px solid rgba(0,0,0,0.3)", textAlign: "center" };
const statSwitchWrapStyle: CSSProperties = { display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 };
const statSwitchStyle: CSSProperties = { appearance: "none", border: "1px solid var(--border-2)", background: "var(--surface-2)", color: "var(--text-2)", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", letterSpacing: "0.01em" };
const activeStatSwitchStyle: CSSProperties = { ...statSwitchStyle, background: "#3b82f6", color: "var(--text-1)", border: "1px solid #3b82f6" };
const noStatsStyle: CSSProperties = { background: "var(--surface-2)", border: "none", borderRadius: 14, padding: "20px 16px", color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600, textAlign: "center" };
const mutedStyle: CSSProperties = { color: "#9ca3af" };
const emptyStyle: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: 24 };
const loadingTitleStyle: CSSProperties = { margin: "0 0 8px" };
const qbDividerRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%" };
const qbLineStyle: CSSProperties = { flex: 1, height: 1 };
const qbPillStyle: CSSProperties = { display: "flex", alignItems: "center", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap", flexShrink: 0 };
const gameHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const gameTeamStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const gameTeamStyleRight: CSSProperties = { display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" };
const gameLogoStyle: CSSProperties = { width: 40, height: 40, objectFit: "contain", borderRadius: "50%", padding: "3px" };
const compareListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const compareRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const compareTopStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", alignItems: "center" };
const compareValueStyle: CSSProperties = { fontWeight: 1000 };
const compareValueRightStyle: CSSProperties = { fontWeight: 1000, textAlign: "right" };
const compareLabelStyle: CSSProperties = { color: "#9ca3af", textAlign: "center", fontSize: 13, fontWeight: 900 };
const barShellStyle: CSSProperties = { display: "flex", height: 9, overflow: "hidden", borderRadius: 999, background: "var(--surface-2)" };
const barLeftStyle: CSSProperties = { height: "100%" };
const barRightStyle: CSSProperties = { height: "100%" };
const freeKickBoxStyle: CSSProperties = { marginTop: 22, background: "var(--surface-1)", border: "none", borderRadius: 16, padding: 16 };
const freeKickTitleStyle: CSSProperties = { textAlign: "center", color: "#9ca3af", fontWeight: 1000, marginBottom: 12 };
const freeKickMainStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const freeKickTeamStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const freeKickTeamRightStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" };
const freeKickLogoStyle: CSSProperties = { width: 36, height: 36, objectFit: "contain", borderRadius: "50%", padding: "3px" };
const freeKickAbbrStyle: CSSProperties = { color: "#9ca3af", fontWeight: 900 };
const freeKickNumberStyle: CSSProperties = { fontSize: 22, fontWeight: 1000 };
const freeKickMiddleStyle: CSSProperties = { color: "var(--text-3)", fontWeight: 1000 };
const freeKickBarShellStyle: CSSProperties = { display: "flex", height: 9, overflow: "hidden", borderRadius: 999, marginTop: 14, background: "var(--surface-2)" };
const freeKickBarLeftStyle: CSSProperties = { height: "100%" };
const freeKickBarRightStyle: CSSProperties = { height: "100%" };
const freeKickMessageStyle: CSSProperties = { marginTop: 12, textAlign: "center", color: "#facc15", fontWeight: 900 };

export default function MatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "var(--bg)" }} />}>
      <MatchPageInner />
    </Suspense>
  );
}
