"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TradesInboxModal from "./components/TradesInboxModal";
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
  isLive?: boolean;
};

type StatLeader = {
  name: string;
  team: string;
  image: string;
  teamColor: string;
  value: number;
  statLine: string;
};

type PlayerStreakEntry = {
  id: string;
  name: string;
  team: string;
  image: string;
  teamLogo: string;
  teamColor: string;
  streak: number;
  label: string;
  emoji: string;
};

type PlayerStatsPlayer = {
  id?: string;
  name?: string;
  player?: string;
  club?: string;
  team?: string;
  aliases?: string[];
  image?: string;
  imagePath?: string;
  playerImage?: string;
  apiSportsId?: number;
  eventIds?: unknown;
  statsIds?: unknown;
};

const TEAM_BAR_COLORS: Record<number, string> = {
  1:  "#0f1432",
  2:  "#8c0841",
  3:  "#081d30",
  4:  "#ffffff",
  5:  "#cb2031",
  6:  "#2a0c56",
  7:  "#012b5c",
  8:  "#c40704",
  9:  "#fb7907",
  10: "#331101",
  11: "#df0518",
  12: "#0434a7",
  13: "#078bac",
  14: "#f7d11c",
  15: "#eb1d2f",
  16: "#de241b",
  17: "#f2bc2e",
  18: "#0358a7",
};

const TEAM_ABBR: Record<number, string> = {
  1: "ADE", 2: "BRI", 3: "CAR", 4: "COL", 5: "ESS", 6: "FRE",
  7: "GEE", 8: "GC", 9: "GWS", 10: "HAW", 11: "MEL", 12: "NM",
  13: "PA", 14: "RIC", 15: "STK", 16: "SYD", 17: "WCE", 18: "WB",
};

const TEAM_NICKNAMES: Record<number, string> = {
  1: "Crows",
  2: "Lions",
  3: "Blues",
  4: "Magpies",
  5: "Bombers",
  6: "Dockers",
  7: "Cats",
  8: "Suns",
  9: "Giants",
  10: "Hawks",
  11: "Demons",
  12: "Kangaroos",
  13: "Power",
  14: "Tigers",
  15: "Saints",
  16: "Swans",
  17: "Eagles",
  18: "Bulldogs",
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
  4: { colors: ["#ffffff", "#1e1e28"], logo: "/team-logos/magpies.png" },
  5: { colors: ["#1e1e28", "#ed1b2f"], logo: "/team-logos/bombers.png" },
  6: { colors: ["#4b1979", "#ffffff"], logo: "/team-logos/dockers.png" },
  7: { colors: ["#ffffff", "#003b73"], logo: "/team-logos/cats.png" },
  8: { colors: ["#ff1f2d", "#ffd200"], logo: "/team-logos/suns.png" },
  9: { colors: ["#f15a22", "#343434"], logo: "/team-logos/giants.png" },
  10: { colors: ["#8b4a24", "#fbbf24"], logo: "/team-logos/hawks.png" },
  11: { colors: ["#c8102e", "#001f54"], logo: "/team-logos/demons.png" },
  12: { colors: ["#0055a4", "#ffffff"], logo: "/team-logos/kangaroos.png" },
  13: { colors: ["#00a9b7", "#1e1e28", "#ffffff"], logo: "/team-logos/power.png" },
  14: { colors: ["#1e1e28", "#ffd200"], logo: "/team-logos/tigers.png" },
  15: { colors: ["#ed1b2f", "#ffffff", "#1e1e28"], logo: "/team-logos/saints.png" },
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

function formatGameTimestr(timestr?: string) {
  const t = (timestr ?? "").toLowerCase();
  if (!t) return "";
  if (t.startsWith("1/4") || t.includes("quarter time")) return "QTR TIME";
  if (t.startsWith("1/2") || t.includes("half time")) return "HALF TIME";
  if (t.startsWith("3/4") || t.includes("three quarter")) return "3QTR TIME";
  if (t.startsWith("full time") || t.includes("full time")) return "FULL TIME";
  return timestr ?? "";
}

function getTime(game: Game, showDate = false) {
  const status = getStatus(game);

  if (status === "COMPLETED") return "Full Time";

  if (status === "LIVE") {
    if (game.timestr) return formatGameTimestr(game.timestr);
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


function getTimeOnly(game: Game) {
  const status = getStatus(game);
  if (status === "COMPLETED") return "Full Time";
  if (status === "LIVE") return formatGameTimestr(game.timestr) || "Live";

  if (game.timestr) {
    const spaceIdx = game.timestr.indexOf(" ");
    return compactMeridiem(spaceIdx >= 0 ? game.timestr.slice(spaceIdx + 1) : game.timestr);
  }

  if (!game.date) return "TBA";
  return compactMeridiem(new Date(game.date).toLocaleString("en-AU", { hour: "numeric", minute: "2-digit" }));
}

function compactMeridiem(value: string) {
  return value.replace(/\s+([ap])\.?m\.?$/i, (_, meridiem: string) => `${meridiem.toLowerCase()}m`);
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

  return gameDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
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

const PLAYER_IMAGE_ALIASES: Record<string, string[]> = {
  zacharywilliams: ["zacwilliams"],
  archiemay: ["archermay"],
  kaylegerreyn: ["kaylegerryn"],
  nikolascox: ["nikcox"],
  chrisscerri: ["christopherscerri"],
  joshdraper: ["joshuadraper"],
  bradleyclose: ["bradclose"],
  lennoxhoffman: ["lennoxhofmann"],
  mitchellknevitt: ["mitchknevitt"],
  nickdriscoll: ["nicholasdriscoll"],
  olliedempsey: ["oliverdempsey"],
  leolombard: ["leonardolombard"],
  josephfonti: ["joefonti"],
  joshuakelly: ["joshkelly"],
  bodieryan: ["brodieryan"],
  connornash: ["conornash"],
  mitchellewis: ["mitchlewis"],
  olliegreeves: ["olivergreeves"],
  roberthansenjr: ["roberthansen"],
  joshuagibcus: ["joshgibcus"],
  noahrobertsthomson: ["noahrobertsthompson"],
  thomassims: ["tomsims"],
  danielbutler: ["danbutler"],
  mitchitoowens: ["mitchowens"],
  matthewroberts: ["mattyroberts"],
  willgreen: ["williamgreen"],
};

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
  return playerImageCandidates(playerName, team)[0] ?? "";
}

function playerImageCandidates(playerName: string, team?: string) {
  const found = findPlayerInfo(playerName);
  const club = found?.club ?? found?.team ?? team ?? "";
  const folder = clubToPlayerFolder(club);

  if (!folder) return [];

  const urls: string[] = [];
  const addUrl = (url: string) => {
    if (url && !urls.includes(url)) urls.push(url);
  };
  const addImageFile = (image?: string) => {
    if (!image) return;
    if (/^https?:\/\//i.test(image) || image.startsWith("/")) addUrl(image);
    else addUrl(`/players/${folder}/${image}`);
  };
  const addSlug = (value?: string) => {
    const slug = slugName(value ?? "");
    if (slug) addUrl(`/players/${folder}/${slug}.png`);
  };

  addImageFile(found?.image);
  addImageFile(found?.imagePath);
  addImageFile(found?.playerImage);
  addSlug(playerName);
  addSlug(found?.name);
  addSlug(found?.player);
  addSlug(found?.id);
  for (const alias of found?.aliases ?? []) addSlug(alias);

  const aliasKey = slugName(found?.name ?? playerName);
  for (const alias of PLAYER_IMAGE_ALIASES[aliasKey] ?? []) addSlug(alias);

  return urls;
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
  if (!id) return "#1e2438";
  const colors = TEAM_STYLES[id]?.colors ?? [];
  return colors.find((c) => hexLuminance(c) < 180) ?? colors[0] ?? "#1e2438";
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [liveGameStats, setLiveGameStats] = useState<Record<string, any>>(matchStatsRaw as any);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<"1" | "3">("3");
  const [hasLoadedSavedRound, setHasLoadedSavedRound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullVisible, setPullVisible] = useState(false);
  const [showStreaksPopup, setShowStreaksPopup] = useState(false);
  const [mounted, setMounted] = useState(false);
  const roundRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const isMobile = useIsMobile();

  const [unreadCount, setUnreadCount] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myAccessToken, setMyAccessToken] = useState<string | null>(null);
  const [showTradesInbox, setShowTradesInbox] = useState(false);
  const [prefetchedTrades, setPrefetchedTrades] = useState<any[] | undefined>(undefined);

  // My Team feature
  const [favTeamId, setFavTeamId]                 = useState<number | null>(null);
  const [teamFeaturedMatch, setTeamFeaturedMatch]  = useState(true);
  const [teamBorderColor, setTeamBorderColor]      = useState("#c9962a");
  useEffect(() => {
    const FAV_TEAM_TO_ID: Record<string, number> = {
      Adelaide: 1, Brisbane: 2, Carlton: 3, Collingwood: 4,
      Essendon: 5, Fremantle: 6, Geelong: 7, "Gold Coast": 8,
      GWS: 9, Hawthorn: 10, Melbourne: 11, "North Melbourne": 12,
      "Port Adelaide": 13, Richmond: 14, "St Kilda": 15,
      Sydney: 16, "West Coast": 17, "Western Bulldogs": 18,
    };
    const load = () => {
      const name = localStorage.getItem("foopy_fav_team") ?? "";
      setFavTeamId(name ? (FAV_TEAM_TO_ID[name] ?? null) : null);
      setTeamFeaturedMatch(localStorage.getItem("foopy_team_featured") !== "false");
      setTeamBorderColor(localStorage.getItem("foopy_team_border_color") ?? "#c9962a");
    };
    load();
    window.addEventListener("foopy-settings-changed", load);
    return () => window.removeEventListener("foopy-settings-changed", load);
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (cancelled) return;
      if (uid) setMyUserId(uid);
      if (session?.access_token) {
        setMyAccessToken(session.access_token);
        // Pre-fetch trades in background so inbox opens instantly
        fetch("/api/trades", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setPrefetchedTrades(d.trades ?? []); })
          .catch(() => {});
      }
      if (!uid) return;
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("read", false)
        .then(({ count }) => {
          if (!cancelled) setUnreadCount(count ?? 0);
        });
    });
    return () => { cancelled = true; };
  }, []);

  const [swipeTarget, setSwipeTarget] = useState<number | null>(null);
  const swipeTargetRef = useRef<number | null>(null);
  const swipeDirRef = useRef<"left" | "right" | null>(null);
  const slideWrapRef = useRef<HTMLDivElement | null>(null);
  const slideContainerRef = useRef<HTMLDivElement | null>(null);

  const listStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0px",
  };

  useEffect(() => { setMounted(true); }, []);

  // Fetch fresh merged game stats (static JSON + Supabase match_cache)
  useEffect(() => {
    fetch("/api/game-stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLiveGameStats(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showStreaksPopup) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowStreaksPopup(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showStreaksPopup]);

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

  // Keep stable refs so touch handlers don't go stale between renders
  const availableRoundsRef = useRef<number[]>([]);
  const selectedRoundRef = useRef<number>(selectedRound);

  // Pull-to-refresh + horizontal swipe to change round
  useEffect(() => {
    const PULL_THRESHOLD = 72;
    const SWIPE_THRESHOLD = 55;
    // Resolved once per gesture: "v" = vertical, "h" = horizontal, "" = undecided
    let gesture = "";

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      gesture = "";
    }

    function onTouchMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      // Lock gesture direction once movement is unambiguous
      if (!gesture && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        gesture = Math.abs(dx) > Math.abs(dy) ? "h" : "v";

        if (gesture === "h") {
          // Ignore swipes starting on the rounds strip
          const startTarget = e.target as Node;
          if (roundRef.current?.contains(startTarget)) {
            gesture = "rounds";
            return;
          }
          // Determine target round and activate slide panels
          const rounds = availableRoundsRef.current;
          const idx = rounds.indexOf(selectedRoundRef.current);
          if (dx < 0 && idx < rounds.length - 1) {
            swipeTargetRef.current = rounds[idx + 1];
            swipeDirRef.current = "left";
            setSwipeTarget(rounds[idx + 1]);
          } else if (dx > 0 && idx > 0) {
            swipeTargetRef.current = rounds[idx - 1];
            swipeDirRef.current = "right";
            setSwipeTarget(rounds[idx - 1]);
          }
        }
      }

      if (gesture === "v" && window.scrollY === 0 && dy > 20) setPullVisible(true);

      if (gesture === "h" && swipeTargetRef.current !== null) {
        e.preventDefault();
        const W = slideContainerRef.current?.offsetWidth ?? window.innerWidth;
        let tx: number;
        if (swipeDirRef.current === "left") {
          tx = Math.min(0, Math.max(-W, dx));
        } else {
          tx = Math.min(0, Math.max(-W, -W + dx));
        }
        if (slideWrapRef.current) {
          slideWrapRef.current.style.transform = `translateX(${tx}px)`;
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      setPullVisible(false);

      if (gesture === "v") {
        if (dy >= PULL_THRESHOLD && window.scrollY === 0 && !refreshing) {
          haptic("medium");
          setRefreshing(true);
          invalidateGames();
          getGames()
            .then((data) => setGames(data as Game[]))
            .finally(() => setRefreshing(false));
        }
      } else if (gesture === "h" && swipeTargetRef.current !== null) {
        const W = slideContainerRef.current?.offsetWidth ?? window.innerWidth;
        const isLeft = swipeDirRef.current === "left";

        if (Math.abs(dx) >= SWIPE_THRESHOLD) {
          // Commit: animate to target panel then update round
          haptic("light");
          const commitTx = isLeft ? -W : 0;
          if (slideWrapRef.current) {
            slideWrapRef.current.style.transition = "transform 0.22s ease-out";
            slideWrapRef.current.style.transform = `translateX(${commitTx}px)`;
          }
          const committedRound = swipeTargetRef.current;
          setTimeout(() => {
            setSelectedRound(committedRound!);
            setSwipeTarget(null);
            swipeTargetRef.current = null;
            swipeDirRef.current = null;
            if (slideWrapRef.current) {
              slideWrapRef.current.style.transition = "";
              slideWrapRef.current.style.transform = "";
            }
          }, 220);
        } else {
          // Cancel: snap back to initial position
          const initialTx = isLeft ? 0 : -W;
          if (slideWrapRef.current) {
            slideWrapRef.current.style.transition = "transform 0.18s ease-out";
            slideWrapRef.current.style.transform = `translateX(${initialTx}px)`;
          }
          setTimeout(() => {
            setSwipeTarget(null);
            swipeTargetRef.current = null;
            swipeDirRef.current = null;
            if (slideWrapRef.current) {
              slideWrapRef.current.style.transition = "";
              slideWrapRef.current.style.transform = "";
            }
          }, 180);
        }
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
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

  // Keep refs in sync so the touch handler closure always reads the latest values
  useEffect(() => { availableRoundsRef.current = availableRounds; }, [availableRounds]);
  useEffect(() => { selectedRoundRef.current = selectedRound; }, [selectedRound]);

  const targetGroups = useMemo(() => {
    if (swipeTarget === null) return [];
    const tGames = games
      .filter((g) => Number(g.round) === Number(swipeTarget) && g.round <= 24)
      .sort((a, b) => {
        const tA = new Date(a.date ?? "").getTime();
        const tB = new Date(b.date ?? "").getTime();
        return (Number.isFinite(tA) ? tA : Infinity) - (Number.isFinite(tB) ? tB : Infinity);
      });
    const groups: Array<{ label: string; games: Game[] }> = [];
    tGames.forEach((game) => {
      const label = formatMobileDateLabel(game.date);
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.games.push(game);
      else groups.push({ label, games: [game] });
    });
    return groups;
  }, [games, swipeTarget]);

  // Set initial slide position synchronously before browser paints when a swipe panel mounts
  useLayoutEffect(() => {
    if (swipeTarget === null || !slideWrapRef.current || !slideContainerRef.current) return;
    const W = slideContainerRef.current.offsetWidth;
    const tx = swipeTarget > selectedRound ? 0 : -W;
    slideWrapRef.current.style.transform = `translateX(${tx}px)`;
  }, [swipeTarget, selectedRound]);

  const shownGames = useMemo(() => {
    return games
      .filter((g) => Number(g.round) === Number(selectedRound) && g.round <= 24)
      .sort((a, b) => {
        const timeA = new Date(a.date ?? "").getTime();
        const timeB = new Date(b.date ?? "").getTime();
        const safeTimeA = Number.isFinite(timeA) ? timeA : Number.MAX_SAFE_INTEGER;
        const safeTimeB = Number.isFinite(timeB) ? timeB : Number.MAX_SAFE_INTEGER;

        return safeTimeA - safeTimeB;
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

  // Live player stats: keyed by API-Sports game ID → flat array of player entries
  const [livePlayerStats, setLivePlayerStats] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const liveGames = shownGames.filter((g) => getStatus(g) === "LIVE");
    const completedGames = shownGames.filter((g) => getStatus(g) === "COMPLETED");

    if (liveGames.length === 0 && completedGames.length === 0) {
      setLivePlayerStats({});
      return;
    }

    async function fetchLive() {
      const results: Record<string, any[]> = {};
      await Promise.all([
        // Live games — short-TTL live data
        ...liveGames.map(async (g) => {
          const apiId =
            (API_SPORTS_MATCH_IDS as Record<string, string>)[String(g.id)] ?? String(g.id);
          try {
            const res = await fetch(`/api/afl/player-stats?id=${apiId}`);
            if (!res.ok) return;
            const data = await res.json();
            const teams: any[] = data?.response?.[0]?.teams ?? [];
            const players = teams.flatMap((t: any) => t.players ?? []);
            if (players.length > 0) results[apiId] = players;
          } catch {}
        }),
        // Completed games — fetch with ?final=true so server permanently caches
        ...completedGames.map(async (g) => {
          const apiId =
            (API_SPORTS_MATCH_IDS as Record<string, string>)[String(g.id)] ?? String(g.id);
          try {
            const res = await fetch(`/api/afl/player-stats?id=${apiId}&final=true`);
            if (!res.ok) return;
            const data = await res.json();
            const teams: any[] = data?.response?.[0]?.teams ?? [];
            const players = teams.flatMap((t: any) => t.players ?? []);
            if (players.length > 0) results[apiId] = players;
          } catch {}
        }),
      ]);
      setLivePlayerStats(results);
    }

    fetchLive();
    // Only keep polling if there are live games — completed games are cached permanently
    if (liveGames.length === 0) return;
    const interval = setInterval(fetchLive, 30_000);
    return () => clearInterval(interval);
  }, [shownGames]);

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
    const matchData = liveGameStats as Record<string, RawGameEntry>;
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

    // Merge live game player stats
    for (const players of Object.values(livePlayerStats)) {
      for (const playerEntry of players) {
        const apiPlayerId = playerEntry?.player?.id;
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

        // stats may be nested under .statistics or flat on the entry itself
        const s = playerEntry.statistics ?? playerEntry;
        const rating = foopyRating({
          goals:        s.goals?.total      ?? s.goals,
          goalAssists:  s.goals?.assists     ?? s.goalAssists ?? s.goal_assists,
          behinds:      s.behinds,
          kicks:        s.kicks,
          handballs:    s.handballs,
          marks:        s.marks,
          tackles:      s.tackles,
          hitouts:      s.hitouts,
          disposals:    s.disposals,
          clearances:   s.clearances?.total ?? s.clearances,
          freesFor:     s.free_kicks?.for   ?? s.freesFor    ?? s.frees_for,
          freesAgainst: s.free_kicks?.against ?? s.freesAgainst ?? s.frees_against,
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
          isLive: true,
        };
        const existing = bestByName.get(name);
        if (!existing || item.rating > existing.rating) {
          bestByName.set(name, item);
        }
      }
    }

    return Array.from(bestByName.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10);
  }, [shownGames, livePlayerStats, liveGameStats]);

  const statLeaders = useMemo(() => {
    const disposalsMap = new Map<string, StatLeader>();
    const goalsMap = new Map<string, StatLeader>();
    const hitoutsMap = new Map<string, StatLeader>();

    const playerData = playerStatsRaw as PlayerStatsPlayer[];

    function processPlayerEntry(rawPlayer: any, found: PlayerStatsPlayer) {
      const name = String(found.name || "").trim();
      if (!name) return;

      const playerTeam = found.team ?? found.club ?? "";
      const image = playerImagePath(name, playerTeam);
      const teamColor = getTeamColorFromName(playerTeam);

      // Handle both nested (API-Sports live) and flat (static JSON) shapes
      const s = rawPlayer.statistics ?? rawPlayer;
      const disposals = s.disposals ?? 0;
      const goals     = s.goals?.total ?? s.goals ?? 0;
      const hitouts   = s.hitouts ?? 0;
      const kicks     = s.kicks ?? 0;
      const handballs = s.handballs ?? 0;
      const behinds   = s.behinds ?? 0;

      const trySet = (map: Map<string, StatLeader>, value: number, statLine: string) => {
        if (value <= 0) return;
        const existing = map.get(name);
        if (!existing || value > existing.value)
          map.set(name, { name, team: playerTeam, image, teamColor, value, statLine });
      };

      trySet(disposalsMap, disposals, `${kicks}k ${handballs}h`);
      trySet(goalsMap,     goals,     `${behinds} beh`);
      trySet(hitoutsMap,   hitouts,   `${disposals} disp`);
    }

    // ── 1. Static JSON (older games already bundled) ─────────────────────────
    type RawEntry = { teams?: Array<{ players?: Array<{ player?: { id?: number } }> }> };
    const matchData = liveGameStats as Record<string, RawEntry>;
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
          if (found) processPlayerEntry(rawPlayer, found);
        }
      }
    }

    // ── 2. Live / cached API stats (current round live + completed games) ────
    for (const players of Object.values(livePlayerStats)) {
      for (const playerEntry of players) {
        const apiPlayerId = playerEntry?.player?.id;
        if (!apiPlayerId) continue;
        const found = playerData.find(
          (p) =>
            p.apiSportsId === apiPlayerId ||
            idListIncludes(p.eventIds, apiPlayerId) ||
            idListIncludes(p.statsIds, apiPlayerId)
        );
        if (found) processPlayerEntry(playerEntry, found);
      }
    }

    const top5 = (m: Map<string, StatLeader>) =>
      Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 5);

    return { disposals: top5(disposalsMap), goals: top5(goalsMap), hitouts: top5(hitoutsMap) };
  }, [shownGames, livePlayerStats, liveGameStats]);

  const byeTeams = useMemo(() => {
    if (shownGames.length === 0) return [];

    const playingIds = new Set<number>();
    shownGames.forEach((g) => {
      if (g.hteamid) playingIds.add(g.hteamid);
      if (g.ateamid) playingIds.add(g.ateamid);
    });

    const allTeamIds = Object.keys(TEAM_STYLES).map(Number).sort((a, b) => a - b);

    return allTeamIds
      .filter((id) => !playingIds.has(id))
      .map((id) => {
        // Season record up to and including current round
        let wins = 0, losses = 0, draws = 0;
        games.forEach((g) => {
          if (Number(g.round) > selectedRound) return;
          if (getStatus(g) !== "COMPLETED") return;
          const isHome = g.hteamid === id;
          const isAway = g.ateamid === id;
          if (!isHome && !isAway) return;
          const hs = g.hscore ?? 0, as = g.ascore ?? 0;
          if (hs === as) { draws++; return; }
          const won = isHome ? hs > as : as > hs;
          if (won) wins++; else losses++;
        });
        const record = draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;

        const nextGame = games.find(
          (g) => Number(g.round) > selectedRound && (g.hteamid === id || g.ateamid === id)
        );
        let nextText = "";
        if (nextGame) {
          const isHome = nextGame.hteamid === id;
          const oppId = isHome ? nextGame.ateamid : nextGame.hteamid;
          const opp = oppId ? (TEAM_ABBR[oppId] ?? "") : "";
          nextText = `Rd ${nextGame.round} ${isHome ? "vs" : "at"} ${opp}`.toUpperCase();
        }
        return {
          id,
          name: TEAM_NICKNAMES[id] ?? TEAM_NAMES[id] ?? `Team ${id}`,
          logo: TEAM_STYLES[id]?.logo ?? "",
          color: TEAM_BAR_COLORS[id] ?? (TEAM_STYLES[id]?.colors[0] ?? "#1e2438"),
          record,
          nextText,
        };
      });
  }, [games, shownGames, selectedRound]);

  const playerStreaks = useMemo(() => {
    type RawGame = {
      gameId: number;
      date: string;
      teams: Array<{
        team: { id: number };
        players: Array<{
          player: { id: number };
          goals?: { total?: number };
          disposals?: number;
          kicks?: number;
          tackles?: number;
        }>;
      }>;
    };

    const allStats = liveGameStats as unknown as Record<string, RawGame>;
    const statGames = Object.values(allStats);
    const statGameIds = new Set(statGames.map((g) => String(g.gameId)).filter(Boolean));
    const statGameIdByDateAndTeams = new Map<string, string>();

    // Name-based key: date + sorted normalised team names — works regardless of ID system
    function statGameKeyByNames(date: string | undefined, names: string[]) {
      const parts = names.map(n => normalizeTeam(n)).filter(Boolean).sort();
      if (!date || parts.length < 2) return "";
      return `${date.slice(0, 10)}|${parts.join("|")}`;
    }

    for (const g of statGames) {
      if (!Array.isArray(g.teams)) continue;
      const teamNames = g.teams.map((t: any) => String(t.team?.name ?? ""));
      const nameKey = statGameKeyByNames(g.date, teamNames);
      if (nameKey && !statGameIdByDateAndTeams.has(nameKey)) {
        statGameIdByDateAndTeams.set(nameKey, String(g.gameId));
      }
    }

    function getStatGameIdForFixture(game: Game) {
      const mapped = API_SPORTS_MATCH_IDS[String(game.id)];
      if (mapped && statGameIds.has(mapped)) return mapped;

      // Fall back to matching by date + team names (works even without an explicit ID mapping)
      return statGameIdByDateAndTeams.get(statGameKeyByNames(game.date, [game.hteam ?? "", game.ateam ?? ""])) ?? null;
    }

    const completedStatGameIds = new Set<string>();
    const latestCompletedStatGameByTeam = new Map<number, { gameId: string; time: number }>();

    for (const game of games) {
      if (getStatus(game) !== "COMPLETED") continue;

      const statGameId = getStatGameIdForFixture(game);
      if (!statGameId) continue;

      completedStatGameIds.add(statGameId);

      const gameTime = game.date ? new Date(game.date).getTime() : 0;
      for (const teamId of [game.hteamid, game.ateamid]) {
        if (!teamId) continue;

        const previous = latestCompletedStatGameByTeam.get(teamId);
        if (!previous || gameTime > previous.time) {
          latestCompletedStatGameByTeam.set(teamId, { gameId: statGameId, time: gameTime });
        }
      }
    }

    if (latestCompletedStatGameByTeam.size === 0) return [];

    const playerGames: Record<number, Array<{ gameId: string; date: string; goals: number; disposals: number; kicks: number; tackles: number }>> = {};

    for (const g of statGames) {
      const gameId = String(g.gameId);
      if (!completedStatGameIds.has(gameId)) continue;
      if (!Array.isArray(g.teams)) continue;

      for (const t of g.teams) {
        for (const pl of t.players) {
          const id = pl.player.id;
          if (!playerGames[id]) playerGames[id] = [];
          playerGames[id].push({
            gameId,
            date: g.date,
            goals: pl.goals?.total ?? (typeof pl.goals === "number" ? pl.goals : 0),
            disposals: pl.disposals ?? 0,
            kicks: pl.kicks ?? 0,
            tackles: pl.tackles ?? 0,
          });
        }
      }
    }

    // sort each player's games oldest→newest
    for (const arr of Object.values(playerGames)) {
      arr.sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
        const safeTimeB = Number.isFinite(timeB) ? timeB : 0;

        return safeTimeA - safeTimeB || Number(a.gameId) - Number(b.gameId);
      });
    }

    // id lookup: apiSportsId → player info
    const byApiId = new Map<number, PlayerStatsPlayer>();
    for (const p of playerStatsRaw as PlayerStatsPlayer[]) {
      if (p.apiSportsId) byApiId.set(p.apiSportsId, p);
    }

    const results: PlayerStreakEntry[] = [];

    const STREAK_DEFS: Array<{ key: "goals" | "disposals" | "kicks" | "tackles"; threshold: number; label: string; emoji: string; min: number }> = [
      { key: "goals",     threshold: 1,  label: "game goal streak",        emoji: "🎯", min: 4 },
      { key: "disposals", threshold: 25, label: "game 25+ disposal streak", emoji: "💪", min: 4 },
      { key: "tackles",   threshold: 5,  label: "game 5+ tackle streak",    emoji: "🔒", min: 4 },
    ];

    for (const [idStr, playedGames] of Object.entries(playerGames)) {
      const apiId = Number(idStr);
      const info = byApiId.get(apiId);
      if (!info) continue;

      const id = String((info as { id?: string }).id ?? "");
      const name = String(info.name || info.player || "");
      const team = String(info.club ?? info.team ?? "");
      if (!name || !team) continue;

      const teamId = getTeamIdFromName(team);
      if (!teamId) continue;

      const latestTeamGame = latestCompletedStatGameByTeam.get(teamId);
      const latestPlayerGame = playedGames[playedGames.length - 1];
      if (!latestTeamGame || !latestPlayerGame || latestPlayerGame.gameId !== latestTeamGame.gameId) continue;

      const image = playerImagePath(name, team);
      const teamLogo = getTeamLogoFromName(team);
      const teamColor = getTeamColorFromName(team);

      for (const def of STREAK_DEFS) {
        let streak = 0;
        for (let i = playedGames.length - 1; i >= 0; i--) {
          if (playedGames[i][def.key] >= def.threshold) streak++;
          else break;
        }
        if (streak >= def.min) {
          results.push({ id, name, team, image, teamLogo, teamColor, streak, label: `${streak}-${def.label}`, emoji: def.emoji });
        }
      }
    }

    // Sort: longest streak first, then alphabetically
    results.sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));

    return results.slice(0, 20);
  }, [liveGameStats, games]);

  function chooseRound(round: number) {
    setSelectedRound(round);
  }

  return (
    <>
      {showTradesInbox && myUserId && myAccessToken && (
        <TradesInboxModal
          myUserId={myUserId}
          accessToken={myAccessToken}
          initialTrades={prefetchedTrades}
          onClose={() => { setShowTradesInbox(false); setPrefetchedTrades(undefined); }}
        />
      )}

      <header style={headerStyle}>
        <div style={{ ...headerTopStyle, justifyContent: "space-between", paddingLeft: 16, paddingRight: 16 }}>
          {myUserId ? (
            <button
              onClick={() => setShowTradesInbox(true)}
              style={{ appearance: "none", border: "none", background: "var(--surface-3)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-1)", flexShrink: 0 }}
              title="Trades"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>
          ) : (
            <div style={{ width: 36 }} />
          )}
          <span style={headerTitleStyle}>Scores</span>
          <Link href="/notifications" onClick={() => setUnreadCount(0)} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, textDecoration: "none" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 0, right: 0,
                background: "#ef4444", color: "#fff",
                fontSize: 10, fontWeight: 700, lineHeight: 1,
                minWidth: 16, height: 16, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px",
                border: "1.5px solid var(--bottom-nav-bg)",
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
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
                    color: isSelected ? "var(--text-1)" : isCurrent ? "#60a5fa" : "var(--text-3)",
                    fontWeight: isSelected ? 800 : isCurrent ? 700 : 600,
                  }}
                >
                  {round === 0 ? "Opening" : `Round ${round}`}
                </span>

                {(isSelected || isCurrent) && (
                  <div
                    style={{
                      ...headerRoundUnderline,
                      background: isSelected ? "var(--text-1)" : "#3b82f6",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </header>

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

      <div style={{ height: "calc(92px + env(safe-area-inset-top))" }} />
      <div style={{ padding: "10px 12px 0" }}>
        <DuelHomepageCard />
      </div>
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
                  border: "1px solid var(--border-1)",
                  background: "none",
                  pointerEvents: "none",
                }}
              />
            ))}

          {!loading &&
            !isMobile &&
            mobileGroups.map((group) => (
              <div key={group.label} style={desktopGroupStyle}>
                <div style={{ ...mobileGroupLabelStyle, gridColumn: "1 / -1" }}>{group.label}</div>

                {group.games.map((game) => {
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
                  const isLongCard = group.games.length === 1;
                  const homeName = isLongCard
                    ? TEAM_NICKNAMES[homeId] ?? displayTeamName(game.hteam || TEAM_NAMES[homeId])
                    : TEAM_ABBR[homeId] ?? displayTeamName(game.hteam || TEAM_NAMES[homeId]);
                  const awayName = isLongCard
                    ? TEAM_NICKNAMES[awayId] ?? displayTeamName(game.ateam || TEAM_NAMES[awayId])
                    : TEAM_ABBR[awayId] ?? displayTeamName(game.ateam || TEAM_NAMES[awayId]);

                  const homeLost = status === "COMPLETED" && homeScore < awayScore;
                  const awayLost = status === "COMPLETED" && awayScore < homeScore;
                  const isFavGame = teamFeaturedMatch && favTeamId !== null &&
                    (homeId === favTeamId || awayId === favTeamId);

                  return (
                    <Link
                      key={game.id}
                      href={`/match/${game.id}?from=home`}
                      prefetch={false}
                      className={`card${status === "LIVE" ? " card-live" : ""}`}
                      style={{
                        ...cardStyle,
                        gridColumn: group.games.length === 1 ? "1 / -1" : undefined,
                        ...(isFavGame && status !== "LIVE" ? {
                          border: `3px solid ${teamBorderColor}`,
                          boxShadow: "none",
                        } : {}),
                      }}
                    >
                      <section style={teamsStyle}>
                        <TeamRow
                          logo={homeStyle.logo}
                          name={homeName}
                          scoreText={isUpcoming ? getTeamRecord(homeId, games, game) : String(homeScore)}
                          goalsText={isUpcoming ? "" : `${game.hgoals ?? 0}.${game.hbehinds ?? 0}`}
                          primaryColor={TEAM_BAR_COLORS[homeId] ?? homeStyle.colors[0]}
                          faded={homeLost}
                          scoreColor="white"
                          isRecord={isUpcoming}
                          compactRecord={!isLongCard && isUpcoming}
                          showBorder
                        />

                        <TeamRow
                          logo={awayStyle.logo}
                          name={awayName}
                          scoreText={isUpcoming ? getTeamRecord(awayId, games, game) : String(awayScore)}
                          goalsText={isUpcoming ? "" : `${game.agoals ?? 0}.${game.abehinds ?? 0}`}
                          primaryColor={TEAM_BAR_COLORS[awayId] ?? awayStyle.colors[0]}
                          faded={awayLost}
                          scoreColor="white"
                          isRecord={isUpcoming}
                          compactRecord={!isLongCard && isUpcoming}
                        />
                      </section>

                      <div style={cardVenueFooterStyle}>
                        {(status === "LIVE" || status === "COMPLETED") && (
                          <LiveViewerCount gameId={game.id} isComplete={status === "COMPLETED"} />
                        )}
                        <span
                          style={{
                            ...cardTimeStyle,
                            ...(status === "COMPLETED" ? fullTimeFooterTextStyle : null),
                          }}
                        >
                          {getTimeOnly(game)}
                        </span>
                        {game.venue ? <span style={cardMetaSeparatorStyle}>·</span> : null}
                        {game.venue ? <span style={cardVenueTextStyle}>{game.venue}</span> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}

          {!loading && isMobile && (
            <div ref={slideContainerRef} style={{ overflow: "hidden" }}>
              <div ref={slideWrapRef} style={{ display: "flex", willChange: "transform" }}>
                {/* Left panel: current round (or target when swiping right) */}
                <div style={{ flex: "0 0 100%", minWidth: 0 }}>
                  <MobileRoundPanel
                    groups={swipeTarget !== null && swipeTarget < selectedRound ? targetGroups : mobileGroups}
                    games={games}
                    teamFeaturedMatch={teamFeaturedMatch}
                    favTeamId={favTeamId}
                    teamBorderColor={teamBorderColor}
                  />
                  {(swipeTarget !== null && swipeTarget < selectedRound ? targetGroups : mobileGroups).length === 0 && (
                    <div style={emptyBoxStyle}>
                      No games found for Round {swipeTarget !== null && swipeTarget < selectedRound ? swipeTarget : selectedRound}.
                    </div>
                  )}
                </div>
                {/* Right panel: target round (or current when swiping right) — only during swipe */}
                {swipeTarget !== null && (
                  <div style={{ flex: "0 0 100%", minWidth: 0 }}>
                    <MobileRoundPanel
                      groups={swipeTarget > selectedRound ? targetGroups : mobileGroups}
                      games={games}
                      teamFeaturedMatch={teamFeaturedMatch}
                      favTeamId={favTeamId}
                      teamBorderColor={teamBorderColor}
                    />
                    {(swipeTarget > selectedRound ? targetGroups : mobileGroups).length === 0 && (
                      <div style={emptyBoxStyle}>
                        No games found for Round {swipeTarget > selectedRound ? swipeTarget : selectedRound}.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && !isMobile && shownGames.length === 0 && (
            <div style={emptyBoxStyle}>No games found for Round {selectedRound}.</div>
          )}
        </div>

        {byeTeams.length > 0 && (
          <>
            <div style={mobileGroupLabelStyle}>Bye</div>
            <div style={byeTeamsSectionStyle}>
              <div style={byeTeamsHeaderStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span style={byeTeamsLabelStyle}>Bye Teams</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingBottom: "10px" }}>
                {byeTeams.map((team) => (
                  <div key={team.id} style={mobileStackedTeamWrapStyle}>
                    <div style={{ width: 8, flexShrink: 0, background: team.color, borderRadius: "0 8px 8px 0" }} />
                    <div style={mobileStackedTeamRowStyle}>
                      <div style={mobileStackedTeamLeftStyle}>
                        <img src={team.logo} alt={team.name} style={mobileLogoStyle} loading="lazy" />
                        <strong style={mobileTeamNameStyle}>{team.name}</strong>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{team.record}</span>
                      </div>
                      {team.nextText && (
                        <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em", paddingRight: "4px" }}>{team.nextText}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {roundStarted && (
          <div style={topPlayersSectionStyle}>
            <div style={topPlayersHeaderStyle}>
              <h2 style={topPlayersTitleStyle}>Top Players</h2>
            </div>

            {topPlayers.length > 0 ? (
              <div style={topPlayersGridStyle} className="no-scrollbar">
                {topPlayers.map((player, index) => {
                  const logo = getTeamLogoFromName(player.team);
                  const imageCandidates = playerImageCandidates(player.name, player.team);

                  return (
                    <div key={`${player.name}-${index}`} style={topPlayerTileStyle}>
                      <span style={topRankStyle}>{index + 1}</span>

                      <div style={topPlayerCircleWrapStyle}>
                        <div style={{ ...topPlayerCircleStyle, background: player.teamColor }}>
                          <PlayerPhoto
                            candidates={imageCandidates}
                            alt={player.name}
                            imageStyle={topPlayerImageStyle}
                            fallbackStyle={topPlayerInitialsStyle}
                            initials={getInitials(player.name)}
                          />
                        </div>

                        {logo && <img src={logo} alt="" style={topPlayerLogoStyle} loading="lazy" />}
                      </div>

                      <div style={{ ...topRatingRowStyle, background: foopyColor(player.rating) }}>
                        <strong>{player.rating.toFixed(1)}</strong>
                      </div>

                      <span style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.5)",
                        letterSpacing: "0.01em",
                        textAlign: "center",
                        lineHeight: 1.2,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}>
                        {player.name.split(" ").pop()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={noTopPlayersStyle}>No Foopy ratings found for Round {selectedRound}.</div>
            )}
          </div>
        )}

        {roundStarted && (statLeaders.disposals.length > 0 || statLeaders.goals.length > 0 || statLeaders.hitouts.length > 0) && (
          <div style={statLeaderGridStyle}>
            {(
              [
                { label: "Top Disposals", statKey: "disposals", leaders: statLeaders.disposals, unit: "d" },
                { label: "Top Goals",     statKey: "goals",     leaders: statLeaders.goals,     unit: "g" },
                { label: "Top Hitouts",   statKey: "hitouts",   leaders: statLeaders.hitouts,   unit: "ho" },
              ] as { label: string; statKey: string; leaders: StatLeader[]; unit: string }[]
            ).map(({ label, statKey, leaders, unit }) => {
              const top = leaders[0];
              if (!top) return null;
              const topImageCandidates = playerImageCandidates(top.name, top.team);
              return (
                <Link key={label} href={`/round-stats?stat=${statKey}&round=${selectedRound}`} prefetch={false} style={{ ...statLeaderBoxStyle, textDecoration: "none", cursor: "pointer" }}>
                  {/* Photo + overlays */}
                  <div style={{ position: "relative", height: 140, background: top.teamColor, overflow: "hidden", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
                    <PlayerPhoto
                      candidates={topImageCandidates}
                      alt={top.name}
                      imageStyle={statLeaderHeroImageStyle}
                      fallbackStyle={statLeaderHeroFallbackStyle}
                      initials={getInitials(top.name)}
                    />
                    {/* gradient overlay */}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.72) 100%)" }} />
                    {/* rank badge */}
                    <div style={statLeaderRankBadgeStyle}>#1</div>
                    {/* stat category label */}
                    <div style={statLeaderCategoryStyle}>{label.replace("Top ", "")}</div>
                    {/* big stat value */}
                    <div style={statLeaderBigValueStyle}>
                      {top.value}
                      <span style={{ fontSize: "13px", fontWeight: 700, opacity: 0.75, marginLeft: 2 }}>{unit}</span>
                    </div>
                  </div>

                  {/* Primary player info */}
                  <div style={{ padding: "10px 12px 4px" }}>
                    <div style={statLeaderNameStyle}>{top.name.split(" ").pop()}</div>
                  </div>

                  {/* 2nd and 3rd */}
                  {leaders.slice(1).map((p, i) => {
                    const imageCandidates = playerImageCandidates(p.name, p.team);

                    return (
                    <div key={p.name} style={statLeaderRowStyle}>
                      <span style={{ fontSize: "9px", fontWeight: 900, color: "rgba(255,255,255,0.25)", width: 14, textAlign: "right", flexShrink: 0 }}>#{i + 2}</span>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: p.teamColor, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                        <PlayerPhoto
                          candidates={imageCandidates}
                          alt={p.name}
                          imageStyle={statLeaderAvatarImageStyle}
                          fallbackStyle={statLeaderAvatarFallbackStyle}
                          initials={getInitials(p.name)}
                        />
                      </div>
                      <span style={{ flex: 1, minWidth: 0, fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.split(" ").pop()}</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-2)", flexShrink: 0 }}>{p.value}<span style={{ fontSize: "9px", opacity: 0.55, marginLeft: 1 }}>{unit}</span></span>
                    </div>
                    );
                  })}

                  <div style={{ height: 2 }} />
                </Link>
              );
            })}
          </div>
        )}

        {/* ── Player Streaks ── */}
        {playerStreaks.length > 0 && selectedRound === currentRound && (
          <>
            <div style={mobileGroupLabelStyle}>Player Streaks</div>
            <div style={streakSectionStyle}>
              {playerStreaks.slice(0, 5).map((streak, i) => (
                <PlayerStreakRow key={`${streak.name}-${streak.label}`} streak={streak} index={i} mounted={mounted} />
              ))}
              {playerStreaks.length > 5 && (
                <button
                  onClick={() => setShowStreaksPopup(true)}
                  style={{ width: "100%", padding: "12px", background: "none", border: "none", borderTop: "1px solid var(--border-1)", color: "var(--text-3)", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}
                >
                  {`View ${playerStreaks.length - 5} more`}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </main>
    {showStreaksPopup && (
      <div style={streakPopupBackdropStyle} onClick={() => setShowStreaksPopup(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-streaks-title"
          style={streakPopupStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={streakPopupHeaderStyle}>
            <div>
              <div id="player-streaks-title" style={{ ...mobileGroupLabelStyle, padding: 0 }}>Player Streaks</div>
              <div style={streakPopupCountStyle}>{playerStreaks.length} active streaks</div>
            </div>
            <button type="button" aria-label="Close player streaks" onClick={() => setShowStreaksPopup(false)} style={streakPopupCloseStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div style={streakPopupListStyle}>
            {playerStreaks.map((streak, i) => (
              <PlayerStreakRow
                key={`${streak.name}-${streak.label}-popup`}
                streak={streak}
                index={i}
                mounted={mounted}
                onNavigate={() => setShowStreaksPopup(false)}
              />
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function PlayerStreakRow({
  streak,
  index,
  mounted,
  onNavigate,
}: {
  streak: PlayerStreakEntry;
  index: number;
  mounted: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={`/player/${streak.id}`}
      prefetch={false}
      onClick={onNavigate}
      style={{
        ...streakRowStyle,
        borderTop: index === 0 ? "none" : "1px solid var(--border-1)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: streak.teamColor, position: "relative", overflow: "hidden" }}>
        {mounted && (
          <PlayerPhoto
            candidates={playerImageCandidates(streak.name, streak.team)}
            alt={streak.name}
            imageStyle={streakAvatarImageStyle}
            fallbackStyle={streakAvatarFallbackStyle}
            initials={getInitials(streak.name)}
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={streakNameStyle}>{streak.name}</div>
        <div style={streakLabelStyle}>{streak.label}</div>
      </div>
      {streak.teamLogo && (
        <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: streak.teamColor, position: "relative", overflow: "hidden" }}>
          {mounted && (
            <img src={streak.teamLogo} alt={streak.team} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      )}
    </Link>
  );
}

function PlayerPhoto({
  candidates,
  alt,
  imageStyle,
  fallbackStyle,
  initials,
}: {
  candidates: string[];
  alt: string;
  imageStyle: React.CSSProperties;
  fallbackStyle: React.CSSProperties;
  initials: string;
}) {
  const candidatesKey = candidates.join("|");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(candidates.length === 0);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(candidates.length === 0);
  }, [candidatesKey, candidates.length]);

  const src = candidates[candidateIndex];

  if (!src || failed) {
    return (
      <span aria-label={alt} style={{ ...fallbackStyle, display: "grid" }}>
        {initials}
      </span>
    );
  }

  return (
    <img
      suppressHydrationWarning
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      style={imageStyle}
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((current) => Math.min(current + 1, candidates.length - 1));
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function MobileRoundPanel({
  groups,
  games,
  teamFeaturedMatch,
  favTeamId,
  teamBorderColor,
}: {
  groups: Array<{ label: string; games: Game[] }>;
  games: Game[];
  teamFeaturedMatch: boolean;
  favTeamId: number | null;
  teamBorderColor: string;
}) {
  return (
    <>
      {groups.map((group) => (
        <div
          key={group.label}
          style={{
            ...mobileGroupStyle,
            gridTemplateColumns: group.games.length >= 2 ? "repeat(2, minmax(0, 1fr))" : "1fr",
          }}
        >
          <div style={{ ...mobileGroupLabelStyle, gridColumn: "1 / -1" }}>{group.label}</div>

          {group.games.map((game) => {
            const homeId = game.hteamid;
            const awayId = game.ateamid;

            if (!homeId || !awayId) return null;

            const homeStyle = TEAM_STYLES[homeId];
            const awayStyle = TEAM_STYLES[awayId];

            if (!homeStyle || !awayStyle) return null;

            const status = getStatus(game);
            const isUpcoming = status === "UPCOMING";
            const isLongCard = group.games.length === 1;
            const homeName = isLongCard
              ? TEAM_NICKNAMES[homeId] ?? displayTeamName(game.hteam || TEAM_NAMES[homeId])
              : TEAM_ABBR[homeId] ?? displayTeamName(game.hteam || TEAM_NAMES[homeId]);
            const awayName = isLongCard
              ? TEAM_NICKNAMES[awayId] ?? displayTeamName(game.ateam || TEAM_NAMES[awayId])
              : TEAM_ABBR[awayId] ?? displayTeamName(game.ateam || TEAM_NAMES[awayId]);

            const isFavGame = teamFeaturedMatch && favTeamId !== null &&
              (homeId === favTeamId || awayId === favTeamId);

            return (
              <Link
                key={game.id}
                href={`/match/${game.id}?from=home`}
                prefetch={false}
                className={`card${status === "LIVE" ? " card-live" : ""}`}
                style={{
                  ...mobileMatchStyle,
                  gridColumn: group.games.length === 1 ? "1 / -1" : undefined,
                  ...(isFavGame && status !== "LIVE" ? {
                    border: `3px solid ${teamBorderColor}`,
                    boxShadow: "none",
                  } : {}),
                }}
              >
                <MobileMatchRow
                  homeLogo={homeStyle.logo}
                  awayLogo={awayStyle.logo}
                  homeName={homeName}
                  awayName={awayName}
                  homeScoreText={isUpcoming ? getTeamRecord(homeId, games, game) : String(game.hscore ?? 0)}
                  awayScoreText={isUpcoming ? getTeamRecord(awayId, games, game) : String(game.ascore ?? 0)}
                  homeGoalsText={isUpcoming ? "" : `${game.hgoals ?? 0}.${game.hbehinds ?? 0}`}
                  awayGoalsText={isUpcoming ? "" : `${game.agoals ?? 0}.${game.abehinds ?? 0}`}
                  homePrimaryColor={TEAM_BAR_COLORS[homeId] ?? homeStyle.colors[0]}
                  awayPrimaryColor={TEAM_BAR_COLORS[awayId] ?? awayStyle.colors[0]}
                  timeText={getTimeOnly(game)}
                  venue={game.venue}
                  homeLost={status === "COMPLETED" && (game.hscore ?? 0) < (game.ascore ?? 0)}
                  awayLost={status === "COMPLETED" && (game.ascore ?? 0) < (game.hscore ?? 0)}
                  isUpcoming={isUpcoming}
                  isLive={status === "LIVE"}
                  isComplete={status === "COMPLETED"}
                  compactRecord={!isLongCard && isUpcoming}
                  gameId={game.id}
                />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function LiveViewerCount({ gameId, isComplete = false }: { gameId: number; isComplete?: boolean }) {
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isComplete) {
      // Fetch total unique viewers who watched this match
      supabase
        .from("match_viewers")
        .select("*", { count: "exact", head: true })
        .eq("game_id", gameId)
        .then(({ count: c }) => { setCount(c ?? 0); setLoaded(true); });
      return;
    }

    // Track this user as a viewer of the live match
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("match_viewers").upsert(
          { game_id: gameId, user_id: user.id },
          { onConflict: "game_id,user_id" }
        );
      }
    });

    const ch = supabase.channel(`match-viewers-${gameId}`, {
      config: { presence: { key: "" } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setCount(Object.keys(ch.presenceState()).length);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, isComplete]);

  // Don't render while loading, or if the count is 0 (no tracked viewers yet)
  if (isComplete && (!loaded || count === 0)) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.56)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.68)", fontVariantNumeric: "tabular-nums" }}>
        {isComplete ? count : Math.max(1, count)}
      </span>
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
  homePrimaryColor,
  awayPrimaryColor,
  timeText,
  venue,
  homeLost,
  awayLost,
  isUpcoming,
  isLive,
  isComplete,
  compactRecord,
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
  homePrimaryColor: string;
  awayPrimaryColor: string;
  timeText: string;
  venue?: string;
  homeLost: boolean;
  awayLost: boolean;
  isUpcoming: boolean;
  isLive: boolean;
  isComplete: boolean;
  compactRecord: boolean;
  gameId: number;
}) {
  return (
    <div style={mobileMatchContentStyle}>
      <div style={mobileMatchInnerStyle}>
        <MobileStackedTeamRow
          logo={homeLogo}
          name={homeName}
          goalsText={homeGoalsText}
          scoreText={homeScoreText}
          primaryColor={homePrimaryColor}
          faded={homeLost}
          winning={!isUpcoming && Number(homeScoreText) > Number(awayScoreText)}
          isRecord={isUpcoming}
          compactRecord={compactRecord}
          showBorder
        />

        <MobileStackedTeamRow
          logo={awayLogo}
          name={awayName}
          goalsText={awayGoalsText}
          scoreText={awayScoreText}
          primaryColor={awayPrimaryColor}
          faded={awayLost}
          winning={!isUpcoming && Number(awayScoreText) > Number(homeScoreText)}
          isRecord={isUpcoming}
          compactRecord={compactRecord}
        />
      </div>

      <div style={mobileMatchFooterStyle}>
        {(isLive || isComplete) && (
          <LiveViewerCount gameId={gameId} isComplete={isComplete} />
        )}
        <span
          style={{
            ...mobileFooterTimeStyle,
            ...(timeText === "Full Time" ? fullTimeFooterTextStyle : null),
          }}
        >
          {timeText}
        </span>
        {venue ? <span style={cardMetaSeparatorStyle}>·</span> : null}
        {venue ? <span style={mobileVenueStyle}>{venue}</span> : null}
      </div>
    </div>
  );
}

function MobileStackedTeamRow({
  logo,
  name,
  goalsText,
  scoreText,
  primaryColor,
  faded,
  winning,
  isRecord,
  compactRecord,
  showBorder,
}: {
  logo: string;
  name: string;
  goalsText: string;
  scoreText: string;
  primaryColor: string;
  faded: boolean;
  winning: boolean;
  isRecord: boolean;
  compactRecord: boolean;
  showBorder?: boolean;
}) {
  return (
    <div style={{ ...mobileStackedTeamWrapStyle, opacity: faded ? 0.45 : 1 }}>
      <div style={{ width: 8, flexShrink: 0, background: primaryColor, borderRadius: "0 8px 8px 0" }} />
      <div style={mobileStackedTeamRowStyle}>
        <div style={mobileStackedTeamLeftStyle}>
          <img src={logo} alt={name} style={mobileLogoStyle} loading="lazy" />
          <strong style={mobileTeamNameStyle}>{name}</strong>
        </div>

        <div style={mobileStackedScoreWrapStyle}>
          <strong
            style={{
              ...mobileStackedScoreStyle,
              color: isRecord ? "#d6d7e3" : "#ffffff",
              fontSize: compactRecord ? "20px" : "23px",
              fontWeight: 900,
              fontStyle: "normal",
            }}
          >
            {scoreText}
          </strong>
          {goalsText ? <span style={mobileGoalsStyle}>{goalsText}</span> : null}
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  logo,
  name,
  scoreText,
  goalsText,
  primaryColor,
  faded,
  scoreColor,
  isRecord,
  compactRecord,
  showBorder,
}: {
  logo: string;
  name: string;
  scoreText: string;
  goalsText: string;
  primaryColor: string;
  faded: boolean;
  scoreColor: string;
  isRecord: boolean;
  compactRecord?: boolean;
  showBorder?: boolean;
}) {
  return (
    <div style={{ ...teamRowWrap, opacity: faded ? 0.45 : 1 }}>
      <div style={{ width: 8, flexShrink: 0, background: primaryColor, borderRadius: "0 8px 8px 0" }} />
      <div style={teamRow}>
        <div style={teamLeft}>
          <img src={logo} alt={name} style={logoStyle} loading="lazy" />
          <strong style={teamNameStyle}>{name}</strong>
        </div>

        <div style={scoreWrap}>
          <strong
            style={{
              ...scoreStyle,
              fontSize: compactRecord ? "23px" : "28px",
              fontWeight: 900,
              fontStyle: "normal",
              color: isRecord ? "#d6d7e3" : scoreColor,
            }}
          >
            {scoreText}
          </strong>
          {goalsText ? <span style={goalsStyle}>{goalsText}</span> : null}
        </div>
      </div>
    </div>
  );
}

const cardTimeStyle: React.CSSProperties = {
  flexShrink: 0,
  color: "rgba(255,255,255,0.78)",
  fontSize: "11.5px",
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: "0.01em",
  fontVariantNumeric: "tabular-nums",
  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
};

const cardVenueFooterStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  gap: 8,
  padding: "10px 12px 8px",
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(18,18,18,0) 0%, rgba(18,18,18,0.62) 58%, rgba(18,18,18,0.86) 100%)",
  pointerEvents: "none",
};

const cardMetaSeparatorStyle: React.CSSProperties = {
  flexShrink: 0,
  color: "rgba(255,255,255,0.25)",
  fontSize: "11px",
  fontWeight: 600,
  lineHeight: 1,
  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
};

const cardVenueTextStyle: React.CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
  color: "rgba(255,255,255,0.48)",
  fontSize: "11px",
  fontWeight: 500,
  lineHeight: 1.15,
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
};

const fullTimeFooterTextStyle: React.CSSProperties = {
  fontSize: "11.5px",
  fontWeight: 600,
};

const desktopGroupStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
  padding: "0 0 12px",
};

const mobileGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "0 0 8px",
};

const mobileGroupLabelStyle: React.CSSProperties = {
  padding: "18px 2px 10px",
  color: "#fff",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
};

const mobileMatchStyle: React.CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  color: "var(--text-1)",
  textDecoration: "none",
  overflow: "hidden",
  transition: "transform 0.1s ease, opacity 0.1s ease",
};

const mobileMatchContentStyle: React.CSSProperties = {
  position: "relative",
};

const mobileMatchInnerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  padding: "10px 0 32px",
};

const mobileMatchFooterStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: "30px",
  padding: "10px 8px 7px",
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(18,18,18,0) 0%, rgba(18,18,18,0.62) 58%, rgba(18,18,18,0.86) 100%)",
  pointerEvents: "none",
};

const mobileVenueStyle: React.CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
  fontSize: "11px",
  fontWeight: 500,
  color: "rgba(255,255,255,0.48)",
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
};

const mobileFooterTimeStyle: React.CSSProperties = {
  flexShrink: 0,
  color: "rgba(255,255,255,0.78)",
  fontSize: "11.5px",
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: "0.01em",
  fontVariantNumeric: "tabular-nums",
  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
};

const mobileStackedTeamWrapStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "44px",
};

const mobileStackedTeamRowStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
  padding: "0 14px 0 10px",
};

const mobileStackedTeamLeftStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "10px",
  overflow: "visible",
};

const mobileTeamNameStyle: React.CSSProperties = {
  minWidth: 0,
  display: "inline-block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: '"Druk Wide", "Arial Black", Impact, sans-serif',
  fontSize: "15px",
  lineHeight: 1.1,
  fontWeight: 700,
  fontStyle: "italic",
  letterSpacing: "0em",
};

const mobileLogoStyle: React.CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  objectFit: "cover",
  background: "var(--surface-2)",
  flexShrink: 0,
};

const mobileStackedScoreWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: "2px",
  flexShrink: 0,
};

const mobileGoalsStyle: React.CSSProperties = {
  color: "var(--text-3)",
  fontSize: "10px",
  lineHeight: 1,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

const mobileStackedScoreStyle: React.CSSProperties = {
  textAlign: "right",
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: "0em",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
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
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  borderBottom: "0.5px solid var(--border-1)",
  willChange: "transform",
};

const headerTopStyle: React.CSSProperties = {
  height: "calc(52px + env(safe-area-inset-top))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  paddingTop: "env(safe-area-inset-top)",
};

const headerRoundsScroll: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "5px 14px 7px",
  scrollBehavior: "smooth",
  scrollbarWidth: "none",
};

const headerRoundsDesktop: React.CSSProperties = {
  ...headerRoundsScroll,
  width: "100%",
  justifyContent: "flex-start",
};

const headerRoundItem: React.CSSProperties = {
  position: "relative",
  flex: "0 0 auto",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px 10px 8px",
};

const headerRoundItemDesktop: React.CSSProperties = {
  ...headerRoundItem,
};

const headerRoundText: React.CSSProperties = {
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const headerRoundUnderline: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 10,
  right: 10,
  height: "2px",
  borderRadius: "999px",
};


const headerTitleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--text-1)",
  textAlign: "center",
};


const wrapStyle: React.CSSProperties = {
  maxWidth: "1320px",
  margin: "0 auto",
  padding: "8px 10px calc(90px + env(safe-area-inset-bottom))",
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "16px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  color: "var(--text-1)",
  textDecoration: "none",
};

const teamsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  padding: "12px 0 36px",
};

const teamRowWrap: React.CSSProperties = {
  display: "flex",
  minHeight: "58px",
};

const teamRow: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: "0 26px 0 16px",
};

const teamLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  minWidth: 0,
  overflow: "visible",
};

const logoStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  objectFit: "cover",
  background: "var(--surface-2)",
  flexShrink: 0,
};

const teamNameStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: '"Druk Wide", "Arial Black", Impact, sans-serif',
  fontSize: "20px",
  lineHeight: 1.1,
  fontWeight: 700,
  fontStyle: "italic",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  letterSpacing: "0em",
};

const scoreWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: "3px",
  flexShrink: 0,
};

const scoreStyle: React.CSSProperties = {
  fontSize: "26px",
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: "0em",
  fontVariantNumeric: "tabular-nums",
};

const goalsStyle: React.CSSProperties = {
  fontSize: "11px",
  lineHeight: 1,
  fontWeight: 600,
  color: "var(--text-3)",
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
  minHeight: "120px",
  display: "grid",
  placeItems: "center",
  padding: "32px 24px",
  border: "1px solid var(--border-1)",
  borderRadius: "16px",
  color: "var(--text-3)",
  fontSize: "14px",
  fontWeight: 600,
  background: "var(--surface-1)",
  letterSpacing: "0.01em",
};

const topPlayersSectionStyle: React.CSSProperties = {
  marginTop: "24px",
  padding: "16px 16px 20px",
  borderRadius: "16px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-1)",
};

const topPlayersHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  marginBottom: "12px",
};

const topPlayersTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 800,
  letterSpacing: "-0.01em",
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
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "12px 6px",
  paddingBottom: "4px",
  overflow: "visible",
};

const topPlayerTileStyle: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "5px",
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
  width: "48px",
  height: "48px",
  flexShrink: 0,
};

const topPlayerCircleStyle: React.CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "999px",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  border: "1.5px solid var(--border-3)",
  boxShadow: "0 2px 10px rgba(0,0,0,.4), inset 0 -8px 14px rgba(0,0,0,.3)",
};

const topPlayerImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top center",
};

const topPlayerInitialsStyle: React.CSSProperties = {
  display: "none",
  width: "100%",
  height: "100%",
  placeItems: "center",
  fontWeight: 950,
  fontSize: "15px",
  color: "var(--text-1)",
};

const topPlayerLogoStyle: React.CSSProperties = {
  position: "absolute",
  right: "-4px",
  bottom: "-4px",
  width: "19px",
  height: "19px",
  objectFit: "contain",
  borderRadius: "50%",
  border: "2px solid var(--surface-1)",
  background: "var(--surface-1)",
};

const topRatingRowStyle: React.CSSProperties = {
  minWidth: "40px",
  height: "24px",
  padding: "0 7px",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  fontWeight: 900,
  color: "var(--text-1)",
  textShadow: "0 1px 2px rgba(0,0,0,.45)",
  boxShadow: "inset 0 -1px 0 rgba(0,0,0,.18)",
};

const noTopPlayersStyle: React.CSSProperties = {
  padding: "18px",
  borderRadius: "16px",
  border: "1px dashed var(--border-3)",
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

const statLeaderGridStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "10px",
};

const statLeaderBoxStyle: React.CSSProperties = {
  borderRadius: "14px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-1)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  gap: "0px",
};

const statLeaderHeroImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top center",
};

const statLeaderHeroFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  placeItems: "center",
  fontSize: "42px",
  fontWeight: 950,
  color: "#fff",
  background: "rgba(0,0,0,0.18)",
};

const statLeaderRankBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  background: "#eab308",
  color: "#000",
  fontSize: "10px",
  fontWeight: 900,
  padding: "3px 7px",
  borderRadius: "999px",
  letterSpacing: "0.02em",
};

const statLeaderCategoryStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  background: "rgba(0,0,0,0.45)",
  color: "rgba(255,255,255,0.7)",
  fontSize: "8px",
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  padding: "3px 6px",
  borderRadius: "6px",
};

const statLeaderBigValueStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 10,
  fontSize: "28px",
  fontWeight: 900,
  color: "#ffffff",
  lineHeight: 1,
  letterSpacing: "-0.03em",
  fontVariantNumeric: "tabular-nums",
  textShadow: "0 1px 6px rgba(0,0,0,0.5)",
};

const statLeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "6px 12px",
  borderTop: "1px solid var(--border-1)",
};

const statLeaderAvatarImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top center",
};

const statLeaderAvatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  placeItems: "center",
  fontSize: "9px",
  fontWeight: 900,
  color: "#fff",
};

const statLeaderNameStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 800,
  color: "var(--text-1)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  lineHeight: 1.2,
};

const statLeaderSubStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  color: "rgba(255,255,255,0.38)",
  whiteSpace: "nowrap",
  marginTop: "2px",
};

const byeTeamsSectionStyle: React.CSSProperties = {
  marginTop: "20px",
  borderRadius: "16px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  overflow: "hidden",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
};

const byeTeamsHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "12px 16px 10px",
};

const byeTeamsLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)",
};

const streakSectionStyle: React.CSSProperties = {
  marginTop: "20px",
  borderRadius: "16px",
  border: "1px solid var(--border-1)",
  background: "var(--surface-3)",
  overflow: "hidden",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
};

const streakPopupBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 160,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px 12px calc(18px + env(safe-area-inset-bottom))",
  background: "rgba(0,0,0,0.72)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const streakPopupStyle: React.CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "min(78dvh, 680px)",
  borderRadius: "18px",
  border: "1px solid var(--border-2)",
  background: "var(--surface-3)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.72)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const streakPopupHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "16px 16px 12px",
  borderBottom: "1px solid var(--border-1)",
};

const streakPopupCountStyle: React.CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  fontWeight: 700,
  color: "var(--text-3)",
};

const streakPopupCloseStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.07)",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const streakPopupListStyle: React.CSSProperties = {
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

const streakRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "11px 14px",
};

const streakAvatarImageStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "top center",
  borderRadius: "50%",
};

const streakAvatarFallbackStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  placeItems: "center",
  fontSize: 13,
  fontWeight: 800,
  color: "#fff",
};


const streakNameStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 800,
  color: "var(--text-1)",
  letterSpacing: "-0.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const streakLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-3)",
  marginTop: "2px",
};

// ── Duel Homepage Card ────────────────────────────────────────────────────────

type DuelCardData = {
  type: "available" | "active" | "waiting" | "result";
  duelGameId: string;
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  round: number;
  opponentName?: string;
  opponentAvatar?: string | null;
  myScore?: number;
  oppScore?: number;
  won?: boolean;
  isDraw?: boolean;
};

function DuelHomepageCard() {
  const [card, setCard]     = useState<DuelCardData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      const userId = data.session?.user.id;
      if (!token || !userId) { setChecked(true); return; }

      // Fetch all open duel games
      try {
        const res = await fetch("/api/duels/history", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setChecked(true); return; }
        const json = await res.json();
        const duels: any[] = json.duels ?? [];

        // Priority 1: active/waiting duel
        const activeDuel = duels.find((d: any) => d.status === "active" || d.status === "waiting");
        if (activeDuel) {
          const dg = activeDuel.duel_game;
          const isChallenger = activeDuel.challenger_id === userId;
          const opp = isChallenger ? activeDuel.opponent : activeDuel.challenger;
          setCard({
            type: activeDuel.status as "active" | "waiting",
            duelGameId: dg.id,
            gameId: dg.game_id,
            homeTeam: dg.home_team,
            awayTeam: dg.away_team,
            round: dg.round,
            opponentName: opp?.display_name || opp?.username || undefined,
            opponentAvatar: opp?.avatar_url ?? null,
          });
          setChecked(true);
          return;
        }

        // Priority 2: available duel game (fetch open duel games)
        const gamesRes = await fetch("/api/duels/open");
        if (gamesRes.ok) {
          const gamesJson = await gamesRes.json();
          const openGame = (gamesJson.games ?? []).find(
            (g: any) => g.status === "open" && new Date(g.game_date) > new Date()
          );
          if (openGame) {
            setCard({
              type: "available",
              duelGameId: openGame.id,
              gameId: openGame.game_id,
              homeTeam: openGame.home_team,
              awayTeam: openGame.away_team,
              round: openGame.round,
            });
          }
        }
      } catch {}
      setChecked(true);
    });
  }, []);

  if (!checked || !card) return null;

  const href = `/match/${card.gameId}?tab=duels`;

  const isActive    = card.type === "active";
  const isWaiting   = card.type === "waiting";
  const isAvailable = card.type === "available";
  const isResult    = card.type === "result";

  const accent = isAvailable ? "#818cf8"
    : isActive  ? "#22c55e"
    : isWaiting ? "#f59e0b"
    : card.won  ? "#22c55e"
    : card.isDraw ? "#f59e0b"
    : "#ef4444";

  const accent2 = isAvailable ? "#6366f1"
    : isActive  ? "#16a34a"
    : isWaiting ? "#d97706"
    : card.won  ? "#16a34a"
    : card.isDraw ? "#d97706"
    : "#dc2626";

  const statusLabel = isAvailable ? "DUEL AVAILABLE"
    : isActive  ? "ACTIVE DUEL"
    : isWaiting ? "FINDING OPPONENT"
    : card.won  ? "DUEL WON"
    : card.isDraw ? "DRAW"
    : "DUEL LOST";

  const teamLogoUrl = (name: string) => {
    const k = name.toLowerCase().replace(/[^a-z]/g, "");
    const map: Record<string, string> = {
      adelaide:"crows",adelaidecrows:"crows",brisbane:"lions",brisbanelions:"lions",
      carlton:"blues",collingwood:"magpies",essendon:"bombers",fremantle:"dockers",
      geelong:"cats",geelongcats:"cats",goldcoast:"suns",goldcoastsuns:"suns",
      gws:"giants",gwsgiants:"giants",greaterwesternsydney:"giants",
      hawthorn:"hawks",hawthornhawks:"hawks",melbourne:"demons",melbournedemons:"demons",
      northmelbourne:"kangaroos",northmelbournekangaroos:"kangaroos",
      portadelaide:"power",portadelaidepower:"power",richmond:"tigers",richmondtigers:"tigers",
      stkilda:"saints",stkildasaints:"saints",sydney:"swans",sydneyswans:"swans",
      westcoast:"eagles",westcoasteagles:"eagles",westernbulldogs:"bulldogs",
    };
    const slug = map[k];
    return slug ? `/team-logos/${slug}.png` : "";
  };

  const homeLogo = teamLogoUrl(card.homeTeam);
  const awayLogo = teamLogoUrl(card.awayTeam);

  return (
    <>
      <style>{`
        @keyframes dc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}
        @keyframes dc-sweep{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes dc-spin{to{transform:rotate(360deg)}}
        @keyframes dc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .dc-root{transition:transform .14s,box-shadow .14s}
        .dc-root:active{transform:scale(.975)}
      `}</style>

      <Link href={href} className="dc-root" style={{
        display: "block", borderRadius: 20, textDecoration: "none",
        color: "var(--text-1)", overflow: "hidden", position: "relative",
        background: `linear-gradient(145deg,#0f1117 0%,#13161e 100%)`,
        border: `1px solid ${accent}35`,
        boxShadow: `0 2px 20px ${accent}18, 0 1px 0 ${accent}20 inset`,
        animation: "dc-in .3s ease both",
        marginBottom: 4,
      }}>

        {/* Top accent bar with sweep animation for available */}
        <div style={{
          height: 3,
          background: isAvailable
            ? `linear-gradient(90deg,transparent 0%,${accent} 40%,${accent2} 60%,transparent 100%)`
            : `linear-gradient(90deg,${accent2},${accent},${accent2})`,
          backgroundSize: "200% 100%",
          animation: isAvailable ? "dc-sweep 2.4s linear infinite" : undefined,
        }} />

        {/* Glow orb */}
        <div style={{
          position: "absolute", top: -30, right: -20, width: 120, height: 120,
          borderRadius: "50%", background: `${accent}10`,
          filter: "blur(28px)", pointerEvents: "none",
        }} />

        <div style={{ padding: "12px 14px 14px", position: "relative" }}>

          {/* Status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            {isActive && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0, animation: "dc-pulse 1.6s ease-in-out infinite" }} />
            )}
            {isWaiting && (
              <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${accent}40`, borderTopColor: accent, flexShrink: 0, animation: "dc-spin .9s linear infinite" }} />
            )}
            {(isAvailable || isResult) && (
              <span style={{ fontSize: 14 }}>
                {isAvailable ? "⚔" : card.won ? "🏆" : card.isDraw ? "🤝" : "💀"}
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", color: accent }}>
              {statusLabel}
            </span>

            {isResult && (
              <div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 900, color: accent, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {card.myScore ?? 0}
                <span style={{ fontSize: 14, color: "#334155", margin: "0 3px" }}>–</span>
                {card.oppScore ?? 0}
              </div>
            )}
          </div>

          {/* Matchup row — game info left, opponent/CTA right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Team logos */}
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {homeLogo && <img src={homeLogo} alt={card.homeTeam} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid #0f1117", background: "rgba(255,255,255,0.06)", zIndex: 2, position: "relative" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
              {awayLogo && <img src={awayLogo} alt={card.awayTeam} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid #0f1117", background: "rgba(255,255,255,0.06)", marginLeft: -8, zIndex: 1, position: "relative" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            </div>

            {/* Game text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.15, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {card.homeTeam} <span style={{ color: "#334155", fontWeight: 500 }}>vs</span> {card.awayTeam}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontWeight: 600 }}>Round {card.round}</div>
            </div>

            {/* Right: opponent for active/waiting, score for result, CTA for available */}
            {(isActive || isWaiting) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>vs</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8" }}>
                    {card.opponentName || (isWaiting ? "searching..." : "opponent")}
                  </div>
                </div>
                {card.opponentAvatar ? (
                  <img src={card.opponentAvatar} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: `2px solid ${accent}50`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${accent}20`, border: `2px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: accent, flexShrink: 0 }}>
                    {card.opponentName ? card.opponentName[0].toUpperCase() : "?"}
                  </div>
                )}
              </div>
            )}

            {isResult && (
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: accent, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {card.myScore ?? 0}<span style={{ fontSize: 14, color: "#334155", margin: "0 2px" }}>–</span>{card.oppScore ?? 0}
                </div>
                {card.opponentName && (
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>vs {card.opponentName}</div>
                )}
              </div>
            )}

            {isAvailable && (
              <div style={{ padding: "7px 14px", borderRadius: 10, background: `linear-gradient(135deg,${accent},${accent2})`, color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: "0.01em", flexShrink: 0 }}>
                Enter →
              </div>
            )}
          </div>
        </div>
      </Link>
    </>
  );
}

