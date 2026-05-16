"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import matchStatsRaw from "./data/game-stats.json";
import playerStatsRaw from "./data/players.json";
import { API_SPORTS_MATCH_IDS } from "./data/apiSportsMatchIds";
import { getGames, getGamesCached, invalidateGames } from "./lib/gameCache";
import { foopyRating } from "./match/[id]/utils";
import { haptic } from "./lib/haptic";
import { supabase } from "./lib/supabase";

type Game = {
  id: number;
  round: number;
  hteam?: string;
  ateam?: string;
  hteamid?: number;
  ateamid?: number;
  hscore?: number | null;
  ascore?: number | null;
  hgoals?: number | null;
  hbehinds?: number | null;
  agoals?: number | null;
  abehinds?: number | null;
  venue?: string;
  timestr?: string;
  complete?: number;
  date?: string;
  is_final?: number;
};

type TopPlayer = {
  name: string;
  team?: string;
  image: string;
  rating: number;
  teamColor: string;
};

type PlayerStatsPlayer = {
  name?: string;
  player?: string;
  club?: string;
  team?: string;
  image?: string;
  imagePath?: string;
  playerImage?: string;
  apiSportsId?: number;
  eventIds?: unknown;
  statsIds?: unknown;
};

const TEAM_NAMES: Record<number, string> = {
  1: "Adelaide",
  2: "Brisbane Lions",
  3: "Carlton",
  4: "Collingwood",
  5: "Essendon",
  6: "Fremantle",
  7: "Geelong Cats",
  8: "Gold Coast",
  9: "GWS",
  10: "Hawthorn",
  11: "Melbourne",
  12: "North Melbourne",
  13: "Port Adelaide",
  14: "Richmond",
  15: "St Kilda",
  16: "Sydney",
  17: "West Coast",
  18: "Western Bulldogs",
};

const TEAM_STYLES: Record<number, { colors: string[]; logo: string }> = {
  1: { colors: ["#002b5c", "#c8102e", "#ffd200"], logo: "/team-logos/crows.png" },
  2: { colors: ["#7a003c", "#fbbf24", "#1e3a8a"], logo: "/team-logos/lions.png" },
  3: { colors: ["#031a35", "#0b3b75"], logo: "/team-logos/blues.png" },
  4: { colors: ["#ffffff", "#111111"], logo: "/team-logos/magpies.png" },
  5: { colors: ["#111111", "#ed1b2f"], logo: "/team-logos/bombers.png" },
  6: { colors: ["#4b1979", "#ffffff"], logo: "/team-logos/dockers.png" },
  7: { colors: ["#ffffff", "#003b73"], logo: "/team-logos/cats.png" },
  8: { colors: ["#ff1f2d", "#ffd200"], logo: "/team-logos/suns.png" },
  9: { colors: ["#f15a22", "#343434"], logo: "/team-logos/giants.png" },
  10: { colors: ["#8b4a24", "#fbbf24"], logo: "/team-logos/hawks.png" },
  11: { colors: ["#c8102e", "#001f54"], logo: "/team-logos/demons.png" },
  12: { colors: ["#0055a4", "#ffffff"], logo: "/team-logos/kangaroos.png" },
  13: { colors: ["#00a9b7", "#111111", "#ffffff"], logo: "/team-logos/power.png" },
  14: { colors: ["#111111", "#ffd200"], logo: "/team-logos/tigers.png" },
  15: { colors: ["#ed1b2f", "#ffffff", "#111111"], logo: "/team-logos/saints.png" },
  16: { colors: ["#ed171f", "#ffffff"], logo: "/team-logos/swans.png" },
  17: { colors: ["#003087", "#f2a900"], logo: "/team-logos/eagles.png" },
  18: { colors: ["#2b6edc", "#ffffff", "#ed1b2f"], logo: "/team-logos/bulldogs.png" },
};

function mixColor(a: string, b: string, amount: number) {
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = parseInt(ah.substring(0, 2), 16);
  const ag = parseInt(ah.substring(2, 4), 16);
  const ab = parseInt(ah.substring(4, 6), 16);
  const br = parseInt(bh.substring(0, 2), 16);
  const bg = parseInt(bh.substring(2, 4), 16);
  const bb = parseInt(bh.substring(4, 6), 16);
  const rr = Math.round(ar + amount * (br - ar));
  const rg = Math.round(ag + amount * (bg - ag));
  const rb = Math.round(ab + amount * (bb - ab));
  return `rgb(${rr}, ${rg}, ${rb})`;
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

function getStatus(game: Game) {
  if ((game.complete ?? 0) >= 100 || game.is_final === 1) return "COMPLETED";
  if ((game.complete ?? 0) > 0) return "LIVE";
  return "UPCOMING";
}

function getDayLabel(date: string, showDate = false): string {
  const gameDate = new Date(date);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(gameDate, today)) return "Today";
  if (sameDay(gameDate, tomorrow)) return "Tomorrow";
  if (showDate) return gameDate.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  return gameDate.toLocaleString("en-AU", { weekday: "short" });
}

function getTime(game: Game, showDate = false) {
  const status = getStatus(game);

  if (status === "COMPLETED") return "Full Time";

  if (status === "LIVE") {
    if (game.timestr) return game.timestr;
    return "Live";
  }

  if (game.timestr) {
    if (!game.date) return game.timestr;

    const dayLabel = getDayLabel(game.date, showDate);
    const spaceIdx = game.timestr.indexOf(" ");
    const timePart = spaceIdx >= 0 ? game.timestr.slice(spaceIdx + 1) : game.timestr;

    return `${dayLabel} ${timePart}`;
  }

  if (!game.date) return "TBA";

  const dayLabel = getDayLabel(game.date, showDate);
  const timePart = new Date(game.date).toLocaleString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dayLabel} ${timePart}`;
}


function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

function formatMobileDateLabel(date?: string) {
  if (!date) return "TBA";

  const gameDate = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(gameDate, today)) return "Today";
  if (sameDay(gameDate, yesterday)) return "Yesterday";
  if (sameDay(gameDate, tomorrow)) return "Tomorrow";

  return gameDate.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getMobileScoreText(game: Game, isUpcoming: boolean) {
  if (isUpcoming) return getTime(game).replace(/^.*?,\s*/, "");
  return `${game.hscore ?? 0} - ${game.ascore ?? 0}`;
}

function idListIncludes(ids: unknown, target: number) {
  if (!Array.isArray(ids)) return false;
  return ids.map(Number).includes(target);
}

function makeTeamGradient(colors: string[]) {
  if (colors.length === 1) return colors[0];
  return `linear-gradient(90deg, ${colors.join(", ")})`;
}

function getTeamRecord(teamId: number, games: Game[], beforeGame: Game) {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  const beforeTime = beforeGame.date ? new Date(beforeGame.date).getTime() : Infinity;

  games.forEach((game) => {
    if (getStatus(game) !== "COMPLETED") return;

    const gameTime = game.date ? new Date(game.date).getTime() : 0;
    if (gameTime >= beforeTime) return;

    const isHome = game.hteamid === teamId;
    const isAway = game.ateamid === teamId;

    if (!isHome && !isAway) return;

    const homeScore = game.hscore ?? 0;
    const awayScore = game.ascore ?? 0;

    if (homeScore === awayScore) {
      draws += 1;
      return;
    }

    const teamWon = isHome ? homeScore > awayScore : awayScore > homeScore;

    if (teamWon) wins += 1;
    else losses += 1;
  });

  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

function getInitials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function slugName(name: string) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function clubToPlayerFolder(club: string) {
  const map: Record<string, string> = {
    Adelaide: "crows",
    "Adelaide Crows": "crows",
    Brisbane: "lions",
    "Brisbane Lions": "lions",
    Carlton: "blues",
    "Carlton Blues": "blues",
    Collingwood: "magpies",
    "Collingwood Magpies": "magpies",
    Essendon: "bombers",
    "Essendon Bombers": "bombers",
    Fremantle: "dockers",
    "Fremantle Dockers": "dockers",
    Geelong: "cats",
    "Geelong Cats": "cats",
    "Gold Coast": "suns",
    "Gold Coast Suns": "suns",
    GWS: "giants",
    "GWS Giants": "giants",
    "Greater Western Sydney": "giants",
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

  return map[club] ?? slugName(club);
}

function findPlayerInfo(playerName: string) {
  return (playerStatsRaw as PlayerStatsPlayer[]).find(
    (p) =>
      String(p.name || p.player || "").toLowerCase().trim() ===
      String(playerName || "").toLowerCase().trim()
  );
}

function playerImagePath(playerName: string, team?: string) {
  const found = findPlayerInfo(playerName);
  const club = found?.club ?? found?.team ?? team ?? "";
  const folder = clubToPlayerFolder(club);

  const image =
    found?.image ||
    found?.imagePath ||
    found?.playerImage ||
    `${slugName(playerName)}.png`;

  if (!folder || !image) return "";
  if (String(image).startsWith("/")) return String(image);

  return `/players/${folder}/${image}`;
}

function normalizeTeam(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function displayTeamName(name?: string) {
  const text = String(name || "").trim();
  const clean = normalizeTeam(text);

  if (clean === "greaterwesternsydney" || clean === "greaterwesternsydneygiants" || clean === "gwsgiants") {
    return "GWS";
  }

  return text;
}

function getTeamIdFromName(team?: string) {
  const clean = normalizeTeam(String(team || ""));

  const aliases: Record<string, number> = {
    adelaide: 1,
    adelaidecrows: 1,
    brisbane: 2,
    brisbanelions: 2,
    lions: 2,
    carlton: 3,
    carltonblues: 3,
    collingwood: 4,
    collingwoodmagpies: 4,
    essendon: 5,
    essendonbombers: 5,
    fremantle: 6,
    fremantledockers: 6,
    geelong: 7,
    geelongcats: 7,
    goldcoast: 8,
    goldcoastsuns: 8,
    gws: 9,
    gwsgiants: 9,
    greaterwesternsydney: 9,
    greaterwesternsydneygiants: 9,
    hawthorn: 10,
    hawthornhawks: 10,
    melbourne: 11,
    melbournedemons: 11,
    northmelbourne: 12,
    northmelbournekangaroos: 12,
    portadelaide: 13,
    portadelaidepower: 13,
    richmond: 14,
    richmondtigers: 14,
    stkilda: 15,
    stkildasaints: 15,
    sydney: 16,
    sydneyswans: 16,
    westcoast: 17,
    westcoasteagles: 17,
    westernbulldogs: 18,
    bulldogs: 18,
  };

  const aliased = aliases[clean];
  if (aliased) return aliased;

  const found = Object.entries(TEAM_NAMES).find(([, name]) => normalizeTeam(name) === clean);
  return found ? Number(found[0]) : null;
}

function getTeamLogoFromName(team?: string) {
  const id = getTeamIdFromName(team);
  if (!id) return "";
  return TEAM_STYLES[id]?.logo || "";
}

function hexLuminance(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function getTeamColorFromName(team?: string) {
  const id = getTeamIdFromName(team);
  if (!id) return "#111827";
  const colors = TEAM_STYLES[id]?.colors ?? [];
  return colors.find((c) => hexLuminance(c) < 180) ?? colors[0] ?? "#111827";
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<"1" | "3">("3");
  const [hasLoadedSavedRound, setHasLoadedSavedRound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullVisible, setPullVisible] = useState(false);
  const roundRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef(0);
  const isMobile = useIsMobile();

  const listStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : columns === "1"
      ? "1fr"
      : "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
    alignItems: "stretch",
  };

  useEffect(() => {
    // Ref ensures round is set only once — cached load shouldn't be overridden by fresh load
    const roundSetRef = { current: false };

    function applyGames(allGames: Game[]) {
      setGames(allGames);
      if (!roundSetRef.current) {
        const liveGame = allGames.find((g) => (g.complete ?? 0) > 0 && (g.complete ?? 0) < 100);
        const nextGame = allGames.find((g) => (g.complete ?? 0) < 100);
        const latestGame = [...allGames].reverse().find((g) => (g.complete ?? 0) >= 100);
        setSelectedRound(liveGame?.round ?? nextGame?.round ?? latestGame?.round ?? 1);
        roundSetRef.current = true;
        setHasLoadedSavedRound(true);
      }
    }

    // Step 1: Show cached data instantly (no skeleton flash on repeat visits)
    const cached = getGamesCached() as Game[] | null;
    if (cached && cached.length > 0) {
      applyGames(cached);
      setLoading(false);
    }

    // Step 2: Fetch fresh data in background
    getGames()
      .then((data) => {
        applyGames(data as Game[]);
        setLoading(false);
      })
      .catch(() => {
        setHasLoadedSavedRound(true);
        setLoading(false);
      });

    const saved = localStorage.getItem("foopy_game_columns");
    if (saved === "1" || saved === "3") {
      setColumns(saved as "1" | "3");
    }
  }, []);

  // Auto-poll quickly so live scores stay current without refreshing hidden tabs
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      getGames()
        .then(data => setGames(data as Game[]))
        .catch(() => {});
    }, 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = () => {
      const saved = localStorage.getItem("foopy_game_columns");
      if (saved === "1" || saved === "3") setColumns(saved);
    };

    window.addEventListener("storage", handler);
    window.addEventListener("foopy-settings-changed", handler);

    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("foopy-settings-changed", handler);
    };
  }, []);

  // Pull-to-refresh touch handlers
  useEffect(() => {
    const THRESHOLD = 72;

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (window.scrollY > 0) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 20) setPullVisible(true);
    }

    function onTouchEnd(e: TouchEvent) {
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      setPullVisible(false);
      if (delta >= THRESHOLD && window.scrollY === 0 && !refreshing) {
        haptic("medium");
        setRefreshing(true);
        invalidateGames();
        getGames()
          .then((data) => setGames(data as Game[]))
          .finally(() => setRefreshing(false));
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing]);

  useEffect(() => {
    if (!hasLoadedSavedRound) return;

    const strip = roundRef.current;
    if (!strip) return;

    const btn = strip.querySelector<HTMLElement>("[data-selected='true']");
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedRound, hasLoadedSavedRound]);

  const currentRound = useMemo(() => {
    const live = games.find((g) => (g.complete ?? 0) > 0 && (g.complete ?? 0) < 100);
    const next = games.find((g) => (g.complete ?? 0) < 100);
    const latest = [...games].reverse().find((g) => (g.complete ?? 0) >= 100);

    return live?.round ?? next?.round ?? latest?.round ?? 1;
  }, [games]);

  const availableRounds = useMemo(() => {
    const rounds = Array.from(new Set(games.map((g) => g.round)))
      .filter((r) => r >= 0 && r <= 24)
      .sort((a, b) => a - b);

    return rounds.length ? rounds : Array.from({ length: 25 }, (_, i) => i);
  }, [games]);

  const shownGames = useMemo(() => {
    return games
      .filter((g) => Number(g.round) === Number(selectedRound) && g.round <= 24)
      .sort((a, b) => {
        const statusA = getStatus(a);
        const statusB = getStatus(b);

        if (statusA === "LIVE" && statusB !== "LIVE") return -1;
        if (statusA !== "LIVE" && statusB === "LIVE") return 1;

        return new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime();
      });
  }, [games, selectedRound]);

  const desktopGames = useMemo(() => {
    return [...shownGames].sort((a, b) => {
      const statusA = getStatus(a);
      const statusB = getStatus(b);

      const order = (s: string) => (s === "LIVE" ? 0 : s === "UPCOMING" ? 1 : 2);
      if (order(statusA) !== order(statusB)) return order(statusA) - order(statusB);

      return new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime();
    });
  }, [shownGames]);

  const mobileGroups = useMemo(() => {
    const groups: Array<{ label: string; games: Game[] }> = [];

    shownGames.forEach((game) => {
      const label = formatMobileDateLabel(game.date);
      const existing = groups.find((group) => group.label === label);
      if (existing) existing.games.push(game);
      else groups.push({ label, games: [game] });
    });

    return groups;
  }, [shownGames]);

  const roundStarted = shownGames.some((g) => getStatus(g) !== "UPCOMING");

  const topPlayers = useMemo(() => {
    type RawGameEntry = {
      teams?: Array<{
        team?: { id?: number };
        players?: Array<{
          player?: { id?: number };
          goals?: { total?: number; assists?: number };
behinds?: number;
disposals?: number;
kicks?: number;
handballs?: number;
marks?: number;
tackles?: number;
hitouts?: number;
clearances?: number;
free_kicks?: {
  for?: number;
  against?: number;
};
        }>;
      }>;
    };

    const bestByName = new Map<string, TopPlayer>();
    const matchData = matchStatsRaw as Record<string, RawGameEntry>;
    const playerData = playerStatsRaw as PlayerStatsPlayer[];

    const apiSportsIds = new Set(
      shownGames.map((g) => {
        const mapped = (API_SPORTS_MATCH_IDS as Record<string, string>)[String(g.id)];
        return mapped ?? String(g.id);
      })
    );

    for (const [gameKey, gameEntry] of Object.entries(matchData)) {
      if (!apiSportsIds.has(String(gameKey))) continue;

      for (const teamEntry of gameEntry.teams ?? []) {
        for (const rawPlayer of teamEntry.players ?? []) {
          const apiPlayerId = rawPlayer.player?.id;
          if (!apiPlayerId) continue;

          const found = playerData.find(
            (p) =>
              p.apiSportsId === apiPlayerId ||
              idListIncludes(p.eventIds, apiPlayerId) ||
              idListIncludes(p.statsIds, apiPlayerId)
          );

          if (!found) continue;

          const name = String(found.name || "").trim();
          if (!name) continue;

          const rating = foopyRating({
            goals: rawPlayer.goals?.total,
            goalAssists: rawPlayer.goals?.assists,
            behinds: rawPlayer.behinds,
            kicks: rawPlayer.kicks,
            handballs: rawPlayer.handballs,
            marks: rawPlayer.marks,
            tackles: rawPlayer.tackles,
            hitouts: rawPlayer.hitouts,
            disposals: rawPlayer.disposals,
            clearances: rawPlayer.clearances,
            freesFor: rawPlayer.free_kicks?.for,
            freesAgainst: rawPlayer.free_kicks?.against,
          });
          if (rating <= 0) continue;

          const playerTeam = found.team ?? found.club ?? "";
          const image = playerImagePath(name, playerTeam);

          const item: TopPlayer = {
            name,
            team: playerTeam,
            image,
            rating,
            teamColor: getTeamColorFromName(playerTeam),
          };

          const existing = bestByName.get(name);
          if (!existing || item.rating > existing.rating) {
            bestByName.set(name, item);
          }
        }
      }
    }

    return Array.from(bestByName.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10);
  }, [shownGames]);

  function chooseRound(round: number) {
    setSelectedRound(round);
  }

  return (
    <main style={pageStyle} className="page-enter">
      {/* Pull-to-refresh indicator */}
      <div className={`pull-indicator${pullVisible || refreshing ? " visible" : ""}`}>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: refreshing ? "spin 0.7s linear infinite" : undefined }}
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </div>

      <header style={headerStyle}>
        <div style={headerTopStyle}>
          <div style={logoWrapStyle}>
            <span style={logoTextStyle}>foopy</span>
          </div>

          <span style={roundBadgeStyle}>Rd {selectedRound}</span>
        </div>

        <div ref={roundRef} className="no-scrollbar" style={isMobile ? headerRoundsScroll : headerRoundsDesktop}>
          {availableRounds.map((round) => {
            const isSelected = selectedRound === round;
            const isCurrent = currentRound === round;

            return (
              <button
                key={round}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => chooseRound(round)}
                style={isMobile ? headerRoundItem : headerRoundItemDesktop}
              >
                <span
                  style={{
                    ...headerRoundText,
                    color: isSelected ? "#ffffff" : isCurrent ? "#60a5fa" : "#6b7280",
                    fontWeight: isSelected ? 950 : isCurrent ? 850 : 750,
                  }}
                >
                  {round === 0 ? "Opening Round" : `Round ${round}`}
                </span>

                {(isSelected || isCurrent) && (
                  <div
                    style={{
                      ...headerRoundUnderline,
                      background: isSelected ? "#ef4444" : "#3b82f6",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div style={{ height: "calc(92px + env(safe-area-inset-top))" }} />
      <section style={wrapStyle}>
        <div style={listStyle} className={loading ? undefined : "stagger"}>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="skeleton"
                style={{
                  ...cardStyle,
                  minHeight: 210,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "none",
                  pointerEvents: "none",
                }}
              />
            ))}

          {!loading &&
            !isMobile &&
            desktopGames.map((game) => {
              const homeId = game.hteamid;
              const awayId = game.ateamid;

              if (!homeId || !awayId) return null;

              const homeStyle = TEAM_STYLES[homeId];
              const awayStyle = TEAM_STYLES[awayId];

              if (!homeStyle || !awayStyle) return null;

              const homeScore = game.hscore ?? 0;
              const awayScore = game.ascore ?? 0;
              const status = getStatus(game);
              const isUpcoming = status === "UPCOMING";

              const homeWinning = homeScore > awayScore;
              const awayWinning = awayScore > homeScore;
              const homeLost = status === "COMPLETED" && homeScore < awayScore;
              const awayLost = status === "COMPLETED" && awayScore < homeScore;

              return (
                <Link
                  key={game.id}
                  href={`/match/${game.id}?from=home`}
                  prefetch={false}
                  className="card"
                  style={{
                    ...cardStyle,
                    border: status === "LIVE" ? "2px solid #22c55e" : cardStyle.border,
                    boxShadow:
                      status === "LIVE"
                        ? "0 0 0 1px rgba(34,197,94,.35), 0 18px 45px rgba(0,0,0,.22)"
                        : cardStyle.boxShadow,
                  }}
                >
                  <aside style={infoStyle}>
                    <div style={{ ...timeStyle, color: status === "LIVE" ? "#4ade80" : undefined }}>{getTime(game, selectedRound !== currentRound)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={venueStyle}>{game.venue || "Venue TBA"}</div>
                      {status === "LIVE" && <LiveViewerCount gameId={game.id} />}
                    </div>
                  </aside>

                  <section style={teamsStyle}>
                    <TeamRow
                      logo={homeStyle.logo}
                      name={displayTeamName(game.hteam || TEAM_NAMES[homeId])}
                      scoreText={isUpcoming ? getTeamRecord(homeId, games, game) : String(homeScore)}
                      goalsText={isUpcoming ? "W-L" : `${game.hgoals ?? 0}.${game.hbehinds ?? 0}`}
                      colourLine={makeTeamGradient(homeStyle.colors)}
                      faded={homeLost}
                      scoreColor={homeWinning ? "#3b82f6" : "white"}
                      isRecord={isUpcoming}
                    />

                    <TeamRow
                      logo={awayStyle.logo}
                      name={displayTeamName(game.ateam || TEAM_NAMES[awayId])}
                      scoreText={isUpcoming ? getTeamRecord(awayId, games, game) : String(awayScore)}
                      goalsText={isUpcoming ? "W-L" : `${game.agoals ?? 0}.${game.abehinds ?? 0}`}
                      colourLine={makeTeamGradient(awayStyle.colors)}
                      faded={awayLost}
                      scoreColor={awayWinning ? "#3b82f6" : "white"}
                      isRecord={isUpcoming}
                    />
                  </section>
                </Link>
              );
            })}

          {!loading &&
            isMobile &&
            mobileGroups.map((group) => (
              <div key={group.label} style={mobileGroupStyle}>
                <div style={mobileGroupLabelStyle}>{group.label}</div>

                {group.games.map((game) => {
                  const homeId = game.hteamid;
                  const awayId = game.ateamid;

                  if (!homeId || !awayId) return null;

                  const homeStyle = TEAM_STYLES[homeId];
                  const awayStyle = TEAM_STYLES[awayId];

                  if (!homeStyle || !awayStyle) return null;

                  const status = getStatus(game);
                  const isUpcoming = status === "UPCOMING";

                  return (
                    <Link
                      key={game.id}
                      href={`/match/${game.id}?from=home`}
                      prefetch={false}
                      className="card"
                      style={{
                        ...mobileMatchStyle,
                        borderColor: status === "LIVE" ? "rgba(34,197,94,.95)" : "rgba(255,255,255,.08)",
                      }}
                    >
                      <MobileMatchRow
                        homeLogo={homeStyle.logo}
                        awayLogo={awayStyle.logo}
                        homeName={displayTeamName(game.hteam || TEAM_NAMES[homeId])}
                        awayName={displayTeamName(game.ateam || TEAM_NAMES[awayId])}
                        homeScoreText={isUpcoming ? getTeamRecord(homeId, games, game) : String(game.hscore ?? 0)}
                        awayScoreText={isUpcoming ? getTeamRecord(awayId, games, game) : String(game.ascore ?? 0)}
                        homeGoalsText={isUpcoming ? "W-L" : `${game.hgoals ?? 0}.${game.hbehinds ?? 0}`}
                        awayGoalsText={isUpcoming ? "W-L" : `${game.agoals ?? 0}.${game.abehinds ?? 0}`}
                        homeColourLine={makeTeamGradient(homeStyle.colors)}
                        awayColourLine={makeTeamGradient(awayStyle.colors)}
                        timeText={getTime(game, selectedRound !== currentRound)}
                        venue={game.venue || "Venue TBA"}
                        homeLost={status === "COMPLETED" && (game.hscore ?? 0) < (game.ascore ?? 0)}
                        awayLost={status === "COMPLETED" && (game.ascore ?? 0) < (game.hscore ?? 0)}
                        isUpcoming={isUpcoming}
                        isLive={status === "LIVE"}
                        gameId={game.id}
                      />
                    </Link>
                  );
                })}
              </div>
            ))}

          {!loading && shownGames.length === 0 && (
            <div style={emptyBoxStyle}>No games found for Round {selectedRound}.</div>
          )}
        </div>

        {roundStarted && (
          <div style={topPlayersSectionStyle}>
            <div style={topPlayersHeaderStyle}>
              <h2 style={topPlayersTitleStyle}>Top Players</h2>
            </div>

            {topPlayers.length > 0 ? (
              <div style={topPlayersGridStyle} className="no-scrollbar">
                {topPlayers.map((player, index) => {
                  const logo = getTeamLogoFromName(player.team);
                  const hasImage = !!player.image;

                  return (
                    <div key={`${player.name}-${index}`} style={topPlayerTileStyle}>
                      <span style={topRankStyle}>{index + 1}</span>

                      <div style={topPlayerCircleWrapStyle}>
                        <div style={{ ...topPlayerCircleStyle, background: player.teamColor }}>
                          {hasImage && (
                            <img
                              src={player.image}
                              alt={player.name}
                              style={topPlayerImageStyle}
                              loading="eager"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (next) next.style.display = "grid";
                              }}
                            />
                          )}

                          <span
                            style={{
                              ...topPlayerInitialsStyle,
                              display: hasImage ? "none" : "grid",
                            }}
                          >
                            {getInitials(player.name)}
                          </span>
                        </div>

                        {logo && <img src={logo} alt="" style={topPlayerLogoStyle} loading="lazy" />}
                      </div>

                      <div style={{ ...topRatingRowStyle, background: foopyColor(player.rating) }}>
                        <strong>{player.rating.toFixed(1)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={noTopPlayersStyle}>No Foopy ratings found for Round {selectedRound}.</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function LiveViewerCount({ gameId }: { gameId: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const ch = supabase.channel(`match-viewers-${gameId}`, {
      config: { presence: { key: "" } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setCount(Object.keys(ch.presenceState()).length);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId]);

  if (count === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>{count}</span>
    </div>
  );
}

function MobileMatchRow({
  homeLogo,
  awayLogo,
  homeName,
  awayName,
  homeScoreText,
  awayScoreText,
  homeGoalsText,
  awayGoalsText,
  homeColourLine,
  awayColourLine,
  timeText,
  venue,
  homeLost,
  awayLost,
  isUpcoming,
  isLive,
  gameId,
}: {
  homeLogo: string;
  awayLogo: string;
  homeName: string;
  awayName: string;
  homeScoreText: string;
  awayScoreText: string;
  homeGoalsText: string;
  awayGoalsText: string;
  homeColourLine: string;
  awayColourLine: string;
  timeText: string;
  venue: string;
  homeLost: boolean;
  awayLost: boolean;
  isUpcoming: boolean;
  isLive: boolean;
  gameId: number;
}) {
  return (
    <div style={mobileMatchInnerStyle}>
      <div style={mobileMatchHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={mobileVenueStyle}>{venue}</div>
          {isLive && <LiveViewerCount gameId={gameId} />}
        </div>
        <strong style={{ ...mobileHeaderTimeStyle, color: isLive ? "#4ade80" : "#ffffff" }}>
          {isUpcoming ? timeText : isLive ? timeText : "Full Time"}
        </strong>
      </div>

      <div style={mobileTeamsStackStyle}>
        <MobileStackedTeamRow
          logo={homeLogo}
          name={homeName}
          goalsText={homeGoalsText}
          scoreText={homeScoreText}
          colourLine={homeColourLine}
          faded={homeLost}
          winning={!isUpcoming && Number(homeScoreText) > Number(awayScoreText)}
          isRecord={isUpcoming}
        />

        <MobileStackedTeamRow
          logo={awayLogo}
          name={awayName}
          goalsText={awayGoalsText}
          scoreText={awayScoreText}
          colourLine={awayColourLine}
          faded={awayLost}
          winning={!isUpcoming && Number(awayScoreText) > Number(homeScoreText)}
          isRecord={isUpcoming}
        />
      </div>
    </div>
  );
}

function MobileStackedTeamRow({
  logo,
  name,
  goalsText,
  scoreText,
  colourLine,
  faded,
  winning,
  isRecord,
}: {
  logo: string;
  name: string;
  goalsText: string;
  scoreText: string;
  colourLine: string;
  faded: boolean;
  winning: boolean;
  isRecord: boolean;
}) {
  return (
    <div style={mobileStackedTeamWrapStyle}>
      <div style={mobileStackedTeamRowStyle}>
        <div style={mobileStackedTeamLeftStyle}>
          <img src={logo} alt={name} style={mobileLogoStyle} loading="lazy" />
          <strong style={{ ...mobileTeamNameStyle, opacity: faded ? 0.45 : 1 }}>{name}</strong>
        </div>

        <div style={mobileStackedScoreWrapStyle}>
          <span style={{ ...mobileGoalsStyle, opacity: faded ? 0.34 : 0.6 }}>{goalsText}</span>
          <strong
            style={{
              ...mobileStackedScoreStyle,
              color: winning ? "#60a5fa" : "#ffffff",
              fontSize: isRecord ? "17px" : "24px",
              opacity: faded ? 0.55 : 1,
            }}
          >
            {scoreText}
          </strong>
        </div>
      </div>

      <div
        style={{
          ...mobileTeamGradientLineStyle,
          background: colourLine,
          opacity: faded ? 0.35 : 1,
        }}
      />
    </div>
  );
}

function TeamRow({
  logo,
  name,
  scoreText,
  goalsText,
  colourLine,
  faded,
  scoreColor,
  isRecord,
}: {
  logo: string;
  name: string;
  scoreText: string;
  goalsText: string;
  colourLine: string;
  faded: boolean;
  scoreColor: string;
  isRecord: boolean;
}) {
  return (
    <div style={teamRowWrap}>
      <div style={teamRow}>
        <div style={teamLeft}>
          <img src={logo} alt={name} style={{ ...logoStyle, opacity: faded ? 0.38 : 1 }} loading="lazy" />
          <strong style={{ ...teamNameStyle, opacity: faded ? 0.45 : 1 }}>{name}</strong>
        </div>

        <div style={scoreWrap}>
          <span style={{ ...goalsStyle, opacity: faded ? 0.34 : 0.58 }}>{goalsText}</span>

          <strong
            style={{
              ...scoreStyle,
              fontSize: isRecord ? "18px" : "24px",
              color: scoreColor,
              opacity: faded ? 0.45 : 1,
            }}
          >
            {scoreText}
          </strong>
        </div>
      </div>

      <div style={{ ...teamColourLine, background: colourLine }} />
    </div>
  );
}

const mobileGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "4px 0 8px",
};

const mobileGroupLabelStyle: React.CSSProperties = {
  padding: "4px 2px 0",
  color: "rgba(255,255,255,0.52)",
  fontSize: "16px",
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

const mobileMatchStyle: React.CSSProperties = {
  minHeight: "124px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0c0c0c",
  color: "white",
  textDecoration: "none",
  boxShadow: "0 12px 34px rgba(0,0,0,.25)",
  overflow: "hidden",
  transition: "transform 0.1s ease, opacity 0.1s ease",
};

const mobileMatchInnerStyle: React.CSSProperties = {
  minHeight: "124px",
  display: "grid",
  gridTemplateRows: "auto 1fr",
};

const mobileMatchHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "9px 14px",
  borderBottom: "1px solid rgba(255,255,255,.08)",
};

const mobileHeaderTimeStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

const mobileVenueStyle: React.CSSProperties = {
  minWidth: 0,
  color: "#9ca3af",
  fontSize: "11px",
  fontWeight: 750,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const mobileTeamsStackStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateRows: "1fr 1fr",
};

const mobileStackedTeamWrapStyle: React.CSSProperties = {
  minHeight: "45px",
  display: "grid",
  gridTemplateRows: "1fr 3px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
};

const mobileTeamGradientLineStyle: React.CSSProperties = {
  height: "3px",
  width: "100%",
};

const mobileStackedTeamRowStyle: React.CSSProperties = {
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "8px 12px",
};

const mobileStackedTeamLeftStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

const mobileTeamNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "14px",
  lineHeight: 1.05,
  fontWeight: 950,
  letterSpacing: "-0.03em",
};

const mobileLogoStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
};

const mobileStackedScoreWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px 44px",
  alignItems: "center",
  justifyContent: "end",
  columnGap: "8px",
  flexShrink: 0,
};

const mobileGoalsStyle: React.CSSProperties = {
  width: "36px",
  textAlign: "right",
  color: "#c7ced8",
  fontSize: "11px",
  fontWeight: 950,
  fontVariantNumeric: "tabular-nums",
};

const mobileStackedScoreStyle: React.CSSProperties = {
  width: "44px",
  textAlign: "right",
  fontWeight: 950,
  lineHeight: 1,
  letterSpacing: "-0.05em",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#000000",
  color: "white",
};

const headerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: "50%",
  width: "100vw",
  transform: "translateX(-50%)",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  background: "rgba(0,0,0,0.92)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid rgba(255,255,255,0.08)",
  willChange: "transform",
};

const headerTopStyle: React.CSSProperties = {
  height: "calc(52px + env(safe-area-inset-top))",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: "58px",
  paddingRight: "18px",
};

const headerRoundsScroll: React.CSSProperties = {
  display: "flex",
  gap: "20px",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "7px 18px 8px",
  scrollBehavior: "smooth",
  scrollbarWidth: "none",
};

const headerRoundsDesktop: React.CSSProperties = {
  ...headerRoundsScroll,
  width: "100%",
  gap: "22px",
  overflowX: "auto",
  justifyContent: "flex-start",
  padding: "7px 18px 8px",
};

const headerRoundItem: React.CSSProperties = {
  position: "relative",
  flex: "0 0 auto",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "5px 0 8px",
};

const headerRoundItemDesktop: React.CSSProperties = {
  ...headerRoundItem,
  padding: "5px 2px 8px",
};

const headerRoundText: React.CSSProperties = {
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const headerRoundUnderline: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  height: "3px",
  borderRadius: "999px",
};

const logoWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

const logoIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "linear-gradient(135deg,#3b82f6 0%,#6366f1 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 2px 10px rgba(99,102,241,0.45)",
  flexShrink: 0,
};

const logoTextStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.04em",
  color: "white",
};

const roundBadgeStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#60a5fa",
  background: "rgba(59,130,246,0.12)",
  border: "1px solid rgba(59,130,246,0.22)",
  borderRadius: 999,
  padding: "5px 12px",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: "1320px",
  margin: "0 auto",
  padding: "18px 16px calc(90px + env(safe-area-inset-bottom))",
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto 1fr",
  minHeight: "190px",
  overflow: "hidden",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,.09)",
  background: "#0d0d0d",
  color: "white",
  textDecoration: "none",
  boxShadow: "0 18px 45px rgba(0,0,0,.22)",
};

const infoStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  alignItems: "center",
  columnGap: "10px",
  padding: "11px 16px",
  background: "rgba(255,255,255,.02)",
  borderBottom: "1px solid rgba(255,255,255,.08)",
};

const timeStyle: React.CSSProperties = {
  gridColumn: "2",
  justifySelf: "end",
  fontSize: "14px",
  fontWeight: 950,
  textAlign: "right",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const venueStyle: React.CSSProperties = {
  gridColumn: "1",
  gridRow: "1",
  minWidth: 0,
  color: "#9aa7b8",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const teamsStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateRows: "1fr 1fr",
};

const teamRowWrap: React.CSSProperties = {
  position: "relative",
  minHeight: "62px",
  borderBottom: "1px solid rgba(255,255,255,.12)",
};

const teamRow: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: "10px 10px",
};

const teamLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minWidth: 0,
  overflow: "hidden",
};

const logoStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  objectFit: "contain",
  borderRadius: "50%",
  padding: "3px",
  flexShrink: 0,
};

const teamNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const scoreWrap: React.CSSProperties = {
  width: "98px",
  display: "grid",
  gridTemplateColumns: "38px 50px",
  alignItems: "center",
  justifyContent: "end",
  columnGap: "8px",
  flexShrink: 0,
};

const scoreStyle: React.CSSProperties = {
  display: "block",
  width: "50px",
  textAlign: "left",
  fontSize: "28px",
  lineHeight: 1,
  fontWeight: 950,
  fontVariantNumeric: "tabular-nums",
};

const goalsStyle: React.CSSProperties = {
  display: "block",
  width: "38px",
  textAlign: "right",
  fontSize: "13px",
  fontWeight: 950,
  color: "#c7ced8",
  fontVariantNumeric: "tabular-nums",
};

const teamColourLine: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: "3px",
};

const emptyBoxStyle: React.CSSProperties = {
  minHeight: "110px",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: "18px",
  color: "#94a3b8",
  background: "rgba(255,255,255,.035)",
};

const topPlayersSectionStyle: React.CSSProperties = {
  marginTop: "28px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(255,255,255,.1)",
  background: "#030303",
};

const topPlayersHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  marginBottom: "12px",
};

const topPlayersTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 950,
};

const topPlayersBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 950,
  background: "rgba(14,165,233,.18)",
  color: "#38bdf8",
  padding: "7px 11px",
  borderRadius: "999px",
};

const topPlayersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(58px, 1fr))",
  gap: "14px 8px",
  paddingBottom: "4px",
  overflow: "visible",
};

const topPlayerTileStyle: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  overflow: "hidden",
};

const topRankStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 950,
  color: "rgba(255,255,255,0.35)",
  letterSpacing: "0.03em",
};

const topPlayerCircleWrapStyle: React.CSSProperties = {
  position: "relative",
  width: "54px",
  height: "54px",
  flexShrink: 0,
};

const topPlayerCircleStyle: React.CSSProperties = {
  width: "54px",
  height: "54px",
  borderRadius: "999px",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,.12)",
  boxShadow: "inset 0 -10px 16px rgba(0,0,0,.3)",
};

const topPlayerImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const topPlayerInitialsStyle: React.CSSProperties = {
  display: "none",
  width: "100%",
  height: "100%",
  placeItems: "center",
  fontWeight: 950,
  fontSize: "15px",
  color: "white",
};

const topPlayerLogoStyle: React.CSSProperties = {
  position: "absolute",
  right: "-3px",
  bottom: "-3px",
  width: "20px",
  height: "20px",
  objectFit: "contain",
  borderRadius: "50%",
  border: "2px solid #000",
  background: "#111",
};

const topRatingRowStyle: React.CSSProperties = {
  minWidth: "48px",
  height: "30px",
  padding: "0 9px",
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "15px",
  fontWeight: 950,
  color: "white",
  textShadow: "0 1px 2px rgba(0,0,0,.45)",
  boxShadow: "inset 0 -2px 0 rgba(0,0,0,.14)",
};

const noTopPlayersStyle: React.CSSProperties = {
  padding: "18px",
  borderRadius: "16px",
  border: "1px dashed rgba(255,255,255,.14)",
  color: "rgba(255,255,255,.55)",
  fontSize: "13px",
  fontWeight: 800,
};

const topPlayerNameStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  color: "rgba(255,255,255,0.65)",
  textAlign: "center",
  width: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};
