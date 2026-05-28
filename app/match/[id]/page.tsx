"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import matchStatsJson from "@/app/data/game-stats.json";
import teamStatsJson from "@/app/data/team-stats.json";
import playerStatsJson from "@/app/data/players.json";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import WinnerPick from "./components/WinnerPick";
import { teamColors } from "./utils";
import { supabase } from "@/app/lib/supabase";
import { createNotification, notifyMentions } from "@/app/lib/notifications";
import MentionTextarea from "@/app/components/MentionTextarea";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";

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

function safePlayerName(value: any, fallbackId?: any) {
  const name = safeText(value, "");
  if (name) return name;
  const fallbackText = safeText(fallbackId, "");
  return fallbackText ? `Player ${fallbackText}` : "Unknown";
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

function commentCountForEvent(counts: Record<string, number>, event: LiveEvent, index = 0) {
  return eventKeyAliases(event, index).reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function commentKeyForEvent(counts: Record<string, number>, event: LiveEvent, index = 0) {
  const aliases = eventKeyAliases(event, index);
  return aliases.find((key) => (counts[key] ?? 0) > 0) ?? aliases[0];
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
  return `/players/${folder}/${image}`;
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

function getSortValue(player: PlayerStat, key: SortKey) {
  if (key === "foopy") {
    const savedFoopy = num(player.foopy);
    return savedFoopy > 0 ? savedFoopy : foopyRating(player);
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
  const name = safePlayerName(mapped?.name ?? player?.name ?? player?.player, possibleId);

  return {
    player: name,
    name,
    team: safeText(mapped?.club ?? mapped?.team ?? player?.team ?? team, ""),
    foopy: raw.foopy ?? player?.foopy ?? 0,
    goals: raw.goals?.total ?? raw.goals ?? player?.goals?.total ?? player?.goals ?? 0,
goalAssists: raw.goals?.assists ?? raw.goalAssists ?? player?.goals?.assists ?? player?.goalAssists ?? 0,
behinds: raw.behinds ?? player?.behinds ?? 0,
    disposals: raw.disposals ?? player?.disposals ?? 0,
    kicks: raw.kicks ?? player?.kicks ?? 0,
    handballs: raw.handballs ?? player?.handballs ?? 0,
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

  const name = safePlayerName(
    mapped?.name ||
      player?.player?.name ||
      player?.name ||
      (player?.player?.firstname && player?.player?.lastname
        ? `${player.player.firstname} ${player.player.lastname}`
        : ""),
    apiPlayerId
  );

  return normalizeSavedPlayer(
    {
      name,
      player: name,
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

function formatDate(date?: string) {
  if (!date) return "Date TBA";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function mixColor(a: string, b: string, amount: number) {
  const c1 = parseInt(a.slice(1), 16);
  const c2 = parseInt(b.slice(1), 16);
  const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * amount);
  const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * amount);
  const bl = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * amount);
  return `rgb(${r}, ${g}, ${bl})`;
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

function toTeamSlug(name: string): string {
  const overrides: Record<string, string> = {
    "Greater Western Sydney": "gws", "GWS Giants": "gws",
    "Brisbane": "brisbanelions", "Geelong Cats": "geelong",
  };
  return overrides[name] ?? name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function TeamScore({ team, score, goals, behinds, align = "left" }: { team: any; score: any; goals?: number; behinds?: number; align?: "left" | "right" }) {
  const safeTeam = safeText(team, "");
  const displayScore = typeof score === "string" ? score : scoreText(score);
  const isRecordScore = typeof displayScore === "string" && displayScore.includes("-");
  const accent = teamColor(safeTeam);
  const prevScore = useRef<any>(score);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const prev = prevScore.current;
    prevScore.current = score;
    if (prev !== undefined && prev !== score) {
      // Bump the key to restart the animation even if it fires twice quickly
      setAnimKey(k => k + 1);
    }
  }, [score]);

  const showGB = !isRecordScore && goals != null && behinds != null;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
      width: "100%",
    }}>
      {/* Logo */}
      <Link href={`/team/${toTeamSlug(safeTeam)}`} style={{ textDecoration: "none", flexShrink: 0 }}>
        <div style={{
          width: "clamp(82px, 17vw, 116px)", height: "clamp(82px, 17vw, 116px)",
          borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          boxShadow: `0 22px 48px ${accent}30, 0 4px 22px rgba(0,0,0,.45)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img
            src={getLogo(safeTeam)}
            alt={safeTeam}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      </Link>
      {/* Score */}
      <div
        key={animKey}
        style={{
          fontSize: isRecordScore ? "clamp(42px, 8.6vw, 72px)" : "clamp(48px, 11vw, 78px)", fontWeight: 1000, color: "var(--text-1)",
          letterSpacing: 0, lineHeight: 0.88,
          textShadow: `0 16px 36px ${accent}40, 0 2px 12px rgba(0,0,0,.55)`,
          animation: animKey > 0 ? "score-pop 0.55s cubic-bezier(0.22,1,0.36,1) forwards" : undefined,
          display: "inline-block",
          fontVariantNumeric: "tabular-nums",
          transformOrigin: "center",
          whiteSpace: "nowrap",
        }}
      >
        {displayScore}
      </div>
      {/* G.B */}
      {showGB && (
        <div style={{
          fontSize: "clamp(11px, 2.6vw, 14px)", fontWeight: 700,
          color: "rgba(255,255,255,.38)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: ".02em",
          marginTop: -6,
        }}>
          {goals}.{behinds}
        </div>
      )}
      {/* Name */}
      <div style={{
        fontSize: "clamp(13px, 3.2vw, 18px)", fontWeight: 900, color: "#f4f4f5",
        textAlign: "center",
        lineHeight: 1.2,
        maxWidth: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textShadow: "0 2px 14px rgba(0,0,0,.65)",
      }}>
        {safeTeam}
      </div>
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

function roundStripStatus(game: MatchGame, now = Date.now()) {
  const status = getStatus(game);
  if (status === "FINAL") return "Final";
  if (status === "LIVE") return "Live";
  return timeUntilStart(game.date, now);
}

function miniScoreText(game: MatchGame) {
  if (getStatus(game) === "UPCOMING") return "vs";
  return `${scoreText(game.hscore)}-${scoreText(game.ascore)}`;
}

function RoundGameStrip({ games, activeId, now }: { games: MatchGame[]; activeId: string; now: number }) {
  return (
    <div style={roundStripShellStyle}>
      {/* Back to home — always visible, non-scrolling */}
      <Link
        href="/"
        aria-label="Back to Scores"
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          color: "var(--text-1)",
          textDecoration: "none",
        }}
      >
        <ChevronLeft size={28} strokeWidth={2.4} />
      </Link>

      {/* Scrollable game pills */}
      {games.length > 1 && (
        <div className="no-scrollbar" style={roundStripScrollStyle}>
          {games.map((game) => {
            const active = String(game.id) === activeId;
            const status = getStatus(game);
            const live = status === "LIVE";

            return (
              <Link
                key={String(game.id)}
                href={`/match/${game.id}`}
                style={{
                  ...roundMiniBoxStyle,
                  borderColor: active ? "#3b82f6" : live ? "rgba(34,197,94,.55)" : "var(--border-2)",
                  background: active ? "var(--surface-3)" : "var(--surface-1)",
                }}
              >
                <div style={{ ...roundMiniStatusStyle, color: live ? "#22c55e" : "#d1d5db" }}>{roundStripStatus(game, now)}</div>
                <div style={roundMiniScoreStyle}>
                  <img src={getLogo(game.hteam)} alt="" style={roundMiniLogoStyle} />
                  <span>{miniScoreText(game)}</span>
                  <img src={getLogo(game.ateam)} alt="" style={roundMiniLogoStyle} />
                </div>
                <div style={roundMiniTeamsStyle}>
                  {getAbbr(game.hteam)} v {getAbbr(game.ateam)}
                </div>
                {active && <div style={roundMiniActiveLineStyle} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ name, team, size = 48 }: { name: any; team?: any; size?: number }) {
  const safeName = safePlayerName(name, "");
  const safeTeam = safeText(team, "");
  const [failed, setFailed] = useState(false);
  const src = playerImagePath(safeName, safeTeam);
  const colours = teamColors(safeTeam || playerClub(safeName));
  const bg = colours.primary;
  const border = colours.secondary;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      style={{
        ...playerAvatarWrapStyle,
        width: size,
        height: size,
        background: `${bg}80`,
      }}
    >
      {!failed && src ? (
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
  homeTeam,
  awayTeam,
  commentCount,
  topComment,
  playerFP,
  onCommentClick,
}: {
  event: LiveEvent;
  homeTeam: any;
  awayTeam: any;
  eventKey?: string;
  commentCount?: number;
  topComment?: { body: string; username: string; avatar: string | null };
  playerFP?: number | null;
  onCommentClick?: () => void;
}) {
  const isInferred = Boolean((event as any).optimistic) || Boolean((event as any).inferred);
  const inferredTeam = safeText((event as any).teamName, "");
  const apiEventTeam = teamNameFromEvent(event);
  const eventTeam = safeText(inferredTeam || apiEventTeam, "");
  const player = findPlayerForLiveEvent(event, safeText(homeTeam, ""), safeText(awayTeam, ""));
  const team = safeText(eventTeam || player?.club || player?.team, "");
  const playerName = isInferred ? team : safePlayerName(player?.name || event.playerName, event.playerId || team);
  const colours = liveFeedTeamColors(team);

  const type = safeText(event.type, "event").toUpperCase();

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
      <div style={{
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
          padding: type === "BEHIND" ? "8px 14px 8px 12px" : liveFeedBoxStyle.padding,
        }}>
          {isInferred ? <TeamEventAvatar team={team} /> : <PlayerAvatar name={playerName} team={team} />}

          <div style={liveFeedInfoStyle}>
            <div style={liveFeedNameStyle}>{playerName}</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ ...liveFeedActionStyle, color: type === "GOAL" ? "#22c55e" : type === "BEHIND" ? "#f8fafc" : "#facc15", fontSize: type === "BEHIND" ? 15 : liveFeedActionStyle.fontSize }}>
                {type}
              </div>
              {playerFP != null && !isInferred && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500, marginLeft: 10, lineHeight: 1 }}>
                  {playerFP} FP
                </span>
              )}
            </div>
          </div>

          <div style={liveFeedRightStyle}>
            <div style={liveFeedTimeBadgeStyle}>
              <span style={liveFeedQuarterStyle}>{eventQuarter(event)}</span>
              <span style={liveFeedTimeDotStyle}>·</span>
              <span style={liveFeedMinuteStyle}>{event.minute ?? "-"}'</span>
            </div>

            {!topComment && (
              <button onClick={onCommentClick} style={commentBubbleBtnStyle}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {(commentCount ?? 0) > 0 && <span style={commentCountStyle}>{commentCount}</span>}
              </button>
            )}
          </div>
        </div>

        {/* Top comment preview — inside the dark box, below the event row */}
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
            <button onClick={onCommentClick} style={commentBubbleBtnStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {(commentCount ?? 0) > 0 && <span style={commentCountStyle}>{commentCount}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
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

function StatTable({ stats, isLive, isFinal, team, gameId, bestRating }: { stats: PlayerStat[]; isLive?: boolean; isFinal?: boolean; team: string; gameId: number; bestRating: number }) {
  const [sortKey, setSortKey] = useState<SortKey>("foopy");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [statMode, setStatMode] = useState<StatMode>("basic");
  const [playerCommentCounts, setPlayerCommentCounts] = useState<Record<string, number>>({});
  const router = useRouter();

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
      const diff = getSortValue(b, sortKey) - getSortValue(a, sortKey);
      return sortDir === "desc" ? diff : -diff;
    });
  }, [stats, sortKey, sortDir]);

  function sortHeader(label: string, key: SortKey) {
    const active = sortKey === key;

    return (
      <th
        style={{ ...thStyle, color: active ? "#0ea5e9" : "#9ca3af", cursor: "pointer" }}
        onClick={() => {
          if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
          else {
            setSortKey(key);
            setSortDir("desc");
          }
        }}
      >
        {label}
        {active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  if (!stats.length) {
    return (
      <div style={noStatsStyle}>
        <strong>No player stats available yet.</strong>
        <span>Stats will appear here once the game has been played.</span>
      </div>
    );
  }

  return (
    <div>
      {isLive && <div style={liveStatsBadgeStyle}>LIVE PLAYER STATS</div>}

      <div style={statSwitchWrapStyle}>
        <button onClick={() => setStatMode("basic")} style={statMode === "basic" ? activeStatSwitchStyle : statSwitchStyle}>
          Basic
        </button>
        <button onClick={() => setStatMode("advanced")} style={statMode === "advanced" ? activeStatSwitchStyle : statSwitchStyle}>
          Advanced
        </button>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thPlayerStyle}>Player</th>
              {statMode === "basic" ? (
                <>
                  {sortHeader("Foopy", "foopy")}
                  {sortHeader("G.B", "goals")}
                  {sortHeader("D", "disposals")}
                  {sortHeader("K", "kicks")}
                  {sortHeader("H", "handballs")}
                  {sortHeader("M", "marks")}
                  {sortHeader("T", "tackles")}
                  {sortHeader("HO", "hitouts")}
                </>
              ) : (
                <>
  {sortHeader("FP", "fantasy")}
  {sortHeader("CLR", "clearances")}
  {sortHeader("GA", "goalAssists")}
  {sortHeader("FF", "freesFor")}
  {sortHeader("FA", "freesAgainst")}
</>
              )}
              <th style={thStyle} />
            </tr>
          </thead>

          <tbody>
            {sortedStats.map((p, index) => {
              const name = safePlayerName(p.name ?? p.player, index + 1);
              const knownPlayer = findPlayerInfo(name);
              const rowTeam = safeText(knownPlayer?.club ?? knownPlayer?.team ?? p.team ?? team, "");
              const rating = foopyRating(p);
              const playerKey = `player_${slugName(name)}`;
              const count = playerCommentCounts[playerKey] ?? 0;
              const gb = `${statValue(p.goals)}.${statValue(p.behinds)}`;

              const playerParams = new URLSearchParams({
                label: name,
                team: rowTeam,
                rating: String(rating),
                gb,
                d: String(statValue(p.disposals)),
                k: String(statValue(p.kicks)),
                h: String(statValue(p.handballs)),
                m: String(statValue(p.marks)),
                t: String(statValue(p.tackles)),
                ho: String(statValue(p.hitouts)),
              });

              return (
                <tr
                  key={`${name}-${index}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/match/${gameId}/${encodeURIComponent(playerKey)}?${playerParams}`)}
                >
                  <td style={tdPlayerStyle}>
                    <span style={playerNameCellStyle}>
                      <PlayerAvatar name={name} team={rowTeam} />
                      <span>{name}</span>
                    </span>
                  </td>

                  {statMode === "basic" ? (
                    <>
                      <td style={tdStyle}>
                        {rating > 0 && (() => {
                          const isBest = isFinal && bestRating > 0 && rating === bestRating;
                          return (
                            <span style={{ ...ratingPillStyle, background: foopyColor(rating), ...(isBest ? { display: "inline-flex", alignItems: "center", gap: 3 } : {}) }}>
                              {isBest && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}>
                                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                                </svg>
                              )}
                              {rating}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={tdStyle}>{statValue(p.goals)}.{statValue(p.behinds)}</td>
                      <td style={tdStyle}>{statValue(p.disposals)}</td>
                      <td style={tdStyle}>{statValue(p.kicks)}</td>
                      <td style={tdStyle}>{statValue(p.handballs)}</td>
                      <td style={tdStyle}>{statValue(p.marks)}</td>
                      <td style={tdStyle}>{statValue(p.tackles)}</td>
                      <td style={tdStyle}>{statValue(p.hitouts)}</td>
                    </>
                  ) : (
                    <>
  <td style={tdStyle}>{fantasyPoints(p)}</td>
  <td style={tdStyle}>{statValue(p.clearances)}</td>
  <td style={tdStyle}>{statValue((p as any).goalAssists ?? 0)}</td>
  <td style={tdStyle}>{statValue(p.freesFor)}</td>
  <td style={tdStyle}>{statValue(p.freesAgainst)}</td>
</>
                  )}
                  <td style={{ ...tdStyle, paddingRight: 12 }}>
                    <span style={playerBubbleStyle}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {count > 0 && <span>{count}</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const logoSize = compact ? 30 : 48;
  const scoreWidth = compact ? 78 : 92;
  const scoreHeight = compact ? 30 : 34;
  const scorePadding = compact ? "0 8px" : "0 10px";
  const scoreFontSize = compact ? 12 : 14;
  const rowGap = compact ? 5 : 8;
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
      border: "1px solid rgba(255,255,255,0.10)",
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

type PreviewPlayerLeader = {
  team: string;
  name: string;
  foopyTotal: number;
  goalsTotal: number;
  games: number;
  playerId?: string;
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
      if (rating <= 0 && goals <= 0) continue;

      const known = findPlayerInfo(name, team);
      const key = known?.id ?? `${canonicalTeamKey(team)}-${slugName(name)}`;
      const existing = totals.get(key) ?? {
        team,
        name: known?.name ?? name,
        playerId: known?.id,
        foopyTotal: 0,
        goalsTotal: 0,
        games: 0,
      };

      existing.foopyTotal += rating;
      existing.goalsTotal += goals;
      existing.games += 1;
      totals.set(key, existing);
    }
  }

  return [...totals.values()];
}

function previewPlayerLeaders(homeTeam: string, awayTeam: string, allGames: MatchGame[], currentGame: MatchGame) {
  const leadersFor = (team: string) => {
    const leaders = playerSeasonTotalsForTeam(team, allGames, currentGame);
    return {
      topPlayer: [...leaders].sort((a, b) => b.foopyTotal - a.foopyTotal || b.goalsTotal - a.goalsTotal || b.games - a.games)[0] ?? null,
      topScorer: [...leaders].sort((a, b) => b.goalsTotal - a.goalsTotal || b.foopyTotal - a.foopyTotal || b.games - a.games)[0] ?? null,
    };
  };

  const home = leadersFor(homeTeam);
  const away = leadersFor(awayTeam);

  return {
    topPlayers: [home.topPlayer, away.topPlayer].filter((player): player is PreviewPlayerLeader => Boolean(player)),
    topScorers: [home.topScorer, away.topScorer].filter((player): player is PreviewPlayerLeader => Boolean(player)),
  };
}

function foopyBadgeColor(value: number) {
  if (value >= 5) return "#22c55e";
  if (value >= 4) return "#d9e313";
  return "#ef4444";
}

function PreviewLeaderRow({ player }: { player: PreviewPlayerLeader }) {
  const averageFoopy = player.games ? player.foopyTotal / player.games : 0;
  const foopyBadgeBg = foopyBadgeColor(averageFoopy);
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
      minHeight: 232,
      height: "100%",
      borderRadius: 15,
      overflow: "hidden",
      background: `linear-gradient(180deg, ${colours.primary}35 0%, rgba(9,11,15,0.96) 55%, rgba(4,5,7,1) 100%)`,
      border: "1px solid rgba(255,255,255,0.13)",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 ${accentColour}70`,
      boxSizing: "border-box",
    }}>
      <img
        src={getLogo(player.team)}
        alt=""
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 3,
          width: 26,
          height: 26,
          borderRadius: "50%",
          objectFit: "cover",
          padding: 2,
          background: "rgba(0,0,0,0.30)",
          border: "1px solid rgba(255,255,255,0.12)",
          opacity: 0.95,
        }}
      />
      <div style={{
        position: "relative",
        height: 156,
        margin: "4px 0 0",
        overflow: "hidden",
      }}>
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
              filter: "drop-shadow(0 14px 16px rgba(0,0,0,0.48))",
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--text-1)",
            fontSize: 28,
            fontWeight: 950,
          }}>
            {getInitials(player.name)}
          </div>
        )}
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 92,
          background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0.98) 100%)",
        }} />
      </div>
      <div style={{
        position: "relative",
        zIndex: 2,
        marginTop: -4,
        padding: "0 12px 12px",
        minWidth: 0,
      }}>
        <div style={{ fontSize: 14, fontWeight: 1000, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.05 }}>
          {player.name}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
          marginTop: 10,
          padding: "10px 0 0",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 42,
              height: 28,
              padding: "0 9px",
              borderRadius: 7,
              background: foopyBadgeBg,
              color: "#fff",
              fontSize: 14,
              fontWeight: 1000,
              fontVariantNumeric: "tabular-nums",
            }}>
              {averageFoopy.toFixed(1)}
            </span>
            <span style={{ display: "block", marginTop: 4, fontSize: 9, fontWeight: 950, color: softAccent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Foopy
            </span>
          </div>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <strong style={{ display: "block", fontSize: 25, fontWeight: 1000, color: "var(--text-1)", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {player.goalsTotal}
            </strong>
            <span style={{ display: "block", marginTop: 4, fontSize: 9, fontWeight: 950, color: softAccent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Goals
            </span>
          </div>
        </div>
      </div>
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
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 1000, color: "var(--text-1)", marginBottom: 4 }}>
        <span style={{ width: 3, height: 15, borderRadius: 999, background: metric === "foopy" ? "#60a5fa" : "#facc15" }} />
        {title}
      </div>
      {players.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
          {players.map((player) => (
            <PreviewLeaderRow key={`${metric}-${player.playerId ?? player.name}-${player.team}`} player={player} />
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

function PlayerLeaderboardsBox({ homeTeam, awayTeam, allGames, currentGame }: {
  homeTeam: string; awayTeam: string; allGames: MatchGame[]; currentGame: MatchGame;
}) {
  const { topPlayers, topScorers } = useMemo(
    () => previewPlayerLeaders(homeTeam, awayTeam, allGames, currentGame),
    [homeTeam, awayTeam, allGames, currentGame]
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

function LadderPositionsBox({ homeTeam, awayTeam, allGames }: { homeTeam: string; awayTeam: string; allGames: MatchGame[] }) {
  const ladder = useMemo(() => buildLadder(allGames), [allGames]);
  const rows = ladder.filter(t => flexMatchTeam(t.team, homeTeam) || flexMatchTeam(t.team, awayTeam));
  const compact = useCompactViewport();
  if (rows.length === 0) return null;

  const statCell: React.CSSProperties = {
    width: 68, textAlign: "right", fontSize: 15, fontWeight: 700,
    fontVariantNumeric: "tabular-nums", color: "var(--text-1)", flexShrink: 0,
  };

  return (
    <Link href="/ladder" prefetch={false} style={{ textDecoration: "none", display: "block", margin: "0 0 14px", borderRadius: 18,
      background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      border: "1px solid rgba(255,255,255,0.10)",
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
        {(["P", "W-L-D", "PTS", "%"] as const).map(h => (
          <div key={h} style={{ width: 68, textAlign: "right", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", flexShrink: 0 }}>{h}</div>
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
            <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "var(--text-1)", paddingLeft: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {teamLabel}
            </div>
            <div style={statCell}>{t.played}</div>
            <div style={statCell}>{wdl}</div>
            <div style={{ ...statCell, fontWeight: 900 }}>{t.points}</div>
            <div style={statCell}>{pct}</div>
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
      border: "1px solid var(--border-2)",
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


export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    (searchParams?.get("tab") as TabKey) ?? "feed"
  );
  const [unansweredPollCount, setUnansweredPollCount] = useState(0);
  const [game, setGame] = useState<MatchGame | null>(null);
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
  const seenEventKeys = useRef(new Set<string>());
  const initialFeedLoaded = useRef(false);
  const lastScoreRef = useRef<{ home: number; away: number } | null>(null);
  const [freshEventKeys, setFreshEventKeys] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [allGames, setAllGames] = useState<MatchGame[]>([]);
  const [roundGames, setRoundGames] = useState<MatchGame[]>([]);
  const [scoreboardPassed, setScoreboardPassed] = useState(false);
  const scoreboardRef = useRef<HTMLDivElement>(null);
  /** Prevents re-fetching final stats on every 5-second game-poll tick */
  const finalStatsFetchedRef = useRef(false);

  const [liveViewerCount, setLiveViewerCount] = useState(0);

  const apiSportsGameId = useMemo(() => {
    const mapped = (API_SPORTS_MATCH_IDS as Record<string, any>)[id];
    return String(mapped || getApiSportsGameId(savedMatch, id));
  }, [savedMatch, id]);

  useEffect(() => {
    if (!apiSportsGameId) return;

    const savedTeamStats =
      (teamStatsJson as Record<string, any>)[String(apiSportsGameId)] ??
      (teamStatsJson as Record<string, any>)[String(id)] ??
      null;

    setTeamStats(savedTeamStats?.teams ?? []);
  }, [apiSportsGameId, id]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = scoreboardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setScoreboardPassed(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
          setLoading(true);
          setError("");
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

  // Detect score changes client-side and send the specific event to the server
  // score-check (inferred events) disabled — real API Sports events only
  useEffect(() => {
    if (!game) return;
    const hscore = Number(game.hscore ?? 0);
    const ascore = Number(game.ascore ?? 0);
    lastScoreRef.current = { home: hscore, away: ascore };
  }, [game?.hscore, game?.ascore]);

  const displayLiveEvents = useMemo(() => liveEvents, [liveEvents]);

  // Count unanswered open polls — always runs so tab badge is visible before entering the tab
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function fetchCount() {
      const currentStatus = game ? getStatus(game) : "UPCOMING";

      // Winner pick poll (stored in localStorage)
      const winnerPickVoted = !!localStorage.getItem(`winner-pick-${id}`);
      const winnerPickUnanswered = currentStatus === "UPCOMING" && !winnerPickVoted ? 1 : 0;

      const { data: pollRows } = await supabase
        .from("match_polls")
        .select("id, quarter")
        .eq("game_id", Number(id));
      if (cancelled) return;
      if (!pollRows?.length) { setUnansweredPollCount(winnerPickUnanswered); return; }

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
      if (!cancelled) setUnansweredPollCount(winnerPickUnanswered + open.filter((p: any) => !votedPollIds.has(p.id)).length);
    }
    fetchCount();
    return () => { cancelled = true; };
  }, [id, game, currentPeriod]);

  // Detect newly-added feed events and animate them — skip the first batch on page load
  useEffect(() => {
    if (displayLiveEvents.length === 0) return;

    if (!initialFeedLoaded.current) {
      // First load: seed the seen set silently so nothing animates on reload
      displayLiveEvents.forEach((event, index) => {
        const ek = scoreEventKey(event, index);
        seenEventKeys.current.add(ek);
      });
      initialFeedLoaded.current = true;
      return;
    }

    // Subsequent polls: only animate genuinely new events
    const fresh = new Set<string>();
    displayLiveEvents.forEach((event, index) => {
      const ek = scoreEventKey(event, index);
      if (!seenEventKeys.current.has(ek)) {
        fresh.add(ek);
        seenEventKeys.current.add(ek);
      }
    });
    if (fresh.size > 0) {
      setFreshEventKeys(fresh);
      const t = setTimeout(() => setFreshEventKeys(new Set()), 800);
      return () => clearTimeout(t);
    }
  }, [displayLiveEvents]);


  useEffect(() => {
    if (!showStatsTabs && activeTab !== "feed" && activeTab !== "chat" && activeTab !== "polls") setActiveTab("feed");
  }, [showStatsTabs, activeTab]);

  useEffect(() => {
    if (!mounted || !game || !apiSportsGameId) return;

    const status = getStatus(game);

    // ── Game is FINAL: fetch once with ?final=true so the server permanently
    //    caches the result. Re-use those stats instead of clearing to blank. ──
    if (status === "FINAL") {
      if (finalStatsFetchedRef.current) return; // already fetched this session
      finalStatsFetchedRef.current = true;

      fetch(`/api/afl/player-stats?id=${apiSportsGameId}&final=true`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const apiMatch = data?.response?.[0];
          if (!apiMatch?.teams?.length) return;

          const homeApiTeamId = getApiTeamId(game.hteam);
          const awayApiTeamId = getApiTeamId(game.ateam);

          const homeTeamBlock = getPlayerTeamBlock(apiMatch.teams, homeApiTeamId, game.hteam, 0);
          const awayTeamBlock = getPlayerTeamBlock(apiMatch.teams, awayApiTeamId, game.ateam, 1, homeTeamBlock);

          const home = (homeTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.hteam));
          const away = (awayTeamBlock?.players || []).map((p: any) => normalizeApiSportsPlayer(p, game.ateam));
          const split = mergeStatsByKnownTeam(game.hteam, game.ateam, home, away);

          setLiveHomeStats(split.home.length ? split.home : home);
          setLiveAwayStats(split.away.length ? split.away : away);
        })
        .catch(() => {}); // silently fall back to static JSON / empty

      return;
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

        const res = await fetch(`/api/afl/player-stats?id=${apiSportsGameId}`, { cache: "no-store" });
        if (!res.ok) throw new Error();

        const data = await res.json();
        const apiMatch = data?.response?.[0];

        if (!apiMatch?.teams?.length) throw new Error();

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
        if (!cancelled) setLiveStatsError("Could not load live player stats.");
      }
    }

    loadLivePlayerStats();
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadLivePlayerStats();
    }, 30_000);

    const handleVisibility = () => {
      if (!document.hidden) loadLivePlayerStats();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mounted, game, apiSportsGameId]);

  /** Process raw rows from Supabase into display-ready LiveEvents */
  const processSupabaseEvents = useCallback((rows: any[]) => {
    if (!game) return;

    function periodLabel(p: number) {
      return p === 1 ? "1/4 TIME" : p === 2 ? "HALF TIME" : p === 3 ? "3/4 TIME" : p === 4 ? "FULL TIME" : `Q${p} TIME`;
    }

    // For scoring events, prefer the real (non-inferred) event when both exist at the same score.
    // Sort real events first so they win the dedup check.
    const sortedRows = [...rows].sort((a, b) => {
      if (a.inferred === b.inferred) return 0;
      return a.inferred ? 1 : -1;
    });

    const seen = new Set<string>();
    const scoreKey = new Set<string>(); // (team_id|type|home_score|away_score) exact-score dedup
    const realCountByPeriod = new Map<string, number>(); // real event count per (team_id|type|period)
    const inferredSeenByPeriod = new Map<string, number>(); // inferred events processed per key

    const normalised = sortedRows
      .filter((e: any) => {
        const k = `${e.period}|${e.minute}|${e.type}|${e.team_id}|${e.player_id}|${e.home_score}|${e.away_score}`;
        if (seen.has(k)) return false;
        seen.add(k);

        const isScoring = e.type === "GOAL" || e.type === "BEHIND";
        if (!isScoring) return true;

        if (!e.inferred) {
          // Real event: register for score-based and count-based dedup
          if (e.home_score != null && e.away_score != null) {
            scoreKey.add(`${e.team_id}|${e.type}|${e.home_score}|${e.away_score}`);
          }
          const pk = `${e.team_id}|${e.type}|${e.period}`;
          realCountByPeriod.set(pk, (realCountByPeriod.get(pk) ?? 0) + 1);
          return true;
        }

        // Inferred event: drop if a real event covers it
        if (e.home_score != null && e.away_score != null) {
          if (scoreKey.has(`${e.team_id}|${e.type}|${e.home_score}|${e.away_score}`)) return false;
        }

        // Count-based fallback: if real events >= inferred events seen so far for same (team|type|period), drop
        const pk = `${e.team_id}|${e.type}|${e.period}`;
        const realCount = realCountByPeriod.get(pk) ?? 0;
        const inferredSoFar = (inferredSeenByPeriod.get(pk) ?? 0) + 1;
        inferredSeenByPeriod.set(pk, inferredSoFar);
        if (inferredSoFar <= realCount) return false;

        return true;
      })
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
        inferred: e.inferred ?? false,
        playerFP: e.player_fp ?? null,
      }));

    const chronological = [...normalised].sort((a, b) => {
      if (Number(a.period) !== Number(b.period)) return Number(a.period) - Number(b.period);
      return Number(a.minute ?? 0) - Number(b.minute ?? 0);
    });

    let prevHome = 0, prevAway = 0;
    const inferred = chronological.map((e: any) => {
      const curHome = e.homeScore == null ? prevHome : Number(e.homeScore);
      const curAway = e.awayScore == null ? prevAway : Number(e.awayScore);
      const homeDelta = curHome - prevHome;
      const awayDelta = curAway - prevAway;
      let teamName = "";
      if (homeDelta > awayDelta && homeDelta > 0) teamName = game.hteam;
      else if (awayDelta > homeDelta && awayDelta > 0) teamName = game.ateam;
      else teamName = teamNameFromEvent(e);
      prevHome = curHome; prevAway = curAway;
      return { ...e, teamName };
    }).filter((e: any) => eventBelongsToMatch(e, game.hteam, game.ateam));

    const derivedBreaks: any[] = [];
    for (let i = 1; i < chronological.length; i++) {
      const prev = Number(chronological[i - 1].period ?? 0);
      const curr = Number(chronological[i].period ?? 0);
      if (curr > prev && prev > 0) {
        const lastOfPrev = [...inferred].reverse().find((event: any) => Number(event.period ?? 0) === prev);
        derivedBreaks.push({
          type: "QUARTER_BREAK", quarter: `Q${prev}`, period: prev, minute: 999,
          label: periodLabel(prev),
          homeScore: lastOfPrev.homeScore ?? 0, awayScore: lastOfPrev.awayScore ?? 0,
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
      const ofPeriod = inferred.filter(e => Number(e.period ?? 0) === breakPeriod);
      const last = ofPeriod[ofPeriod.length - 1];
      derivedBreaks.push({
        type: "QUARTER_BREAK", quarter: `Q${breakPeriod}`, period: breakPeriod, minute: 999,
        label: periodLabel(breakPeriod),
        homeScore: last?.homeScore ?? game?.hscore ?? 0,
        awayScore: last?.awayScore ?? game?.ascore ?? 0,
      });
    }

    const sorted = [...inferred, ...derivedBreaks].sort((a, b) => {
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

    // ── 2. Trigger a sync from external API → Supabase ──────────────────────
    async function triggerSync() {
      try {
        await fetch(`/api/afl/sync-events?id=${apiSportsGameId}`, { cache: "no-store" });
      } catch {}
    }

    loadFromSupabase();
    triggerSync().then(() => {
      if (!cancelled) loadFromSupabase();
    });

    // Re-sync and reload every 10s while visible. Realtime can miss delete/replace cycles, so the poll is the reliability layer.
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
        () => {
          // A new event landed — reload from Supabase so processing has full context
          if (!cancelled) loadFromSupabase();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [mounted, apiSportsGameId, game, processSupabaseEvents]);

  // Track live viewers via Supabase Realtime Presence
  // Also persists this user in match_viewers so completed-game totals are accurate.
  useEffect(() => {
    if (!id) return;
    const presenceChannel = supabase.channel(`match-viewers-${id}`, {
      config: { presence: { key: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setLiveViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ joined_at: Date.now() });
          // Persist this viewer so the total count survives after the game ends
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase
                .from("match_viewers")
                .upsert(
                  { game_id: Number(id), user_id: user.id },
                  { onConflict: "game_id,user_id" }
                );
            }
          } catch {}
        }
      });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [id]);

  // Award +10 aura once per live game viewed
  useEffect(() => {
    if (!id || !mounted) return;
    // Fire when Squiggle marks LIVE, OR when the game is clearly in progress
    // (currentPeriod > 0 means timestr shows a quarter/half) but complete=0 hasn't updated yet
    const isGameLive = status === "LIVE" || (status !== "FINAL" && currentPeriod > 0);
    if (!isGameLive) { console.log("[aura] skipped — status:", status, "period:", currentPeriod); return; }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { console.log("[aura] skipped — no session"); return; }
      console.log("[aura] calling award for live_game_view, matchId:", id);
      const res = await fetch("/api/aura/award", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ event_type: "live_game_view", related_id: String(id) }),
      });
      const data = await res.json();
      console.log("[aura] response:", res.status, data);
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

  // Height of the fixed strip: safe-area + 10px padding + 62px pills + 10px padding
  const stripSpacer = <div style={{ height: "calc(env(safe-area-inset-top) + 82px)" }} />;

  if (!mounted || loading) {
    return (
      <main style={pageStyle} className="page-enter">
        <RoundGameStrip games={roundGames} activeId={id} now={now} />
        {stripSpacer}
        <section style={emptyStyle}>
          <h1 style={loadingTitleStyle}>Loading match...</h1>
          <p style={mutedStyle}>Getting scores and saved player stats.</p>
        </section>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main style={pageStyle} className="page-enter">
        <RoundGameStrip games={roundGames} activeId={id} now={now} />
        {stripSpacer}
        <section style={emptyStyle}>
          <h1>Match not found</h1>
          <p style={mutedStyle}>{error || `No game found for ID: ${id}`}</p>
        </section>
      </main>
    );
  }

  const homeAbbr = getAbbr(game.hteam);
  const awayAbbr = getAbbr(game.ateam);

  // Use live/final API stats when available; fall back to static JSON for older games
  const useLiveStats = (isLiveGame || status === "FINAL") && liveHomeStats.length > 0;
  const displayHomeStats = useLiveStats ? liveHomeStats : homeStats;
  const displayAwayStats = useLiveStats ? liveAwayStats : awayStats;

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

  return (
    <main style={pageStyle} className="page-enter">
      <RoundGameStrip games={roundGames} activeId={id} now={now} />
      <section style={matchCentreStyle}>
        {stripSpacer}

        {/* ── Scoreboard ── */}
        <div ref={scoreboardRef} style={{
          position: "relative", overflow: "hidden",
          padding: "24px 24px 26px",
          minHeight: 292,
          borderBottom: "1px solid var(--border-1)",
          background: "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 58%, var(--bg) 100%)",
        }}>
          {/* Team colour glow blobs */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse 48% 72% at 18% 56%, ${teamColor(game.hteam ?? "")}26 0%, transparent 70%),
                         radial-gradient(ellipse 48% 72% at 82% 56%, ${teamColor(game.ateam ?? "")}26 0%, transparent 70%),
                         radial-gradient(ellipse 70% 36% at 50% -4%, var(--border-1), transparent 70%)`,
          }} />
          <div style={{
            position: "absolute",
            inset: "auto 18% 0",
            height: 1,
            background: "linear-gradient(90deg, transparent, var(--border-2), transparent)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 52 }}>
            <Link
              href="/"
              aria-label="Foopy home"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 11,
                color: "var(--text-1)",
                fontSize: "clamp(28px, 6vw, 40px)",
                fontFamily: "\"Borsok\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
                fontWeight: 400,
                letterSpacing: 0,
                lineHeight: 1,
              }}
            >
              <span style={{
                width: "clamp(30px, 6vw, 42px)",
                height: "clamp(30px, 6vw, 42px)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <img
                  src="/footy-icon.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </span>
              <span>foopy</span>
            </Link>
          </div>


          {/* Scores row */}
          <div style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(82px, 180px) minmax(0, 1fr)",
            alignItems: "center",
            gap: 16,
          }}>
            <TeamScore
              team={game.hteam}
              score={homeScoreDisplay}
              goals={status !== "UPCOMING" ? displayHomeStats.reduce((s, p) => s + num(p.goals), 0) : undefined}
              behinds={status !== "UPCOMING" ? displayHomeStats.reduce((s, p) => s + num(p.behinds), 0) : undefined}
              align="left"
            />

            {/* Centre */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 0, alignSelf: "end", paddingBottom: 19 }}>
              {/* Status badge */}
              {status === "LIVE" ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 18px", borderRadius: 999,
                  background: "#16a34a",
                  border: "1px solid #16a34a",
                  boxShadow: "0 14px 36px rgba(0,0,0,.24)",
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: "var(--text-1)",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.22)",
                    animation: "livePulse 1.8s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", letterSpacing: 0 }}>Live</span>
                  {(game.timestr || getLiveGameClock(liveEvents)) && (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>·</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{formatTimestr(game.timestr) || getLiveGameClock(liveEvents)}</span>
                    </>
                  )}
                </div>
              ) : status === "UPCOMING" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>Starts in</span>
                  <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{getCountdownText(game.date, now)}</span>
                </div>
              ) : (
                <div style={{
                  fontSize: 17, fontWeight: 800, letterSpacing: 0,
                  padding: "8px 28px", borderRadius: 999,
                  background: statusBadgeTone.bg,
                  border: `1px solid ${statusBadgeTone.border}`,
                  color: statusBadgeTone.color,
                  boxShadow: "0 14px 36px rgba(0,0,0,.24)",
                }}>
                  {statusBadgeTone.label}
                </div>
              )}

              {status !== "UPCOMING" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{Math.max(1, liveViewerCount)}</span>
                </div>
              )}

            </div>

            <TeamScore
              team={game.ateam}
              score={awayScoreDisplay}
              goals={status !== "UPCOMING" ? displayAwayStats.reduce((s, p) => s + num(p.goals), 0) : undefined}
              behinds={status !== "UPCOMING" ? displayAwayStats.reduce((s, p) => s + num(p.behinds), 0) : undefined}
              align="right"
            />
          </div>

          {/* Venue + round row — only for upcoming games */}
          {status === "UPCOMING" && (
            <div style={{
              position: "relative",
              marginTop: 26,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--surface-3)",
                border: "1px solid var(--border-3)",
                borderRadius: 9, padding: "7px 13px",
                maxWidth: "100%",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 0 0-8-8z"/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Round {game.round ?? "-"} · {game.venue || "Venue TBA"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#52525b", whiteSpace: "nowrap" }}>
                  · {formatDate(game.date)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Compact sticky scoreboard (appears when main scoreboard scrolls off) ── */}
        <div style={{
          position: "fixed",
          top: 0,
          left: "50%",
          transform: scoreboardPassed ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-110%)",
          width: "min(760px, 100%)",
          zIndex: 50,
          background: "rgba(30,30,40,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-2)",
          paddingTop: "env(safe-area-inset-top)",
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: scoreboardPassed ? "auto" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 8px 8px 4px", gap: 8 }}>
            {/* Back */}
            <button
              onClick={() => router.back()}
              style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-1)", flexShrink: 0, padding: 0 }}
            >
              <ChevronLeft size={28} strokeWidth={2.4} />
            </button>

            {/* Scores */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {/* Home */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 20, fontWeight: 1000, color: "var(--text-1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {typeof homeScoreDisplay === "string" ? homeScoreDisplay : scoreText(homeScoreDisplay)}
                </span>
                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: `${teamColor(game.hteam ?? "")}22`, border: "1px solid var(--border-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={getLogo(game.hteam)} alt={game.hteam ?? ""} style={{ width: "88%", height: "88%", objectFit: "contain" }} />
                </div>
              </div>

              {/* Status badge */}
              {status === "LIVE" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, background: "#166534", border: "1px solid #4ade80", flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,.25)", animation: "livePulse 1.8s ease-in-out infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#4ade80" }}>Live</span>
                  {(game.timestr || getLiveGameClock(liveEvents)) && (
                    <>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(74,222,128,0.5)" }}>·</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#4ade80" }}>{formatTimestr(game.timestr) || getLiveGameClock(liveEvents)}</span>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ padding: "5px 10px", borderRadius: 999, background: statusBadgeTone.bg, border: `1px solid ${statusBadgeTone.border}`, color: statusBadgeTone.color, fontSize: 12, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {statusBadgeTone.label}
                </div>
              )}

              {/* Away */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: `${teamColor(game.ateam ?? "")}22`, border: "1px solid var(--border-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={getLogo(game.ateam)} alt={game.ateam ?? ""} style={{ width: "88%", height: "88%", objectFit: "contain" }} />
                </div>
                <span style={{ fontSize: 20, fontWeight: 1000, color: "var(--text-1)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {typeof awayScoreDisplay === "string" ? awayScoreDisplay : scoreText(awayScoreDisplay)}
                </span>
              </div>
            </div>

            {/* Spacer to balance back button */}
            <div style={{ width: 36, flexShrink: 0 }} />
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          position: "sticky", top: scoreboardPassed ? 52 : 0, zIndex: 10,
          background: "rgba(30,30,40,0.97)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border-2)",
        }}>
          <nav style={{ display: "flex", width: "100%" }}>
            {(["feed","chat","polls"] as const).map(t => (
              <button key={t} type="button" onClick={() => setActiveTab(t)} style={{
                flex: 1, padding: "13px 4px 11px",
                background: "none", border: "none",
                borderBottom: activeTab === t ? "2px solid #fff" : "2px solid transparent",
                color: activeTab === t ? "#fff" : "#64748b",
                fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
                cursor: "pointer", whiteSpace: "nowrap",
                textTransform: "capitalize",
                transition: "color 0.12s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                {t === "feed" && status === "UPCOMING" ? "Preview" : t.charAt(0).toUpperCase() + t.slice(1)}
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
            {showStatsTabs && (
              <>
                {(["game","home","away"] as const).map((t) => {
                  const label = t === "game" ? "Stats" : t === "home" ? homeAbbr : awayAbbr;
                  return (
                    <button key={t} type="button" onClick={() => setActiveTab(t)} style={{
                      flex: 1, padding: "13px 4px 11px",
                      background: "none", border: "none",
                      borderBottom: activeTab === t ? "2px solid #fff" : "2px solid transparent",
                      color: activeTab === t ? "#fff" : "#3a3a3a",
                      fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
                      cursor: "pointer", whiteSpace: "nowrap",
                      transition: "color 0.12s",
                    }}>
                      {label}
                    </button>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        {activeTab === "feed" && (
          <section style={sectionStyle}>
            {/* Active in-game polls pinned at top of feed */}
            {isLiveGame && currentPeriod > 0 && (
              <FeedActivePolls
                gameId={Number(id)}
                currentPeriod={currentPeriod}
                onOpenPolls={() => setActiveTab("polls")}
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

            {!feedLoading && !feedError && displayLiveEvents.length === 0 && status !== "UPCOMING" && (
              <div style={emptyFeedStyle}>
                <strong>No live feed events available yet.</strong>
              </div>
            )}

            {displayLiveEvents.length > 0 && (
              <div style={liveFeedListStyle}>
                {displayLiveEvents.map((event, index) => {
                  const ek = scoreEventKey(event, index);
                  const commentKey = commentKeyForEvent(eventCommentCounts, event, index);
                  const isFresh = freshEventKeys.has(ek);
                  // Use the FP snapshot stored at event time; fall back to current live FP if not yet stored
                  const eventPlayerFP: number | null = (() => {
                    if ((event as any).playerFP != null) return (event as any).playerFP as number;
                    const eventPlayer = findPlayerForLiveEvent(event, safeText(game.hteam, ""), safeText(game.ateam, ""));
                    if (!eventPlayer) return null;
                    const stat = [...displayHomeStats, ...displayAwayStats].find(p =>
                      ((p as any).name || (p as any).player || "").toLowerCase() === (eventPlayer.name || "").toLowerCase()
                    );
                    return stat ? fantasyPoints(stat) : null;
                  })();

                  return (
                    <div
                      key={ek}
                      style={isFresh ? {
                        animation: "feed-event-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards, feed-event-glow 0.8s ease-out forwards",
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
                          homeTeam={game.hteam}
                          awayTeam={game.ateam}
                          eventKey={commentKey}
                          commentCount={commentCountForEvent(eventCommentCounts, event, index)}
                          topComment={eventTopComments[commentKey]}
                          playerFP={eventPlayerFP}
                          onCommentClick={() => {
                            const inferredTeam = safeText((event as any).teamName, "");
                            const apiTeam = teamNameFromEvent(event);
                            const eventTeam = safeText(inferredTeam || apiTeam, "");
                            const player = findPlayerForLiveEvent(event, safeText(game.hteam, ""), safeText(game.ateam, ""));
                            const team = safeText(eventTeam || player?.club || player?.team, "");
                            const name = ((event as any).optimistic || (event as any).inferred)
                              ? team || "Team"
                              : safePlayerName(player?.name || event.playerName, event.playerId || index + 1);
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
              </div>
            )}
          </section>
        )}

        {activeTab === "game" && (
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>Game Stats</h2>

            <ScoreWorm
              events={liveEvents}
              homeTeamId={getApiTeamId(game.hteam)}
              awayTeamId={getApiTeamId(game.ateam)}
              homeColor={teamColor(game.hteam, "primary")}
              awayColor={teamColor(game.ateam, "primary")}
              homeAbbr={homeAbbr}
              awayAbbr={awayAbbr}
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
                ["Free Kicks", "disposals", "free_kicks"],
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
                      <div style={{ ...barLeftStyle, width: `${homePct}%`, background: teamColor(game.hteam, "home") }} />
                      <div style={{ ...barRightStyle, width: `${awayPct}%`, background: teamColor(game.ateam, "away") }} />
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
                <div style={{ ...freeKickBarLeftStyle, width: `${homeFreePct}%`, background: teamColor(game.hteam, "home") }} />
                <div style={{ ...freeKickBarRightStyle, width: `${awayFreePct}%`, background: teamColor(game.ateam, "away") }} />
              </div>

              <div style={freeKickMessageStyle}>{umpireText}</div>
            </div>
          </section>
        )}

        {(() => {
          const allMatchPlayers = [...displayHomeStats, ...displayAwayStats];
          const bestRating = allMatchPlayers.reduce((best, p) => Math.max(best, foopyRating(p)), 0);
          return (
            <>
              {activeTab === "home" && (
                <section style={sectionStyle}>
                  <h2 style={sectionHeadingStyle}>{homeAbbr} Player Stats</h2>
                  <StatTable stats={displayHomeStats} isLive={isLiveGame} isFinal={status === "FINAL"} team={game.hteam} gameId={Number(id)} bestRating={bestRating} />
                </section>
              )}

              {activeTab === "away" && (
                <section style={sectionStyle}>
                  <h2 style={sectionHeadingStyle}>{awayAbbr} Player Stats</h2>
                  <StatTable stats={displayAwayStats} isLive={isLiveGame} isFinal={status === "FINAL"} team={game.ateam} gameId={Number(id)} bestRating={bestRating} />
                </section>
              )}
            </>
          );
        })()}

        {activeTab === "chat" && (
          <section style={{ ...sectionStyle, padding: 0 }}>
            <MatchComments gameId={Number(id)} highlight={searchParams?.get("highlight") ?? null} />
          </section>
        )}

        {activeTab === "polls" && (
          <section style={sectionStyle}>
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
      </section>
    </main>
  );
}

/* ================= MATCH COMMENTS ================= */

type CommentProfile = { id: string; username?: string; display_name?: string; avatar_url?: string };
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

  function startReply(comment: MatchComment) {
    setReplyThreadId(null);
    setReplyTo(comment);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const replyThread = useMemo(
    () => (replyThreadId ? findMatchCommentById(comments, replyThreadId) : null),
    [comments, replyThreadId]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
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
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds);
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
      if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies!.push(c);
      else topLevel.push(c);
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
      game_id: gameId, user_id: userId, parent_id: replyTarget?.id ?? null,
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
    <div style={{ display: "flex", flexDirection: "column" }}>

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

      {/* Input — sticky within the match container */}
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
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <MentionTextarea
                textareaRef={inputRef}
                value={body}
                onChange={setBody}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !cooldown) { e.preventDefault(); submit(); } }}
                placeholder={cooldown > 0 ? `Wait ${cooldown}s…` : replyTo ? "Write a reply…" : "Write a comment…"}
                rows={1}
                maxLength={500}
                style={{ width: "100%", minHeight: 44, maxHeight: 110, background: "var(--surface-3)", border: "1.5px solid var(--border-3)", borderRadius: 22, color: "var(--text-1)", fontSize: 14, padding: "11px 16px", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.45 }}
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
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" /></svg>
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

function MCCommentBody({ name, username, text }: { name: string; username?: string; text: string }) {
  const router = useRouter();
  const parts = text.split(/(@\w+)/g);
  return (
    <p style={{ margin: 0, fontSize: 14, color: "var(--text-1)", lineHeight: 1.5, wordBreak: "break-word" }}>
      <span
        onClick={() => username && router.push(`/profile/${username}`)}
        style={{ fontWeight: 900, marginRight: 6, cursor: username ? "pointer" : "default" }}
      >
        {name}
      </span>
      {parts.map((part, i) =>
        /^@\w+$/.test(part) ? (
          <span key={i} onClick={() => router.push(`/profile/${part.slice(1)}`)} style={{ color: "#60a5fa", fontWeight: 700, cursor: "pointer" }}>
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
        style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: username ? "pointer" : "default" }}
      >
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 13, fontWeight: 950, color: "#60a5fa" }}>{name[0]?.toUpperCase()}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <MCCommentBody name={name} username={username} text={comment.body} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 5 }}>
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
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "8px 0 0", fontSize: 12, fontWeight: 800, color: "var(--text-3)", cursor: "pointer" }}
            >
              <span style={{ width: 24, height: 1, background: "var(--border-2)", display: "inline-block" }} />
              {`View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>

        <button
          onClick={() => onLike(comment)}
          disabled={!userId || isLiking}
          aria-label={isLiked ? "Unlike comment" : "Like comment"}
          style={{ width: 30, minHeight: 42, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 3, background: "none", border: "none", padding: "3px 0 0", fontSize: 11, fontWeight: 800, cursor: userId ? "pointer" : "default", color: isLiked ? "#f43f5e" : "var(--text-3)", opacity: isLiking ? 0.5 : 1 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? "#f43f5e" : "none"} stroke={isLiked ? "#f43f5e" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {comment.likes > 0 && <span>{comment.likes}</span>}
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
          <button onClick={onClose} style={matchReplyModalCloseStyle}>×</button>
        </div>
        <div style={matchReplyParentStyle}>
          <MCRow comment={comment} userId={userId} onLike={onLike} onDelete={onDelete} onReply={() => focusReplyInput()} onViewReplies={onViewReplies} liking={liking} hideRepliesToggle />
        </div>
        <div style={matchReplyListStyle}>
          {replyCount === 0 ? (
            <div style={matchReplyEmptyStyle}>No replies yet.</div>
          ) : (
            comment.replies!.map((reply) => (
              <MCRow key={reply.id} comment={reply} userId={userId} onLike={onLike} onDelete={onDelete} onReply={() => focusReplyInput()} onViewReplies={onViewReplies} liking={liking} />
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
    <div style={{ background: "rgba(251,191,36,0.06)", border: "1.5px solid rgba(251,191,36,0.2)", borderRadius: 18, overflow: "hidden", marginBottom: 4 }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border-1)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", letterSpacing: "0.04em" }}>POLL LEADERBOARD</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>Aura from polls</span>
      </div>

      {/* Rows */}
      {entries.map((e, i) => {
        const label = e.username || e.displayName || "User";
        const initials = label.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
        const isTop3 = i < 3;
        const medalColor = i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "rgba(255,255,255,0.2)";

        return (
          <div
            key={e.userId}
            onClick={() => e.username && router.push(`/album/${e.username}`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderBottom: i < entries.length - 1 ? "1px solid var(--border-1)" : "none",
              background: i === 0 ? "rgba(251,191,36,0.05)" : "transparent",
              cursor: e.username ? "pointer" : "default",
            }}
          >
            {/* Rank */}
            <div style={{ width: 24, textAlign: "center", flexShrink: 0 }}>
              {isTop3 ? (
                <span style={{ fontSize: 16 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.3)" }}>{i + 1}</span>
              )}
            </div>

            {/* Avatar */}
            <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", border: `2px solid ${isTop3 ? medalColor : "var(--border-2)"}`, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-3)" }}>
              {e.avatarUrl
                ? <img src={e.avatarUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 13, fontWeight: 900, color: isTop3 ? medalColor : "rgba(255,255,255,0.5)" }}>{initials}</span>
              }
            </div>

            {/* Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: i === 0 ? "#fef3c7" : "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.username ? `@${e.username}` : e.displayName || "User"}
              </div>
            </div>

            {/* XP badge */}
            <div style={{ flexShrink: 0, background: isTop3 ? `rgba(${i === 0 ? "251,191,36" : i === 1 ? "148,163,184" : "205,124,50"},0.15)` : "var(--border-1)", border: `1px solid ${isTop3 ? medalColor + "44" : "var(--border-2)"}`, borderRadius: 999, padding: "4px 10px" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: isTop3 ? (i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : "#cd7c32") : "rgba(255,255,255,0.6)" }}>
                +{e.xp} Aura
              </span>
            </div>
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
        <button onClick={() => setCreating(true)} style={createPollBtnStyle}>
          + New Poll
        </button>
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
            <span style={{ fontSize: 14, fontWeight: 900, color: isWinner ? "#22c55e" : wrong ? "#f87171" : "#fff", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
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
        <span style={{ fontSize: 15, fontWeight: 800, color: wrong ? "#f87171" : "#fff", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
const pollCardStyle: CSSProperties = { background: "var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 14px 12px" };
const pollQuestionStyle: CSSProperties = { fontSize: 18, fontWeight: 900, color: "var(--text-1)", lineHeight: 1.3, display: "block", letterSpacing: "-0.02em" };
const pollResultRowStyle: CSSProperties = { padding: "0" };
const pollOptionBtnStyle: CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1.5px solid var(--border-2)", color: "var(--text-1)", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", transition: "background 0.15s, border-color 0.15s" };
const createFormStyle: CSSProperties = { margin: "0 16px 16px", padding: "16px", borderRadius: 16, background: "var(--surface-1)", border: "1px solid var(--border-2)" };
const pollTypeToggleStyle: CSSProperties = { flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" };

const roundStripShellStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: 4,
  background: "var(--bg)",
  borderBottom: "1px solid var(--border-2)",
};

const roundStripScrollStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "10px 12px 10px 4px",
  scrollSnapType: "x mandatory",
};

const roundMiniBoxStyle: CSSProperties = {
  position: "relative",
  flex: "0 0 118px",
  minHeight: 62,
  padding: "7px 8px 8px",
  borderRadius: 8,
  border: "1px solid var(--border-2)",
  color: "var(--text-1)",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  scrollSnapAlign: "start",
};

const roundMiniStatusStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
};

const roundMiniScoreStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  fontSize: 13,
  fontWeight: 950,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const roundMiniLogoStyle: CSSProperties = {
  width: 15,
  height: 15,
  borderRadius: "50%",
  objectFit: "cover",
};

const roundMiniTeamsStyle: CSSProperties = {
  maxWidth: "100%",
  color: "var(--text-3)",
  fontSize: 9,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const roundMiniActiveLineStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 0,
  height: 2,
  borderRadius: 999,
  background: "#3b82f6",
};

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: "calc(90px + env(safe-area-inset-bottom))" };
const matchCentreStyle: CSSProperties = { width: "100%", maxWidth: 760, margin: "0 auto", background: "var(--surface-1)", minHeight: "100vh", borderLeft: "1px solid var(--border-2)", borderRight: "1px solid var(--border-2)" };
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
const liveFeedListStyle: CSSProperties = { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 };
const liveFeedBoxStyle: CSSProperties = { minHeight: 72, display: "grid", gridTemplateColumns: "60px 1fr auto", alignItems: "center", gap: 12, background: "var(--bg)", borderRadius: 18, padding: "10px 14px 10px 12px", overflow: "hidden" };
const liveFeedInfoStyle: CSSProperties = { minWidth: 0 };
const liveFeedNameStyle: CSSProperties = { color: "var(--text-1)", fontSize: 14, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const liveFeedActionStyle: CSSProperties = { marginTop: 4, fontSize: 20, lineHeight: 1, fontWeight: 900, letterSpacing: ".04em" };
const liveFeedRightStyle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 8 };
const liveFeedScoreRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5 };
const liveFeedScoreTextStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" };
const liveFeedTimeBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 999, padding: "3px 7px" };
const liveFeedQuarterStyle: CSSProperties = { fontSize: 10, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.04em" };
const liveFeedTimeDotStyle: CSSProperties = { fontSize: 10, color: "var(--text-4)", fontWeight: 700 };
const liveFeedMinuteStyle: CSSProperties = { fontSize: 10, fontWeight: 800, color: "var(--text-3)" };
const commentBubbleBtnStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--text-3)", padding: "2px 0", fontSize: 12, fontWeight: 700 };
const commentCountStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-3)" };
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
const emptyFeedStyle: CSSProperties = { marginTop: 12, background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 14, padding: "20px 16px", color: "var(--text-3)", fontSize: 14, fontWeight: 600, textAlign: "center" };
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
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "9px 10px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap", fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-3)" };
const thPlayerStyle: CSSProperties = { ...thStyle, minWidth: 180 };
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: "1px solid var(--border-1)", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" };
const tdPlayerStyle: CSSProperties = { ...tdStyle, fontWeight: 800, fontSize: 14, color: "var(--text-1)", minWidth: 180 };
const playerNameCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const ratingPillStyle: CSSProperties = { display: "inline-block", minWidth: 48, padding: "5px 9px", borderRadius: 8, color: "var(--text-1)", fontWeight: 900, fontSize: 13, border: "1.5px solid rgba(0,0,0,0.3)", textAlign: "center" };
const statSwitchWrapStyle: CSSProperties = { display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 };
const statSwitchStyle: CSSProperties = { appearance: "none", border: "1px solid var(--border-2)", background: "var(--surface-2)", color: "var(--text-2)", borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: "0.01em" };
const activeStatSwitchStyle: CSSProperties = { ...statSwitchStyle, background: "#3b82f6", color: "var(--text-1)", border: "1px solid #3b82f6" };
const noStatsStyle: CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border-1)", borderRadius: 14, padding: "20px 16px", color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600, textAlign: "center" };
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
const freeKickBoxStyle: CSSProperties = { marginTop: 22, background: "var(--surface-1)", border: "1px solid var(--border-3)", borderRadius: 16, padding: 16 };
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
