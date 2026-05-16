"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
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
import { useXP } from "@/app/context/XPContext";

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
    collingwood:     { primary: "#1a1a1a", secondary: "#ffffff", text: "#000000" },
    // Essendon: Red → Black
    essendon:        { primary: "#ef4444", secondary: "#1a1a1a", text: "#000000" },
    // Fremantle: Purple → White
    fremantle:       { primary: "#7c3aed", secondary: "#ffffff", text: "#ffffff" },
    // Geelong: Navy → White
    geelong:         { primary: "#1e40af", secondary: "#ffffff", text: "#000000" },
    "geelong cats":  { primary: "#1e40af", secondary: "#ffffff", text: "#000000" },
    // Gold Coast: Red (solid)
    "gold coast":    { primary: "#ef4444", secondary: "#ef4444", text: "#ffffff" },
    "gold coast suns": { primary: "#ef4444", secondary: "#ef4444", text: "#ffffff" },
    // GWS: Orange → White
    gws:                          { primary: "#f97316", secondary: "#ffffff", text: "#000000" },
    "gws giants":                 { primary: "#f97316", secondary: "#ffffff", text: "#000000" },
    "greater western sydney":     { primary: "#f97316", secondary: "#ffffff", text: "#000000" },
    "greater western sydney giants": { primary: "#f97316", secondary: "#ffffff", text: "#000000" },
    // Hawthorn: Yellow → Brown
    hawthorn:        { primary: "#f59e0b", secondary: "#78350f", text: "#000000" },
    "hawthorn hawks": { primary: "#f59e0b", secondary: "#78350f", text: "#000000" },
    // Melbourne: Red → Navy
    melbourne:           { primary: "#ef4444", secondary: "#1e40af", text: "#ffffff" },
    "melbourne demons":  { primary: "#ef4444", secondary: "#1e40af", text: "#ffffff" },
    // North Melbourne: Blue → White
    "north melbourne":             { primary: "#1d4ed8", secondary: "#ffffff", text: "#ffffff" },
    "north melbourne kangaroos":   { primary: "#1d4ed8", secondary: "#ffffff", text: "#ffffff" },
    // Port Adelaide: Black → Teal
    "port adelaide":       { primary: "#1a1a1a", secondary: "#06b6d4", text: "#000000" },
    "port adelaide power": { primary: "#1a1a1a", secondary: "#06b6d4", text: "#000000" },
    // Richmond: Black → Yellow
    richmond:        { primary: "#1a1a1a", secondary: "#facc15", text: "#000000" },
    "richmond tigers": { primary: "#1a1a1a", secondary: "#facc15", text: "#000000" },
    // St Kilda: Red → White → Black
    "st kilda":      { primary: "#ef4444", secondary: "#ffffff", tertiary: "#1a1a1a", text: "#ffffff" },
    "st kilda saints": { primary: "#ef4444", secondary: "#ffffff", tertiary: "#1a1a1a", text: "#ffffff" },
    // Sydney: White → Red
    sydney:          { primary: "#ffffff", secondary: "#ef4444", text: "#ffffff" },
    "sydney swans":  { primary: "#ffffff", secondary: "#ef4444", text: "#ffffff" },
    // West Coast: Blue → Yellow
    "west coast":        { primary: "#1d4ed8", secondary: "#facc15", text: "#000000" },
    "west coast eagles": { primary: "#1d4ed8", secondary: "#facc15", text: "#000000" },
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

function clockFromTimestr(timestr?: string) {
  const text = safeText(timestr, "");
  const qMatch = text.match(/Q\s*(\d+)/i);
  const minuteMatch = text.match(/(\d+):\d+/);

  return {
    period: qMatch ? Number(qMatch[1]) : undefined,
    minute: minuteMatch ? Number(minuteMatch[1]) : undefined,
  };
}

function scoreTypeFromDelta(delta: number, goalDelta?: number, behindDelta?: number) {
  if (goalDelta != null && goalDelta > 0) return "GOAL";
  if (behindDelta != null && behindDelta > 0 && goalDelta === 0) return "BEHIND";
  if (delta === 1) return "BEHIND";
  if (delta === 6) return "GOAL";
  if (delta > 0) return "SCORE";
  return "";
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

function playerTeamName(player: any) {
  return safeText(player?.club || player?.team, "");
}

function eventPrimaryTeam(event: LiveEvent) {
  return safeText((event as any).teamName || teamNameFromEvent(event), "");
}

function findPlayerForLiveEvent(event: LiveEvent) {
  const target = Number(event.playerId);
  if (!Number.isFinite(target)) return null;

  const candidates = (playerStatsJson as any[]).filter((player) => playerMatchesLiveId(player, target));
  if (candidates.length === 0) return null;

  const team = eventPrimaryTeam(event);
  if (team) {
    const teamPlayer = candidates.find((player) => teamsMatch(playerTeamName(player), team));
    if (teamPlayer) return teamPlayer;
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

function getSortValue(player: PlayerStat, key: SortKey) {
  if (key === "foopy") {
    const savedFoopy = num(player.foopy);
    return savedFoopy > 0 ? savedFoopy : foopyRating(player);
  }

  if (key === "goals") return num(player.goals) * 100 + num(player.behinds);

  if (key === "goalAssists") {
    return num((player as any).goalAssists);
  }

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

function TeamScore({ team, score, align = "left" }: { team: any; score: any; align?: "left" | "right" }) {
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
          width: "clamp(82px, 17vw, 116px)", height: "clamp(82px, 17vw, 116px)", borderRadius: "50%", flexShrink: 0,
          background: `radial-gradient(circle at 45% 35%, rgba(255,255,255,.18), ${accent}24 48%, rgba(255,255,255,.035) 100%)`,
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: `0 22px 48px ${accent}30, 0 4px 22px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,0.16)`,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img
            src={getLogo(safeTeam)}
            alt={safeTeam}
            style={{ width: "92%", height: "92%", objectFit: "contain", borderRadius: "50%", display: "block" }}
          />
        </div>
      </Link>
      {/* Score */}
      <div
        key={animKey}
        style={{
          fontSize: isRecordScore ? "clamp(42px, 8.6vw, 72px)" : "clamp(48px, 11vw, 78px)", fontWeight: 1000, color: "#fff",
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
  if (games.length <= 1) return null;

  return (
    <div style={roundStripShellStyle} className="no-scrollbar">
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
              borderColor: active ? "#3b82f6" : live ? "rgba(34,197,94,.55)" : "rgba(255,255,255,.1)",
              background: active ? "rgba(59,130,246,.12)" : "#070707",
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
  );
}

function PlayerAvatar({ name, team }: { name: any; team?: any }) {
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
        background: `${bg}80`,
      }}
    >
      {!failed && src ? (
        <img key={src} src={src} alt={safeName} style={playerAvatarImageStyle} onError={() => setFailed(true)} />
      ) : (
        <span style={playerInitialsStyle}>{getInitials(safeName)}</span>
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
  onCommentClick,
}: {
  event: LiveEvent;
  homeTeam: any;
  awayTeam: any;
  eventKey?: string;
  commentCount?: number;
  onCommentClick?: () => void;
}) {
  const isInferred = Boolean((event as any).optimistic) || Boolean((event as any).inferred);
  const inferredTeam = safeText((event as any).teamName, "");
  const apiEventTeam = teamNameFromEvent(event);
  const eventTeam = safeText(inferredTeam || apiEventTeam, "");
  const player = findPlayerForLiveEvent(event);
  const team = safeText(eventTeam || player?.club || player?.team, "");
  const playerName = isInferred ? team : safePlayerName(player?.name || event.playerName, team || event.playerId);
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
        ...liveFeedBoxStyle,
        background: "#000000",
        border: "none",
        borderRadius: 18,
        minHeight: type === "BEHIND" ? 50 : liveFeedBoxStyle.minHeight,
        padding: type === "BEHIND" ? "6px 16px 6px 12px" : liveFeedBoxStyle.padding,
      }}>
        {isInferred ? <TeamEventAvatar team={team} /> : <PlayerAvatar name={playerName} team={team} />}

        <div style={liveFeedInfoStyle}>
          <div style={liveFeedNameStyle}>{playerName}</div>
          <div style={{ ...liveFeedActionStyle, color: type === "GOAL" ? "#22c55e" : type === "BEHIND" ? "#f8fafc" : "#facc15" }}>
            {type}
          </div>
        </div>

        <div style={liveFeedRightStyle}>
          <div style={liveFeedTimeBadgeStyle}>
            <span style={liveFeedQuarterStyle}>{eventQuarter(event)}</span>
            <span style={liveFeedTimeDotStyle}>·</span>
            <span style={liveFeedMinuteStyle}>{event.minute ?? "-"}'</span>
          </div>

          <button onClick={onCommentClick} style={commentBubbleBtnStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {(commentCount ?? 0) > 0 && <span style={commentCountStyle}>{commentCount}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuarterBreakFeedBox({ label }: any) {
  const safeLabel = safeText(label, "");
  const isFullTime = safeLabel === "FULL TIME";

  const accentColor = "#f8fafc";
  const pillBg = "rgba(255,255,255,0.08)";
  const pillBorder = "rgba(255,255,255,0.18)";

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

function InsightsBox({ game, allGames }: { game: MatchGame; allGames: MatchGame[] }) {
  const insights = generateInsights(game.hteam, game.ateam, game, allGames, teamStatsJson as Record<string, any>, API_TEAM_ID_BY_NAME);
  if (!insights.length) return null;

  let lastTeam: string | null | undefined = undefined;

  return (
    <div style={{
      margin: "20px 0 8px",
      background: "#0d0d0d",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      <div style={{ padding: "14px 16px 10px", fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-0.01em" }}>
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
              background: "#111111",
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

type LiveScoreSnapshot = {
  home: number;
  away: number;
  homeGoals?: number;
  awayGoals?: number;
  homeBehinds?: number;
  awayBehinds?: number;
};

function scoreSnapshot(game: MatchGame): LiveScoreSnapshot | null {
  const home = Number(game.hscore ?? 0);
  const away = Number(game.ascore ?? 0);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;

  const optionalNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    home,
    away,
    homeGoals: optionalNumber((game as any).hgoals),
    awayGoals: optionalNumber((game as any).agoals),
    homeBehinds: optionalNumber((game as any).hbehinds),
    awayBehinds: optionalNumber((game as any).abehinds),
  };
}

function feedScoreSnapshot(events: LiveEvent[], homeTeam: string, awayTeam: string): LiveScoreSnapshot | null {
  let home = 0;
  let away = 0;

  for (const event of events) {
    const type = safeText(event.type, "").toUpperCase();
    const points = type === "GOAL" ? 6 : type === "BEHIND" ? 1 : 0;
    if (!points) continue;

    const team = resolvedEventTeam(event);
    if (teamsMatch(team, homeTeam)) home += points;
    else if (teamsMatch(team, awayTeam)) away += points;
  }

  return { home, away };
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

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { awardXP } = useXP();
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
  const seenEventKeys = useRef(new Set<string>());
  const initialFeedLoaded = useRef(false);
  const [freshEventKeys, setFreshEventKeys] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [allGames, setAllGames] = useState<MatchGame[]>([]);
  const [roundGames, setRoundGames] = useState<MatchGame[]>([]);
  const [scoreboardPassed, setScoreboardPassed] = useState(false);
  const scoreboardRef = useRef<HTMLDivElement>(null);
  const previousScoreRef = useRef<LiveScoreSnapshot | null>(null);
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

  // Award XP for viewing a live match
  useEffect(() => {
    if (id && game && getStatus(game) === "LIVE") awardXP("view_match", { matchId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, game]);

  // Award XP for a correct winner pick when match is FINAL
  useEffect(() => {
    if (!id || !game || getStatus(game) !== "FINAL") return;
    const gameId = Number(id);
    if (!gameId) return;
    const pick = localStorage.getItem(`winner-pick-${id}`) as "home" | "away" | null;
    if (!pick) return;
    const hs = game.hscore ?? 0;
    const as = game.ascore ?? 0;
    if (hs === as) return; // draw — no XP
    const winner = hs > as ? "home" : "away";
    if (pick === winner) awardXP("correct_pick", { gameId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, game]);

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

        const gamesUrl = `/api/squiggle/games?fresh=1&t=${Date.now()}`;
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

  // Detect score changes by comparing Squiggle score against what's already in the feed.
  // The feed (liveEvents) is the baseline — if the Squiggle total is higher, something
  // happened that isn't in the feed yet, so we infer an event.
  useEffect(() => {
    if (!game || !apiSportsGameId || getStatus(game) === "FINAL") return;

    const current = scoreSnapshot(game);
    if (!current || (current.home === 0 && current.away === 0)) return;

    const feedScore = feedScoreSnapshot(liveEvents, game.hteam, game.ateam);
    const feedHome = feedScore?.home ?? 0;
    const feedAway = feedScore?.away ?? 0;

    const homeDelta = current.home - feedHome;
    const awayDelta = current.away - feedAway;

    // Only infer when exactly one team's score is ahead — avoids double-firing
    const homeScored = homeDelta > 0 && awayDelta === 0;
    const awayScored = awayDelta > 0 && homeDelta === 0;
    if (!homeScored && !awayScored) return;

    const scoringTeam = homeScored ? game.hteam : game.ateam;
    const teamId = getApiTeamId(scoringTeam);
    if (!teamId) return;

    const delta = homeScored ? homeDelta : awayDelta;
    const goalDelta = homeScored
      ? (current.homeGoals != null ? current.homeGoals - Math.floor(feedHome / 6) : undefined)
      : (current.awayGoals != null ? current.awayGoals - Math.floor(feedAway / 6) : undefined);
    const behindDelta = homeScored
      ? (current.homeBehinds != null ? current.homeBehinds - (feedHome % 6) : undefined)
      : (current.awayBehinds != null ? current.awayBehinds - (feedAway % 6) : undefined);

    const type = scoreTypeFromDelta(delta, goalDelta, behindDelta);
    if (!type) return;

    const { period, minute } = clockFromTimestr(game.timestr);
    fetch("/api/afl/infer-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: apiSportsGameId,
        teamId,
        type,
        homeScore: current.home,
        awayScore: current.away,
        period: period ?? currentPeriod ?? null,
        minute: minute ?? null,
      }),
    }).catch(() => {});
  }, [game?.hscore, game?.ascore, liveEvents, apiSportsGameId, currentPeriod]);

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

    if (getStatus(game) !== "LIVE") {
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

    const seen = new Set<string>();
    const normalised = rows
      .filter((e: any) => {
        const k = `${e.period}|${e.minute}|${e.type}|${e.team_id}|${e.player_id}|${e.home_score}|${e.away_score}`;
        if (seen.has(k)) return false;
        seen.add(k);
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
  useEffect(() => {
    if (!id) return;
    const presenceChannel = supabase.channel(`match-viewers-${id}`, {
      config: { presence: { key: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setLiveViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ joined_at: Date.now() });
        }
      });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const gameId = Number(id);

    supabase
      .from("feed_comments")
      .select("event_key")
      .eq("game_id", gameId)
      .not("event_key", "is", null)
      .then(({ data }) => {
        if (!data) return;

        const counts: Record<string, number> = {};
        for (const row of data as { event_key: string }[]) {
          counts[row.event_key] = (counts[row.event_key] ?? 0) + 1;
        }

        setEventCommentCounts(counts);
      });
  }, [id, liveEvents]);

  const backButton = (
    <div style={{ padding: "calc(env(safe-area-inset-top) + 10px) 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <button
        onClick={() => router.back()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "#60a5fa",
          fontSize: 14,
          fontWeight: 700,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "8px 12px",
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ transform: "rotate(180deg)" }}>
          <path d="M1 1.5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Scores
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{Math.max(1, liveViewerCount)}</span>
      </div>
    </div>
  );

  if (!mounted || loading) {
    return (
      <main style={pageStyle} className="page-enter">
        {backButton}
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
        {backButton}
        <section style={emptyStyle}>
          <h1>Match not found</h1>
          <p style={mutedStyle}>{error || `No game found for ID: ${id}`}</p>
        </section>
      </main>
    );
  }

  const homeAbbr = getAbbr(game.hteam);
  const awayAbbr = getAbbr(game.ateam);

  const displayHomeStats = isLiveGame && liveHomeStats.length > 0 ? liveHomeStats : homeStats;
  const displayAwayStats = isLiveGame && liveAwayStats.length > 0 ? liveAwayStats : awayStats;

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
      ? { bg: "#7f1d1d", border: "#ef4444", color: "#fecaca", label: "Full time" }
      : { bg: "#1d4ed8", border: "#60a5fa", color: "#eff6ff", label: status };
  const homeScoreDisplay =
    status === "UPCOMING" ? getTeamRecordBeforeGame(game.hteam, allGames, game) : game.hscore;
  const awayScoreDisplay =
    status === "UPCOMING" ? getTeamRecordBeforeGame(game.ateam, allGames, game) : game.ascore;

  return (
    <main style={pageStyle} className="page-enter">
      <section style={matchCentreStyle}>
        <RoundGameStrip games={roundGames} activeId={id} now={now} />

        {/* ── Scoreboard ── */}
        <div ref={scoreboardRef} style={{
          position: "relative", overflow: "hidden",
          padding: roundGames.length > 1 ? "24px 24px 26px" : "calc(env(safe-area-inset-top) + 24px) 24px 26px",
          minHeight: 292,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(180deg, #151515 0%, #090909 58%, #040404 100%)",
        }}>
          {/* Team colour glow blobs */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse 48% 72% at 18% 56%, ${teamColor(game.hteam ?? "")}42 0%, transparent 68%),
                         radial-gradient(ellipse 48% 72% at 82% 56%, ${teamColor(game.ateam ?? "")}42 0%, transparent 68%),
                         radial-gradient(ellipse 70% 36% at 50% -4%, rgba(255,255,255,.09), transparent 70%)`,
          }} />
          <div style={{
            position: "absolute",
            inset: "auto 18% 0",
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
            pointerEvents: "none",
          }} />

          <div style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "44px 1fr 44px",
            alignItems: "center",
            gap: 10,
            minHeight: 44,
            marginBottom: 52,
          }}>
            <button
              onClick={() => router.back()}
              aria-label="Back"
              style={{
                width: 44,
                height: 44,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <ChevronLeft size={38} strokeWidth={2.4} />
            </button>

            <Link
              href="/"
              aria-label="Foopy home"
              style={{
                justifySelf: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 11,
                color: "#fff",
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

            <div aria-hidden="true" />
          </div>


          {/* Scores row */}
          <div style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(82px, 180px) minmax(0, 1fr)",
            alignItems: "center",
            gap: 16,
          }}>
            <TeamScore team={game.hteam} score={homeScoreDisplay} align="left" />

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
                    background: "#ffffff",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.22)",
                    animation: "livePulse 1.8s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#ffffff", letterSpacing: 0 }}>Live</span>
                  {(game.timestr || getLiveGameClock(liveEvents)) && (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>·</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#ffffff" }}>{game.timestr || getLiveGameClock(liveEvents)}</span>
                    </>
                  )}
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

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{Math.max(1, liveViewerCount)}</span>
              </div>

            </div>

            <TeamScore team={game.ateam} score={awayScoreDisplay} align="right" />
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
                background: "#18181b",
                border: "1px solid #3f3f46",
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
          background: "rgba(8,8,8,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          paddingTop: "env(safe-area-inset-top)",
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: scoreboardPassed ? "auto" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 8px 8px 4px", gap: 8 }}>
            {/* Back */}
            <button
              onClick={() => router.back()}
              style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#fff", flexShrink: 0, padding: 0 }}
            >
              <ChevronLeft size={28} strokeWidth={2.4} />
            </button>

            {/* Scores */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {/* Home */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 20, fontWeight: 1000, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {typeof homeScoreDisplay === "string" ? homeScoreDisplay : scoreText(homeScoreDisplay)}
                </span>
                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: `${teamColor(game.hteam ?? "")}22`, border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#4ade80" }}>{game.timestr || getLiveGameClock(liveEvents)}</span>
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
                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: `${teamColor(game.ateam ?? "")}22`, border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={getLogo(game.ateam)} alt={game.ateam ?? ""} style={{ width: "88%", height: "88%", objectFit: "contain" }} />
                </div>
                <span style={{ fontSize: 20, fontWeight: 1000, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
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
          background: "rgba(10,10,10,0.97)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <nav style={{ display: "flex", width: "100%" }}>
            {(["feed","chat","polls"] as const).map(t => (
              <button key={t} type="button" onClick={() => setActiveTab(t)} style={{
                flex: 1, padding: "13px 4px 11px",
                background: "none", border: "none",
                borderBottom: activeTab === t ? "2px solid #fff" : "2px solid transparent",
                color: activeTab === t ? "#fff" : "#3a3a3a",
                fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
                cursor: "pointer", whiteSpace: "nowrap",
                textTransform: "capitalize",
                transition: "color 0.12s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === "polls" && unansweredPollCount > 0 && activeTab !== "polls" && (
                  <span style={{
                    fontSize: 10, fontWeight: 900, lineHeight: 1,
                    background: "#ef4444", color: "#fff",
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
                <div style={countdownBoxStyle}>
                  <div style={countdownLabelStyle}>GAME STARTS IN</div>
                  <div style={countdownTimeStyle}>{getCountdownText(game.date, now)}</div>
                </div>
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
                          onCommentClick={() => {
                            const inferredTeam = safeText((event as any).teamName, "");
                            const apiTeam = teamNameFromEvent(event);
                            const eventTeam = safeText(inferredTeam || apiTeam, "");
                            const player = findPlayerForLiveEvent(event);
                            const team = safeText(eventTeam || player?.club || player?.team, "");
                            const name = ((event as any).optimistic || (event as any).inferred)
                              ? team || "Team"
                              : safePlayerName(player?.name || event.playerName, team || event.playerId || index + 1);
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

  async function submit() {
    if (!body.trim() || !userId || submitting) return;

    // Check for duplicate — same text already sent by this user in this section
    const trimmed = body.trim().toLowerCase();
    const allComments = comments.flatMap(c => [c, ...(c.replies ?? [])]);
    const isDuplicate = allComments.some(
      c => c.user_id === userId && c.body.trim().toLowerCase() === trimmed
    );
    if (isDuplicate) { showDupToast(); return; }

    setSubmitting(true);
    const trimmedBody = body.trim();
    const { data: inserted, error } = await supabase.from("feed_comments").insert({
      game_id: gameId, user_id: userId, parent_id: replyTo?.id ?? null,
      body: trimmedBody, event_key: null,
    }).select("id").single();
    if (error) {
      console.error("Chat insert error:", error);
    } else {
      const newCommentId = (inserted as { id: string } | null)?.id;
      // Notify parent comment author of reply
      if (replyTo && replyTo.user_id && replyTo.user_id !== userId) {
        await createNotification(replyTo.user_id, "reply_comment", userId, {
          comment_body: trimmedBody.slice(0, 100),
          comment_id: replyTo.id,
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
      setBody(""); setReplyTo(null);
      const newCount = commentsSent + 1;
      setCommentsSent(newCount);
      if (newCount > 3) setCooldown(30);
      await load(sort);
    }
    setSubmitting(false);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 900, color: "#f8fafc" }}>
          Comments
          <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b" }}>{comments.length > 0 ? comments.length : ""}</span>
        </span>
        {/* Sort pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["live", "top"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              background: sort === s ? "#f8fafc" : "rgba(255,255,255,0.07)",
              color: sort === s ? "#020202" : "#64748b",
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
            <div style={{ width: 24, height: 24, border: "2px solid rgba(255,255,255,.08)", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : comments.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 20px", color: "#94a3b8", textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9" y1="10" x2="15" y2="10" /><line x1="9" y1="14" x2="13" y2="14" />
            </svg>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", marginBottom: 5 }}>Start the conversation</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Be the first to react!</div>
          </div>
        ) : (
          comments.map(c => (
            <MCRow key={c.id} comment={c} userId={userId} onLike={handleLike} onDelete={handleDelete}
              onReply={r => { setReplyTo(r); setTimeout(() => inputRef.current?.focus(), 50); }} liking={liking} />
          ))
        )}
      </div>

      {/* Input — sticky within the match container */}
      <div style={{ position: "sticky", bottom: 0, zIndex: 50, borderTop: "1px solid rgba(255,255,255,.08)", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", background: "rgba(5,5,5,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        {!userId ? (
          <button onClick={() => router.push("/login")} style={{ width: "100%", height: 48, borderRadius: 16, background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", fontWeight: 900, fontSize: 15, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(59,130,246,0.3)" }}>
            Sign in to chat
          </button>
        ) : (
          <>
            {replyTo && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "7px 12px", background: "rgba(59,130,246,.1)", borderRadius: 12, border: "1px solid rgba(59,130,246,.22)" }}>
                <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                  Replying to <span style={{ color: "#60a5fa", fontWeight: 900 }}>{replyTo.profile?.display_name || replyTo.profile?.username || "user"}</span>
                </span>
                <button onClick={() => setReplyTo(null)} style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
                style={{ width: "100%", minHeight: 44, maxHeight: 110, background: "rgba(255,255,255,.07)", border: "1.5px solid rgba(255,255,255,.12)", borderRadius: 22, color: "#f8fafc", fontSize: 14, padding: "11px 16px", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.45 }}
              />
              <button
                onClick={submit}
                disabled={!body.trim() || submitting || cooldown > 0}
                style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 2px 12px rgba(59,130,246,0.35)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: !body.trim() || submitting || cooldown > 0 ? 0.38 : 1, transition: "opacity 0.15s" }}
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
    <p style={{ margin: 0, fontSize: 14, color: "#e2e8f0", lineHeight: 1.5, wordBreak: "break-word" }}>
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

function MCRow({ comment, userId, onLike, onDelete, onReply, liking, isReply = false }: {
  comment: MatchComment; userId: string | null;
  onLike: (c: MatchComment) => void; onDelete: (id: string) => void;
  onReply: (c: MatchComment) => void; liking: Set<string>; isReply?: boolean;
}) {
  const router = useRouter();
  const name = comment.profile?.display_name || comment.profile?.username || "User";
  const username = comment.profile?.username;
  const avatar = comment.profile?.avatar_url;
  const isOwn = userId === comment.user_id;
  const isLiked = comment.liked;
  const isLiking = liking.has(comment.id);
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = comment.replies?.length ?? 0;

  return (
    <div id={`c-${comment.id}`} style={{ display: "flex", gap: 10, padding: isReply ? "8px 16px 4px 54px" : "10px 16px 4px", marginBottom: 2 }}>
      {/* Avatar */}
      <div
        onClick={() => username && router.push(`/profile/${username}`)}
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#111827", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: username ? "pointer" : "default" }}
      >
        {avatar
          ? <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 13, fontWeight: 950, color: "#60a5fa" }}>{name[0]?.toUpperCase()}</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bubble */}
        <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, borderTopLeftRadius: 4, padding: "9px 13px", display: "inline-block", maxWidth: "100%", wordBreak: "break-word" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#f1f5f9" }}>{name}</span>
            <span style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>{mcRelTime(comment.created_at)}</span>
          </div>
          <CommentBody text={comment.body} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 5, paddingLeft: 4 }}>
          <button onClick={() => onLike(comment)} disabled={!userId || isLiking}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 800, cursor: "pointer", color: isLiked ? "#f43f5e" : "#475569", opacity: isLiking ? 0.5 : 1 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isLiked ? "#f43f5e" : "none"} stroke={isLiked ? "#f43f5e" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {comment.likes > 0 && comment.likes}
          </button>
          {!isReply && userId && (
            <button onClick={() => onReply(comment)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 800, cursor: "pointer", color: "#475569" }}>
              Reply
            </button>
          )}
          {isOwn && (
            <button onClick={() => onDelete(comment.id)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 800, cursor: "pointer", color: "#ef4444" }}>
              Delete
            </button>
          )}
        </div>

        {/* View replies toggle */}
        {!isReply && replyCount > 0 && (
          <button
            onClick={() => setShowReplies(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "6px 4px 2px", fontSize: 12, fontWeight: 800, color: "#3b82f6", cursor: "pointer" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showReplies ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {showReplies ? "Hide replies" : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </button>
        )}

        {/* Replies */}
        {!isReply && showReplies && comment.replies && comment.replies.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {comment.replies.map(r => (
              <MCRow key={r.id} comment={r} userId={userId} onLike={onLike} onDelete={onDelete} onReply={onReply} liking={liking} isReply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= POLLS ================= */

const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID ?? "";

const POLL_CATEGORIES: Record<string, { label: string; stat: string; type: "team" | "player" }> = {
  team_goals:        { label: "Which team kicks more goals?",         stat: "goals",      type: "team" },
  team_disposals:    { label: "Which team gets more disposals?",      stat: "disposals",  type: "team" },
  team_marks:        { label: "Which team takes more marks?",         stat: "marks",      type: "team" },
  team_free_kicks:   { label: "Which team gets more free kicks?",     stat: "freesFor",   type: "team" },
  team_hitouts:      { label: "Which team wins the hitout count?",    stat: "hitouts",    type: "team" },
  team_clearances:   { label: "Which team gets more clearances?",     stat: "clearances", type: "team" },
  team_inside50s:    { label: "Which team gets more inside 50s?",     stat: "inside50s",  type: "team" },
  player_disposals:  { label: "Player to record the most disposals",  stat: "disposals",  type: "player" },
  player_goals:      { label: "Player to kick the most goals",        stat: "goals",      type: "player" },
  player_marks:      { label: "Player to take the most marks",        stat: "marks",      type: "player" },
  player_tackles:    { label: "Player to make the most tackles",      stat: "tackles",    type: "player" },
  player_hitouts:    { label: "Player to record the most hitouts",    stat: "hitouts",    type: "player" },
  player_clearances: { label: "Player to record the most clearances", stat: "clearances", type: "player" },
  player_foopy:      { label: "Player with the highest Foopy rating", stat: "foopy",      type: "player" },
};

type Poll = {
  id: string;
  question: string;
  poll_type: "team" | "player";
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
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

    // Compute XP earned per user from correct votes
    const xpMap: Record<string, number> = {};
    for (const poll of polls) {
      const winner = resolveWinner(poll, homeStats, awayStats, homeTeam, awayTeam);
      if (!winner) continue;
      const winOpt = poll.options.find(o => pollOptionMatchesWinner(o.label, winner));
      if (!winOpt) continue;
      const xp = poll.options.length >= 4 ? 20 : poll.options.length === 3 ? 15 : 10;
      for (const v of allVotes) {
        if (v.poll_id === poll.id && v.option_id === winOpt.id) {
          xpMap[v.user_id] = (xpMap[v.user_id] ?? 0) + xp;
        }
      }
    }

    const top10 = Object.entries(xpMap)
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

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
      <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,.1)", borderTop: "2px solid #fbbf24", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );
  if (entries.length === 0) return null;

  return (
    <div style={{ background: "rgba(251,191,36,0.06)", border: "1.5px solid rgba(251,191,36,0.2)", borderRadius: 18, overflow: "hidden", marginBottom: 4 }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#fbbf24", letterSpacing: "0.04em" }}>POLL LEADERBOARD</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>XP from polls</span>
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderBottom: i < entries.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              background: i === 0 ? "rgba(251,191,36,0.05)" : "transparent",
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
            <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", border: `2px solid ${isTop3 ? medalColor : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)" }}>
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
            <div style={{ flexShrink: 0, background: isTop3 ? `rgba(${i === 0 ? "251,191,36" : i === 1 ? "148,163,184" : "205,124,50"},0.15)` : "rgba(255,255,255,0.07)", border: `1px solid ${isTop3 ? medalColor + "44" : "rgba(255,255,255,0.1)"}`, borderRadius: 999, padding: "4px 10px" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: isTop3 ? (i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : "#cd7c32") : "rgba(255,255,255,0.6)" }}>
                +{e.xp} XP
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
  const { awardXP } = useXP();

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

  // Award XP for correct poll votes when game is FINAL
  useEffect(() => {
    if (status !== "FINAL" || polls.length === 0 || Object.keys(userVotes).length === 0) return;
    for (const poll of polls) {
      const myVoteOptionId = userVotes[poll.id];
      if (!myVoteOptionId) continue;
      const winner = resolveWinner(poll, homeStats, awayStats, homeTeam, awayTeam);
      if (!winner) continue;
      const myOption = poll.options.find(o => o.id === myVoteOptionId);
      if (!myOption) continue;
      if (!pollOptionMatchesWinner(myOption.label, winner)) continue;
      const optionCount = poll.options.length;
      const xpOverride = optionCount >= 4 ? 20 : optionCount === 3 ? 15 : 10;
      awardXP("poll_correct", { pollId: poll.id, xpOverride });
    }
  }, [status, polls, userVotes, homeStats, awayStats, homeTeam, awayTeam, awardXP]);

  async function vote(pollId: string, optionId: string) {
    if (!userId) return;
    const existingVote = userVotes[pollId];
    // Allow changing vote before the game starts; block re-votes once live/final
    if (existingVote && status !== "UPCOMING") return;
    if (existingVote === optionId) return; // tapping the same option — no-op
    if (existingVote) {
      // Delete old vote then insert new one
      await supabase.from("match_poll_votes").delete().eq("poll_id", pollId).eq("user_id", userId);
    }
    await supabase.from("match_poll_votes").insert({ poll_id: pollId, option_id: optionId, user_id: userId });
    await loadPolls();
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
          <div style={{ width: 24, height: 24, border: "2px solid rgba(255,255,255,.1)", borderTop: "2px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : polls.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", color: "#94a3b8", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>No polls yet</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Check back soon!</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
          {status === "FINAL" && polls.length > 0 && (
            <PollLeaderboard
              polls={polls}
              allVotes={allVotes}
              homeStats={homeStats}
              awayStats={awayStats}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          )}
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

  const optionColor = (label: string) => {
    const c = pollOptionColors(label, poll.poll_type);
    return String((c as any).background ?? "#6d28d9");
  };

  return (
    <div style={pollCardStyle}>
      {/* ── Poll header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <rect x="18" y="4" width="4" height="16" rx="1" />
              <rect x="10" y="9" width="4" height="11" rx="1" />
              <rect x="2" y="13" width="4" height="7" rx="1" />
            </svg>
          </div>
          {isLivePoll && canVote
            ? <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.13)", border: "1px solid rgba(34,197,94,0.32)", borderRadius: 999, padding: "3px 9px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: "#22c55e", letterSpacing: "0.08em" }}>LIVE · Q{poll.quarter}</span>
              </div>
            : isLivePoll
            ? <span style={{ fontSize: 10, fontWeight: 900, color: "#64748b", letterSpacing: "0.06em" }}>Q{poll.quarter} · CLOSED</span>
            : <span style={{ fontSize: 13, fontWeight: 900, color: "#a78bfa", letterSpacing: "0.08em" }}>POLL</span>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{totalVotes} votes</span>
          {onDelete && (
            <button onClick={onDelete} style={{ background: "rgba(255,255,255,.07)", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: "4px 7px", borderRadius: 6, lineHeight: 1, marginLeft: 4 }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Question ── */}
      <div style={{ marginBottom: 16 }}>
        <span style={pollQuestionStyle}>{poll.question}</span>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginTop: 4 }}>
          {votingLocked
            ? isLivePoll ? "Voting closed — quarter ended" : "Voting closed — game has started"
            : canChangeVote ? "Tap to change your vote"
            : hasVoted ? "" : "Tap to vote"}
        </div>
      </div>

      {/* ── Options ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(opt => {
          const count = voteCounts[opt.id] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = userVote === opt.id;
          const isWinner = showResults && pollOptionMatchesWinner(opt.label, winner);
          const color = optionColor(opt.label);
          const selected = isMyVote;
          const showBar = showResults || hasVoted || votingLocked;
          const wrong = showResults && selected && winner !== null && !isWinner;
          const dimmed = showResults && winner !== null && !isWinner && !selected;

          const inner = (
            <>
              {/* Radio */}
              <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: `2px solid ${wrong ? "#ef4444" : selected ? color : "rgba(255,255,255,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.2s" }}>
                {selected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: wrong ? "#ef4444" : color }} />}
              </div>
              {/* Logo / avatar */}
              <PollOptionInner label={opt.label} pollType={poll.poll_type} winner={isWinner} myVote={isMyVote && !isWinner} />
              {/* Bar + % */}
              {showBar && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width 0.5s cubic-bezier(.4,0,.2,1)" }} />
                  </div>
                </div>
              )}
              {showBar && (
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: isWinner ? "#22c55e" : wrong ? "#ef4444" : selected ? color : "#64748b", lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, marginTop: 2 }}>{count} votes</div>
                </div>
              )}
            </>
          );

          if (showBar) {
            if (canChangeVote) {
              return (
                <button key={opt.id} type="button" onClick={() => onVote(opt.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${wrong ? "#ef4444" : selected ? color : "rgba(255,255,255,0.1)"}`, background: wrong ? "rgba(239,68,68,.12)" : selected ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer", width: "100%", textAlign: "left", opacity: dimmed ? 0.35 : 1, transition: "border-color 0.2s, background 0.2s" }}>
                  {inner}
                </button>
              );
            }
            return (
              <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${wrong ? "#ef4444" : selected ? color : "rgba(255,255,255,0.1)"}`, background: wrong ? "rgba(239,68,68,.12)" : selected ? `${color}18` : "rgba(255,255,255,0.03)", opacity: dimmed ? 0.35 : 1 }}>
                {inner}
              </div>
            );
          }

          return (
            <button key={opt.id} type="button" onClick={() => onVote(opt.id)} disabled={!canVote && !canChangeVote}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${wrong ? "#ef4444" : selected ? color : "rgba(255,255,255,0.1)"}`, background: wrong ? "rgba(239,68,68,.12)" : selected ? `${color}18` : "rgba(255,255,255,0.03)", cursor: (canVote || canChangeVote) ? "pointer" : "default", opacity: dimmed ? 0.35 : (canVote || canChangeVote) ? 1 : 0.5, width: "100%", textAlign: "left", transition: "border-color 0.2s, background 0.2s" }}>
              {inner}
            </button>
          );
        })}
      </div>

      {/* Comments button — opens full-screen comment page */}
      <button
        onClick={() => {
          const cat = poll.category_key ? POLL_CATEGORIES[poll.category_key] : null;
          const statsStr = cat ? sorted.map(opt => {
            let val: number | string = "–";
            if (cat.type === "player") {
              const ps = [...homeStats, ...awayStats].find(p =>
                ((p as any).name || (p as any).player || "").toLowerCase() === opt.label.toLowerCase()
              );
              if (ps) val = cat.stat === "foopy" ? foopyRating(ps) : num(ps[cat.stat as keyof PlayerStat]);
            } else {
              const isHome = normaliseTeamKey(opt.label) === normaliseTeamKey(homeTeam);
              const isAway = normaliseTeamKey(opt.label) === normaliseTeamKey(awayTeam);
              if (isHome) val = homeStats.reduce((s, p) => s + num(p[cat.stat as keyof PlayerStat]), 0);
              else if (isAway) val = awayStats.reduce((s, p) => s + num(p[cat.stat as keyof PlayerStat]), 0);
            }
            return `${opt.label}:${val}`;
          }).join(",") : "";
          const params = new URLSearchParams({
            label: poll.question,
            ...(cat ? { stat: cat.stat, pollType: poll.poll_type } : {}),
            ...(statsStr ? { stats: statsStr } : {}),
          });
          router.push(`/match/${gameId}/poll_${poll.id}?${params}`);
        }}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "12px 2px 0", fontSize: 12, fontWeight: 800, color: "#64748b", cursor: "pointer", width: "100%" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Comments
        {(commentCount ?? 0) > 0 && (
          <span style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa", background: "rgba(167,139,250,0.15)", borderRadius: 999, padding: "1px 7px" }}>
            {commentCount}
          </span>
        )}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
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

  const canSubmit = selectedKey && selectedCat && (selectedCat.type === "team" || selectedPlayers.length >= 2);

  const [submitError, setSubmitError] = useState("");

  async function submit() {
    if (!canSubmit || !selectedCat) return;
    setSubmitting(true);
    setSubmitError("");
    const options = selectedCat.type === "team" ? [homeTeam, awayTeam] : selectedPlayers;

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

  return (
    <div style={createFormStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: "#f8fafc" }}>Create Poll</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>

      {/* Category picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Teams</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {teamCats.map(([key, cat]) => (
            <button key={key} onClick={() => { setSelectedKey(key); setSelectedPlayers([]); }}
              style={{ padding: "10px 12px", borderRadius: 10, background: selectedKey === key ? "rgba(59,130,246,.18)" : "rgba(255,255,255,.05)", border: selectedKey === key ? "1px solid rgba(59,130,246,.5)" : "1px solid rgba(255,255,255,.08)", color: selectedKey === key ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: selectedKey === key ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
              {cat.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Players</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {playerCats.map(([key, cat]) => (
            <button key={key} onClick={() => { setSelectedKey(key); setSelectedPlayers([]); }}
              style={{ padding: "10px 12px", borderRadius: 10, background: selectedKey === key ? "rgba(59,130,246,.18)" : "rgba(255,255,255,.05)", border: selectedKey === key ? "1px solid rgba(59,130,246,.5)" : "1px solid rgba(255,255,255,.08)", color: selectedKey === key ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: selectedKey === key ? 800 : 600, cursor: "pointer", textAlign: "left" }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Player picker (shown when a player category is selected) */}
      {selectedCat?.type === "player" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pick players to include</div>
          {selectedPlayers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {selectedPlayers.map(name => (
                <button key={name} onClick={() => togglePlayer(name)}
                  style={{ padding: "5px 10px", borderRadius: 999, background: "#3b82f6", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {name} ✕
                </button>
              ))}
            </div>
          )}
          <input
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "#f8fafc", fontSize: 13, padding: "8px 12px", outline: "none", fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredPlayers.map(p => {
              const sel = selectedPlayers.includes(p.name);
              return (
                <button key={`${p.name}-${p.team}`} onClick={() => togglePlayer(p.name)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: sel ? "rgba(59,130,246,.2)" : "transparent", border: sel ? "1px solid rgba(59,130,246,.4)" : "1px solid transparent", color: sel ? "#60a5fa" : "#e2e8f0", fontSize: 13, fontWeight: sel ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, minWidth: 32 }}>{getAbbr(p.team)}</span>
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
        style={{ width: "100%", padding: 12, borderRadius: 12, background: "#3b82f6", color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", opacity: (!canSubmit || submitting) ? 0.4 : 1 }}
      >
        {submitting ? "Creating…" : "Create Poll"}
      </button>
    </div>
  );
}

function pollOptionColors(label: string, pollType: string): React.CSSProperties {
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
  if (pollType === "team") {
    const logo = getLogo(label);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <img src={logo} alt={label} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
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
      <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${colors.primary}` }}>
        <img src={img} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
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
        color: "#fff",
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
const pollCardStyle: CSSProperties = { background: "#070707", border: "1px solid rgba(255,255,255,.12)", borderRadius: 20, padding: "18px 16px", boxShadow: "0 6px 28px rgba(0,0,0,.45)" };
const pollQuestionStyle: CSSProperties = { fontSize: 18, fontWeight: 900, color: "#f8fafc", lineHeight: 1.3, display: "block", letterSpacing: "-0.02em" };
const pollResultRowStyle: CSSProperties = { padding: "0" };
const pollOptionBtnStyle: CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.03)", border: "1.5px solid rgba(255,255,255,.1)", color: "#e2e8f0", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", transition: "background 0.15s, border-color 0.15s" };
const createFormStyle: CSSProperties = { margin: "0 16px 16px", padding: "16px", borderRadius: 16, background: "#0c0c0f", border: "1px solid rgba(255,255,255,.1)" };
const pollTypeToggleStyle: CSSProperties = { flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" };

const roundStripShellStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "10px 12px",
  paddingTop: "calc(env(safe-area-inset-top) + 10px)",
  background: "#050505",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  scrollSnapType: "x mandatory",
};

const roundMiniBoxStyle: CSSProperties = {
  position: "relative",
  flex: "0 0 118px",
  minHeight: 62,
  padding: "7px 8px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.1)",
  color: "#f8fafc",
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
  color: "#64748b",
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

const pageStyle: CSSProperties = { minHeight: "100dvh", background: "#000", color: "#f8fafc", paddingBottom: "calc(90px + env(safe-area-inset-bottom))" };
const matchCentreStyle: CSSProperties = { width: "100%", maxWidth: 760, margin: "0 auto", background: "#020202", minHeight: "100vh", borderLeft: "1px solid rgba(255,255,255,.1)", borderRight: "1px solid rgba(255,255,255,.1)" };
// (scoreboard + tab styles now inline in JSX)
const sectionStyle: CSSProperties = { padding: "18px", borderBottom: "1px solid rgba(255,255,255,.1)" };
const sectionHeadingStyle: CSSProperties = { margin: "0 0 14px", textAlign: "center", fontSize: 18, fontWeight: 950 };
const feedCardStyle: CSSProperties = { padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.08)" };
const feedTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#9ca3af", fontSize: 13, fontWeight: 800 };
const feedScoreStyle: CSSProperties = { display: "inline-flex", alignItems: "center" };
const tinyLogoStyle: CSSProperties = { width: 16, height: 16, objectFit: "contain", verticalAlign: "middle", margin: "0 5px" };
const miniLogoStyle: CSSProperties = { width: 14, height: 14, objectFit: "contain" };
const statsLoadingStyle: CSSProperties = { margin: "12px 0 0", color: "#facc15", fontSize: 13, fontWeight: 800 };
const liveStatsBadgeStyle: CSSProperties = { width: "fit-content", margin: "0 auto 14px", padding: "7px 12px", borderRadius: 999, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)", color: "#4ade80", fontSize: 12, fontWeight: 1000, letterSpacing: ".08em" };
const liveFeedListStyle: CSSProperties = { marginTop: 12, display: "flex", flexDirection: "column", gap: 20 };
const liveFeedBoxStyle: CSSProperties = { minHeight: 86, display: "grid", gridTemplateColumns: "68px 1fr auto", alignItems: "center", gap: 14, background: "#020202", borderRadius: 18, padding: "11px 16px 11px 12px", overflow: "hidden" };
const liveFeedInfoStyle: CSSProperties = { minWidth: 0 };
const liveFeedNameStyle: CSSProperties = { color: "#f8fafc", fontSize: 18, fontWeight: 1000, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const liveFeedActionStyle: CSSProperties = { marginTop: 8, fontSize: 28, lineHeight: 1, fontWeight: 1000, letterSpacing: ".08em" };
const liveFeedRightStyle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 6 };
const liveFeedScoreRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5 };
const liveFeedScoreTextStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" };
const liveFeedTimeBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: "3px 8px" };
const liveFeedQuarterStyle: CSSProperties = { fontSize: 11, fontWeight: 900, color: "#94a3b8", letterSpacing: "0.02em" };
const liveFeedTimeDotStyle: CSSProperties = { fontSize: 11, color: "#334155", fontWeight: 700 };
const liveFeedMinuteStyle: CSSProperties = { fontSize: 11, fontWeight: 900, color: "#94a3b8" };
const commentBubbleBtnStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#9ca3af", padding: "2px 0", fontSize: 12, fontWeight: 700 };
const commentCountStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: "#9ca3af" };
const playerBubbleStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, color: "#475569", fontSize: 11, fontWeight: 700 };
const playerAvatarWrapStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0
};
const playerAvatarImageStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const playerInitialsStyle: CSSProperties = { color: "#fff", fontSize: 18, fontWeight: 1000 };
const emptyFeedStyle: CSSProperties = { marginTop: 12, background: "#070707", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 16, color: "#9ca3af" };
const countdownBoxStyle: CSSProperties = {
  margin: "18px 0 8px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};
const countdownLabelStyle: CSSProperties = { color: "#facc15", fontSize: 11, fontWeight: 1000, letterSpacing: ".16em" };
const countdownTimeStyle: CSSProperties = { marginTop: 8, color: "#fff", fontSize: 36, lineHeight: 1, fontWeight: 1000, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" };
const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,.15)", whiteSpace: "nowrap", fontSize: 13 };
const thPlayerStyle: CSSProperties = { ...thStyle, minWidth: 230 };
const tdStyle: CSSProperties = { padding: "20px 10px", borderBottom: "1px solid rgba(255,255,255,.08)", whiteSpace: "nowrap", fontSize: 16, fontWeight: 800 };
const tdPlayerStyle: CSSProperties = { ...tdStyle, fontWeight: 900, fontSize: 17, color: "#f8fafc", minWidth: 230 };
const playerNameCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const ratingPillStyle: CSSProperties = { display: "inline-block", minWidth: 64, padding: "8px 12px", borderRadius: 10, color: "#fff", fontWeight: 1000, fontSize: 16, border: "2px solid #000", textAlign: "center" };
const statSwitchWrapStyle: CSSProperties = { display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 };
const statSwitchStyle: CSSProperties = { appearance: "none", border: "1px solid rgba(255,255,255,.16)", background: "#070707", color: "#9ca3af", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 950, cursor: "pointer" };
const activeStatSwitchStyle: CSSProperties = { ...statSwitchStyle, background: "#0ea5e9", color: "#fff", border: "1px solid #38cfff" };
const noStatsStyle: CSSProperties = { background: "#070707", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 16, color: "#9ca3af", display: "flex", flexDirection: "column", gap: 6 };
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
const barShellStyle: CSSProperties = { display: "flex", height: 9, overflow: "hidden", borderRadius: 999, background: "#111827" };
const barLeftStyle: CSSProperties = { height: "100%" };
const barRightStyle: CSSProperties = { height: "100%" };
const freeKickBoxStyle: CSSProperties = { marginTop: 22, background: "#070707", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 16 };
const freeKickTitleStyle: CSSProperties = { textAlign: "center", color: "#9ca3af", fontWeight: 1000, marginBottom: 12 };
const freeKickMainStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const freeKickTeamStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const freeKickTeamRightStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" };
const freeKickLogoStyle: CSSProperties = { width: 36, height: 36, objectFit: "contain", borderRadius: "50%", padding: "3px" };
const freeKickAbbrStyle: CSSProperties = { color: "#9ca3af", fontWeight: 900 };
const freeKickNumberStyle: CSSProperties = { fontSize: 22, fontWeight: 1000 };
const freeKickMiddleStyle: CSSProperties = { color: "#64748b", fontWeight: 1000 };
const freeKickBarShellStyle: CSSProperties = { display: "flex", height: 9, overflow: "hidden", borderRadius: 999, marginTop: 14, background: "#111827" };
const freeKickBarLeftStyle: CSSProperties = { height: "100%" };
const freeKickBarRightStyle: CSSProperties = { height: "100%" };
const freeKickMessageStyle: CSSProperties = { marginTop: 12, textAlign: "center", color: "#facc15", fontWeight: 900 };
