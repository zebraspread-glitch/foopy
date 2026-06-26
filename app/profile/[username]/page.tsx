"use client";

import { formatAura } from "@/app/lib/format";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Layers, Star, Ticket, MessageCircle, Heart, Tv, Zap, BarChart2, Trophy, ChevronLeft, MoreHorizontal } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import AuraBadge from "@/app/components/AuraBadge";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
import { PlayerCard } from "@/app/components/PlayerCard";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { getPassLevel, PLAYER_PASS_LEVELS, TEAM_PASS_LEVELS, dedupePlayerPasses, type PlayerPass, type TeamPass } from "@/app/lib/passes";
import { PlayerPassCard, TeamPassCard } from "@/app/components/PassCard";
import playersData from "@/app/data/players.json";
import { playerImgUrlFromFolder } from "@/app/lib/playerImage";
import { nameColorStyle } from "@/app/lib/cosmetics";
import { ReportBlockSheet } from "@/app/components/ReportBlockMenu";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/match/[id]/utils";
import { loadPollEntries, type PollEntry } from "@/app/lib/pollHistory";
import PollPickList from "@/app/components/PollPickList";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, [query]);

  return matches;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

// Drives the collapsing header purely through CSS custom properties so the
// scroll handler never triggers a React re-render of the (heavy) profile page.
// `--php` is the raw 0..1 progress, `--phe` is the smoothstep-eased value.
// Both styles below reference these vars via calc(), so the browser does the
// interpolation on its own — buttery on every frame.
function useProfileHeaderScroll(distance = 240) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const p = clamp01((document.scrollingElement?.scrollTop ?? window.scrollY) / distance);
      const e = p * p * (3 - 2 * p); // smoothstep — matches easeProfile
      root.style.setProperty("--php", p.toFixed(4));
      root.style.setProperty("--phe", e.toFixed(4));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(apply); };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.style.removeProperty("--php");
      root.style.removeProperty("--phe");
    };
  }, [distance]);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FavSlot =
  | { type: "team" | "player"; label: string; sublabel?: string; image: string; color: string }
  | null;

type FeaturedCardSlot = { player_id: string; rarity: string };
type FeaturedPassSlot = { type: "player" | "team"; id: string };

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  verified?: boolean;
  bio: string | null;
  created_at: string | null;
  favourites: FavSlot[] | null;
  featured_cards: FeaturedCardSlot[] | null;
  featured_passes: FeaturedPassSlot[] | null;
  aura: number | null;
  coins: number | null;
  favourite_team: string | null;
  matches_viewed: number | null;
  total_likes: number | null;
  name_color: string | null;
};

type FriendEntry = { id: string; username: string | null; avatar_url: string | null; verified?: boolean };

// ── Teams ────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: "Adelaide",             logo: "/team-logos/crows.png",     color: "#002b5c" },
  { name: "Adelaide Crows",       logo: "/team-logos/crows.png",     color: "#002b5c" },
  { name: "Brisbane",             logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Brisbane Lions",       logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Carlton",              logo: "/team-logos/blues.png",     color: "#031a35" },
  { name: "Collingwood",          logo: "/team-logos/magpies.png",   color: "#1e1e28" },
  { name: "Essendon",             logo: "/team-logos/bombers.png",   color: "#cc0000" },
  { name: "Fremantle",            logo: "/team-logos/dockers.png",   color: "#4b1979" },
  { name: "Geelong",              logo: "/team-logos/cats.png",      color: "#003b73" },
  { name: "Geelong Cats",         logo: "/team-logos/cats.png",      color: "#003b73" },
  { name: "Gold Coast",           logo: "/team-logos/suns.png",      color: "#c0392b" },
  { name: "Gold Coast Suns",      logo: "/team-logos/suns.png",      color: "#c0392b" },
  { name: "GWS",                  logo: "/team-logos/giants.png",    color: "#e05a1a" },
  { name: "GWS Giants",           logo: "/team-logos/giants.png",    color: "#e05a1a" },
  { name: "Hawthorn",             logo: "/team-logos/hawks.png",     color: "#6b3a1f" },
  { name: "Hawthorn Hawks",       logo: "/team-logos/hawks.png",     color: "#6b3a1f" },
  { name: "Melbourne",            logo: "/team-logos/demons.png",    color: "#c8102e" },
  { name: "Melbourne Demons",     logo: "/team-logos/demons.png",    color: "#c8102e" },
  { name: "North Melbourne",      logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide",        logo: "/team-logos/power.png",     color: "#008999" },
  { name: "Port Adelaide Power",  logo: "/team-logos/power.png",     color: "#008999" },
  { name: "Richmond",             logo: "/team-logos/tigers.png",    color: "#facc15" },
  { name: "Richmond Tigers",      logo: "/team-logos/tigers.png",    color: "#facc15" },
  { name: "St Kilda",             logo: "/team-logos/saints.png",    color: "#c8102e" },
  { name: "St Kilda Saints",      logo: "/team-logos/saints.png",    color: "#c8102e" },
  { name: "Sydney",               logo: "/team-logos/swans.png",     color: "#c0392b" },
  { name: "Sydney Swans",         logo: "/team-logos/swans.png",     color: "#c0392b" },
  { name: "West Coast",           logo: "/team-logos/eagles.png",    color: "#003087" },
  { name: "West Coast Eagles",    logo: "/team-logos/eagles.png",    color: "#003087" },
  { name: "Western Bulldogs",     logo: "/team-logos/bulldogs.png",  color: "#1a4abf" },
];

const RARITY_META: Record<string, { color: string; glow: string }> = {
  bronze:      { color: "#cd7f32", glow: "rgba(205,127,50,0.6)" },
  silver:      { color: "#c0c0c0", glow: "rgba(192,192,192,0.6)" },
  gold:        { color: "#ffd700", glow: "rgba(255,215,0,0.6)" },
  emerald:     { color: "#10b981", glow: "rgba(16,185,129,0.65)" },
  sapphire:    { color: "#3b82f6", glow: "rgba(59,130,246,0.65)" },
  ruby:        { color: "#ef4444", glow: "rgba(239,68,68,0.65)" },
  amethyst:    { color: "#a78bfa", glow: "rgba(167,139,250,0.70)" },
  diamond:     { color: "#67e8f9", glow: "rgba(103,232,249,0.70)" },
  pinkdiamond: { color: "#f472b6", glow: "rgba(244,114,182,0.70)" },
  mythic:      { color: "#c084fc", glow: "rgba(192,132,252,0.80)" },
};

function slugName(s: string) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerImagePath(name: string, team?: string) {
  const resolvedTeam = team || playerBySlug.get(slugName(name))?.team || "";
  const folder = TEAMS.find(t => slugName(t.name) === slugName(resolvedTeam))?.name
    .toLowerCase().replace(/\s+/g, "") ?? slugName(resolvedTeam);
  const clubFolder: Record<string, string> = {
    adelaide: "crows", adelaidecrows: "crows", brisbane: "lions", brisbanelions: "lions", carlton: "blues",
    collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
    geelong: "cats", geelongcats: "cats", goldcoast: "suns", gws: "giants", gwsgiants: "giants",
    greaterwesternsydney: "giants", greaterwesternsydneygiants: "giants",
    hawthorn: "hawks", melbourne: "demons", northmelbourne: "kangaroos",
    portadelaide: "power", richmond: "tigers", stkilda: "saints",
    sydney: "swans", westcoast: "eagles", westernbulldogs: "bulldogs",
  };
  const f = clubFolder[folder] ?? folder;
  return f ? playerImgUrlFromFolder(f, slugName(name)) : "";
}

function teamColor(teamName?: string) {
  const aliases: Record<string, string> = {
    Brisbane: "Brisbane Lions",
    Geelong: "Geelong Cats",
    "Greater Western Sydney": "GWS",
    "Greater Western Sydney Giants": "GWS",
    "GWS Giants": "GWS",
  };
  const resolved = aliases[teamName ?? ""] ?? teamName;
  return TEAMS.find(t => t.name === resolved)?.color;
}

function normaliseFavSlot(slot: FavSlot): FavSlot {
  if (!slot) return null;
  if (slot.type === "player") {
    return { ...slot, image: playerImagePath(slot.label, slot.sublabel), color: teamColor(slot.sublabel) ?? slot.color };
  }
  const team = TEAMS.find(t => t.name === slot.label);
  if (team) return { ...slot, image: team.logo, color: team.color };
  return slot;
}

function normaliseFavSlots(slots: FavSlot[]): FavSlot[] {
  return slots.slice(0, 8).map(normaliseFavSlot).concat(Array(Math.max(0, 8 - slots.length)).fill(null));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_PALETTE: [string, string][] = [
  ["#1a3a5c","#60a5fa"],["#2d1b4e","#c084fc"],["#1a3d2e","#4ade80"],
  ["#3d2a10","#fb923c"],["#3d1a1a","#f87171"],["#1a3d3a","#2dd4bf"],
  ["#2a2a10","#facc15"],["#1a2a3d","#38bdf8"],
];

function avatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

// ── Comment type ─────────────────────────────────────────────────────────────

type Comment = { id: string; body: string; created_at: string; game_id: number | null; event_key: string | null };

// Maps built once from players.json import
// eventId → { name, team }  (for play event keys like q1_m5_tgoal_p804 — _p uses Squiggle eventIds)
// slugName(name) → { name, team }  (for player_ event keys)
const playerByEventId = new Map<number, { name: string; team: string }>();
const playerBySlug    = new Map<string, { name: string; team: string }>();
for (const p of playersData as Array<{ name: string; team: string; eventIds?: number[] }>) {
  for (const eid of (Array.isArray(p.eventIds) ? p.eventIds : [])) playerByEventId.set(eid, p);
  playerBySlug.set(slugName(p.name), p);
}

// ── Fav slot component (needs its own hook) ───────────────────────────────────

function FavSlotView({ slot }: { slot: NonNullable<FavSlot> }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = slot.image && !imgErr;

  return (
    <div style={{ minWidth: 0, textAlign: "center" as const }}>
      <div style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", border: "2px solid var(--border-3)", display: "flex", alignItems: "center", justifyContent: "center", background: slot.color || "#1e2438" }}>
        {showImg ? (
          <img
            src={slot.image}
            alt={slot.label}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "var(--text-1)", fontSize: 16, fontWeight: 950 }}>{initials(slot.label)}</span>
        )}
      </div>
      <div style={{ marginTop: 7, color: "var(--text-3)", fontSize: 10, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {slot.type === "team"
          ? slot.label.replace(" Lions","").replace(" Cats","").replace(" Giants","").replace(" Bulldogs","")
          : slot.label.split(" ").pop()}
      </div>
    </div>
  );
}

function TeamLogoImg({ name }: { name: string }) {
  const team = TEAMS.find(t => t.name === name || t.name.startsWith(name));
  const [err, setErr] = useState(false);
  if (!team || err) return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: team?.color ?? "#1e293b", border: "1.5px solid var(--border-3)" }} />
  );
  return (
    <img src={team.logo} alt={name} onError={() => setErr(true)}
      style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1.5px solid var(--border-3)", background: team.color }} />
  );
}

function CommentRow({ comment, imgSrc, teams, href }: {
  comment: Comment;
  imgSrc: string | null;
  teams: { hteam: string; ateam: string } | null;
  href: string | null;
}) {
  const [imgErr, setImgErr] = useState(false);
  const router = useRouter();
  return (
    <div
      onClick={() => href && router.push(href)}
      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)", cursor: href ? "pointer" : "default" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.5, wordBreak: "break-word" as const }}>
          {comment.body}
        </p>
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>
          {timeAgo(comment.created_at)}
        </div>
      </div>
      {imgSrc && !imgErr ? (
        <img src={imgSrc} alt="" onError={() => setImgErr(true)}
          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid var(--border-2)", background: "var(--surface-1)" }} />
      ) : teams ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <TeamLogoImg name={teams.hteam} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-4)" }}>vs</span>
          <TeamLogoImg name={teams.ateam} />
        </div>
      ) : null}
    </div>
  );
}

// ── Featured Cards Carousel ───────────────────────────────────────────────────

function FeaturedCardsCarousel({ cards }: {
  cards: Array<{ fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0] }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      const center = el!.scrollLeft + el!.clientWidth / 2;
      const children = Array.from(el!.children) as HTMLElement[];
      let closest = 0, minDist = Infinity;
      children.forEach((child, i) => {
        const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      setActiveIdx(closest);
    }
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el!.scrollBy({ left: e.deltaY * 1.5, behavior: "auto" });
    }
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    update();
    return () => { el.removeEventListener("scroll", update); el.removeEventListener("wheel", onWheel); };
  }, []);

  const CARD_W = 148;
  return (
    <div
      ref={scrollRef}
      className="no-scrollbar"
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        scrollSnapType: "x mandatory" as const,
        paddingLeft: `calc(50% - ${CARD_W / 2}px)`,
        paddingRight: `calc(50% - ${CARD_W / 2}px)`,
        paddingTop: 18,
        paddingBottom: 10,
      }}
    >
      {cards.map(({ fc, player }, idx) => {
        const isActive = idx === activeIdx;
        const meta = RARITY_META[fc.rarity] ?? RARITY_META.bronze;
        return (
          <div
            key={idx}
            style={{
              flexShrink: 0,
              width: CARD_W,
              scrollSnapAlign: "center" as const,
              transform: isActive ? "scale(1.07) translateY(-10px)" : "scale(0.91) translateY(0px)",
              opacity: isActive ? 1 : 0.6,
              transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
              filter: isActive ? `drop-shadow(0 10px 24px ${meta.glow})` : "none",
            }}
          >
            <PlayerCard
              card={{
                playerId: player.id,
                playerName: player.name,
                playerFolder: player.folder,
                playerTeam: player.team,
                playerTeamLogo: player.teamLogo,
                rarity: fc.rarity,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Featured Passes Carousel ─────────────────────────────────────────────────

function FeaturedPassesCarousel({ passes }: {
  passes: Array<{ slot: FeaturedPassSlot; pass: TeamPass | PlayerPass; passType: "player" | "team" }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      const center = el!.scrollLeft + el!.clientWidth / 2;
      const children = Array.from(el!.children) as HTMLElement[];
      let closest = 0, minDist = Infinity;
      children.forEach((child, i) => {
        const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      setActiveIdx(closest);
    }
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el!.scrollBy({ left: e.deltaY * 1.5, behavior: "auto" });
    }
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    update();
    return () => { el.removeEventListener("scroll", update); el.removeEventListener("wheel", onWheel); };
  }, []);

  const CARD_W = 148;
  return (
    <div
      ref={scrollRef}
      className="no-scrollbar"
      style={{
        display: "flex", gap: 12, overflowX: "auto",
        scrollSnapType: "x mandatory" as const,
        paddingLeft: `calc(50% - ${CARD_W / 2}px)`,
        paddingRight: `calc(50% - ${CARD_W / 2}px)`,
        paddingTop: 18, paddingBottom: 10,
      }}
    >
      {passes.map(({ slot, pass, passType }, idx) => {
        const isActive = idx === activeIdx;
        const level = getPassLevel(pass.xp ?? 0, passType === "player" ? PLAYER_PASS_LEVELS : TEAM_PASS_LEVELS);
        return (
          <div
            key={slot.id}
            style={{
              flexShrink: 0, width: CARD_W,
              scrollSnapAlign: "center" as const,
              transform: isActive ? "scale(1.07) translateY(-10px)" : "scale(0.91) translateY(0px)",
              opacity: isActive ? 1 : 0.6,
              transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
              filter: isActive ? `drop-shadow(0 10px 24px ${level.color}66)` : "none",
            }}
          >
            {passType === "player"
              ? <PlayerPassCard pass={pass as PlayerPass} />
              : <TeamPassCard   pass={pass as TeamPass} />
            }
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicProfilePage() {
  const params  = useParams();
  const router  = useRouter();
  const username = String(params.username || "").replace("@", "").toLowerCase();
  const compactProfileHeader = useMediaQuery("(max-width: 430px)");
  useProfileHeaderScroll(compactProfileHeader ? 224 : 268);

  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [friends,       setFriends]       = useState<FriendEntry[]>([]);
  const [showFriends,   setShowFriends]   = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [cardCount,     setCardCount]     = useState(0);
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [gamesMap,  setGamesMap]  = useState<Map<number, { hteam: string; ateam: string }>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [friendStatus,  setFriendStatus]  = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [playerStatsMap, setPlayerStatsMap] = useState<Map<string, { rating: string; gb: string; d: string; k: string; h: string; m: string; t: string; ho: string }>>(new Map());
  const [playerPasses,   setPlayerPasses]   = useState<PlayerPass[]>([]);
  const [teamPasses,     setTeamPasses]     = useState<TeamPass[]>([]);
  const [duelStats,      setDuelStats]      = useState<{ wins: number; losses: number; total: number; winRate: number; winStreak: number } | null>(null);
  const [duelHistoryOpen,    setDuelHistoryOpen]    = useState(false);
  const [duelHistory,        setDuelHistory]        = useState<any[]>([]);
  const [duelHistoryLoading, setDuelHistoryLoading] = useState(false);
  const [auraRank,       setAuraRank]       = useState<number | null>(null);
  const [pollsVoted,     setPollsVoted]     = useState<number | null>(null);
  const [pollsWon,       setPollsWon]       = useState<number | null>(null);
  const [gamesViewed,    setGamesViewed]    = useState<number | null>(null);
  const [gamesViewedOpen,    setGamesViewedOpen]    = useState(false);
  const [gamesData,          setGamesData]          = useState<{ name: string; logo: string; count: number }[]>([]);
  const [gamesDataLoading,   setGamesDataLoading]   = useState(false);
  const [passesOpen,         setPassesOpen]         = useState(false);
  const [pollsOpen,          setPollsOpen]          = useState(false);
  const [pollsData,          setPollsData]          = useState<PollEntry[]>([]);
  const [pollsDataLoading,   setPollsDataLoading]   = useState(false);
  const [likesOpen,          setLikesOpen]          = useState(false);
  const [likesData,          setLikesData]          = useState<{ id: string; username: string | null; avatar_url: string | null; total: number }[]>([]);
  const [likesDataLoading,   setLikesDataLoading]   = useState(false);
  const commentsSectionRef = useRef<HTMLElement>(null);
  const [commentCount,   setCommentCount]   = useState<number | null>(null);

  // Fetch player stats for all player_ event key comments so we can embed them in the URL
  useEffect(() => {
    const playerComments = comments.filter(c => c.event_key?.startsWith("player_") && c.game_id);
    if (!playerComments.length) return;

    const uniqueGameIds = Array.from(new Set(playerComments.map(c => c.game_id!)));

    Promise.all(
      uniqueGameIds.map(async (gameId) => {
        const apiId = (API_SPORTS_MATCH_IDS as Record<string, string>)[String(gameId)] ?? String(gameId);
        try {
          const res = await fetch(`/api/afl/player-stats?id=${apiId}`);
          if (!res.ok) return { gameId, players: [] };
          const data = await res.json();
          // Structure: response[0].teams[].players[]
          const players: any[] = [];
          for (const team of data?.response?.[0]?.teams ?? []) {
            for (const p of team?.players ?? []) players.push(p);
          }
          return { gameId, players };
        } catch {
          return { gameId, players: [] };
        }
      })
    ).then(results => {
      const next = new Map<string, { rating: string; gb: string; d: string; k: string; h: string; m: string; t: string; ho: string }>();
      for (const { gameId, players } of results) {
        for (const c of playerComments.filter(c => c.game_id === gameId)) {
          const slug = c.event_key!.slice(7); // after "player_"
          // Look up apiSportsId from players.json for reliable ID-based matching
          const playerRecord = (playersData as Array<{ name?: string; team?: string; apiSportsId?: number }>)
            .find(p => slugName(p.name ?? "") === slug);
          const apiSportsPlayerId = playerRecord?.apiSportsId ?? null;
          const found = players.find((p: any) =>
            apiSportsPlayerId
              ? Number(p.player?.id) === apiSportsPlayerId
              : slugName(p.player?.name ?? p.name ?? "") === slug
          );
          if (!found) continue;
          const raw = found.statistics ?? found;
          const goals = raw.goals?.total ?? (typeof raw.goals === "number" ? raw.goals : 0);
          const goalAssists = raw.goals?.assists ?? raw.goalAssists ?? 0;
          const behinds = raw.behinds ?? 0;
          const kicks = raw.kicks ?? 0;
          const handballs = raw.handballs ?? 0;
          const marks = raw.marks ?? 0;
          const tackles = raw.tackles ?? 0;
          const hitouts = raw.hitouts ?? 0;
          const disposals = raw.disposals ?? 0;
          const clearances = typeof raw.clearances === "object" ? (raw.clearances?.total ?? 0) : (raw.clearances ?? 0);
          const freesFor = raw.free_kicks?.for ?? raw.freesFor ?? 0;
          const freesAgainst = raw.free_kicks?.against ?? raw.freesAgainst ?? 0;
          const rating = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor, freesAgainst } as any);
          const played = goals + behinds + disposals + kicks + handballs + marks + tackles + hitouts + clearances > 0;
          next.set(`${gameId}_${slug}`, {
            rating: played ? String(rating) : "",
            gb: `${goals}.${behinds}`,
            d: String(disposals),
            k: String(kicks),
            h: String(handballs),
            m: String(marks),
            t: String(tackles),
            ho: String(hitouts),
          });
        }
      }
      setPlayerStatsMap(next);
    });
  }, [comments]);

  // Get current session user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // Load friendship status whenever currentUserId or profile changes
  useEffect(() => {
    if (!currentUserId || !profile || currentUserId === profile.id) return;
    supabase
      .from("friendships")
      .select("requester_id, status")
      .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${currentUserId})`)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!row) { setFriendStatus("none"); return; }
        if (row.status === "accepted") { setFriendStatus("accepted"); return; }
        setFriendStatus(row.requester_id === currentUserId ? "pending_sent" : "pending_received");
      });
  }, [currentUserId, profile]);

  useEffect(() => {
    fetch("/api/games")
      .then(r => r.json())
      .then((games: Array<{ id: number; hteam: string; ateam: string }>) => {
        const map = new Map<number, { hteam: string; ateam: string }>();
        for (const g of games) map.set(g.id, { hteam: g.hteam, ateam: g.ateam });
        setGamesMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, bio, created_at, favourites, featured_cards, featured_passes, aura, coins, favourite_team, verified, matches_viewed, total_likes, name_color")
        .eq("username", username)
        .maybeSingle();

      if (!p) { setProfile(null); setLoading(false); return; }

      setProfile(p as Profile);

      const { data: userComments } = await supabase
        .from("feed_comments")
        .select("id, body, created_at, game_id, event_key")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setComments((userComments ?? []) as Comment[]);

      const { count } = await supabase
        .from("user_cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.id);
      setCardCount(count ?? 0);

      // Fetch friends via server API (bypasses RLS so we always see the
      // profile owner's friends, not just the logged-in user's own friendships)
      try {
        const friendsRes = await fetch(`/api/profile/friends?user_id=${p.id}`);
        const friendsJson = await friendsRes.json();
        setFriends((friendsJson.friends ?? []) as FriendEntry[]);
      } catch {
        setFriends([]);
      }

      // Fetch passes
      const [{ data: ppData }, { data: tpData }] = await Promise.all([
        supabase.from("user_player_passes").select("*").eq("user_id", p.id).eq("active", true).order("created_at", { ascending: true }),
        supabase.from("user_team_passes").select("*").eq("user_id", p.id).eq("active", true).order("created_at", { ascending: true }),
      ]);
      setPlayerPasses(dedupePlayerPasses((ppData ?? []) as PlayerPass[]));
      setTeamPasses((tpData ?? []) as TeamPass[]);

      // Fetch duel stats
      fetch(`/api/duels/profile?user_id=${p.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setDuelStats(d); })
        .catch(() => {});
      // Aura rank
      if (p.aura != null) {
        supabase.from("profiles").select("id", { count: "exact", head: true }).gt("aura", p.aura)
          .then(({ count }) => setAuraRank((count ?? 0) + 1));
      }
      // Polls voted + polls won
      supabase.from("match_poll_votes").select("id", { count: "exact", head: true }).eq("user_id", p.id)
        .then(({ count }) => setPollsVoted(count ?? 0));
      supabase.from("aura_events").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("event_type", "poll_correct")
        .then(({ count }) => setPollsWon(count ?? 0));
      supabase.from("aura_events").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("event_type", "live_game_view")
        .then(({ count }) => setGamesViewed(count ?? 0));
      // Comment count
      supabase.from("feed_comments").select("id", { count: "exact", head: true }).eq("user_id", p.id)
        .then(({ count }) => setCommentCount(count ?? 0));

      setLoading(false);
    }

    if (username) load().catch(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <main style={pageStyle} className="page-enter">
        <button onClick={() => router.back()} style={floatingBackBtnStyle} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2.6} />
        </button>
        <div style={wrapStyle}>
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div className="skeleton" style={{ height: 155 }} />
            <div style={{ padding: "0 20px 20px", marginTop: -44 }}>
              <div className="skeleton" style={{ width: 88, height: 88, borderRadius: "50%", marginBottom: 14 }} />
              <div className="skeleton skeleton-line" style={{ width: 160, marginBottom: 10 }} />
              <div className="skeleton skeleton-line" style={{ width: 80 }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={pageStyle} className="page-enter">
        <button onClick={() => router.back()} style={floatingBackBtnStyle} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2.6} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "55vh", gap: 16, padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>👤</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>User not found</h2>
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: 14 }}>This profile doesn't exist or may have been removed.</p>
          <button onClick={() => router.back()} style={{ padding: "12px 22px", borderRadius: 14, border: "1px solid var(--border-2)", background: "var(--surface-1)", color: "var(--text-1)", fontWeight: 900, cursor: "pointer" }}>Go back</button>
        </div>
      </main>
    );
  }

  const label    = profile.username || profile.display_name || "User";
  const [avBg, avFg] = avatarColors(label);
  const daysAgo  = profile.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
    : null;

  const favourites = normaliseFavSlots(
    Array.isArray(profile.favourites) ? profile.favourites : []
  );
  const filledFavs = favourites.filter(Boolean).length;
  const isOwnProfile = currentUserId === profile.id;
  const bannerSrc = profile.banner_url ?? "";
  const avatarSrc = profile.avatar_url ?? "";
  const C = compactProfileHeader;
  const expandedBannerHeight = C ? 246 : 286;
  const collapsedBannerHeight = C ? 72 : 82;
  const bannerMediaTop = C ? -30 : -32;
  const bannerMediaHeight = expandedBannerHeight + (C ? 70 : 78);
  const avatarBaseSize = C ? 106 : 118;
  const avatarScaleTo = C ? 0.46 : 0.5;
  const avatarStartLeft = C ? 18 : 22;
  const avatarStartTop = expandedBannerHeight - avatarBaseSize * 0.5;
  const avatarTxDelta = (C ? 60 : 68) - avatarStartLeft;
  const avatarTyDelta = (C ? 14 : 17) - avatarStartTop;
  const bannerLiftTo = C ? -34 : -42;
  const compactUsernameHeight = C ? 28 : 30;
  const headerRadius = C ? "0 0 22px 22px" : "0 0 24px 24px";
  const topPadFrom = avatarBaseSize * 0.55 + 18;

  // Eased (--phe) and raw (--php) scroll progress, set on <html> by
  // useProfileHeaderScroll. calc() does the interpolation per-frame, GPU-side.
  const HE = "var(--phe)";
  const HP = "var(--php)";
  const PX = (a: number, b: number) => `calc(${a}px + ${(b - a).toFixed(2)}px * ${HE})`;
  const NUM = (a: number, b: number) => `calc(${a} + ${(b - a).toFixed(4)} * ${HE})`;
  const avatarSizeExpr = `(${avatarBaseSize}px * (1 + ${(avatarScaleTo - 1).toFixed(4)} * ${HE}))`;
  const compactLeftInner = `${avatarStartLeft}px + ${avatarTxDelta.toFixed(2)}px * ${HE} + ${avatarSizeExpr} + 12px`;

  const profileHeroShellStyle: CSSProperties = {
    display: "contents",
  };
  // Split into two sticky siblings instead of one element whose `height`
  // animates every scroll frame (that forced a full-page reflow 60x/sec —
  // height is a layout property, not a compositor one). Both are
  // `position: sticky; top: 0` starting at the same natural document
  // position, so they stick in perfect sync with each other.
  //
  // 1. bannerStickyStyle — the banner image. Height is now CONSTANT (always
  //    the expanded size), so it never triggers layout at all. It visually
  //    "collapses" only because `profileBodyStyle` below slides up over its
  //    excess height via transform (compositor-only).
  // 2. controlsStickyStyle — a zero-height positioning anchor for the back/
  //    menu buttons, avatar, and compact username pill, which were already
  //    `position: absolute` + `transform`-animated and never the problem.
  const bannerStickyStyle: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 1,
    height: `calc(${expandedBannerHeight}px + env(safe-area-inset-top))`,
    borderRadius: headerRadius,
    overflow: "hidden",
    background: "#020617",
    boxShadow: "0 14px 30px rgb(0 0 0 / 0.32)",
  };
  const controlsStickyStyle: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 90,
    height: 0,
    overflow: "visible",
  };
  const bannerFrameStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    borderRadius: headerRadius,
    background: "#06101e",
  };
  const bannerMediaStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: bannerMediaTop,
    bottom: "auto",
    width: "100%",
    height: `calc(${bannerMediaHeight}px + env(safe-area-inset-top))`,
    objectFit: "cover",
    objectPosition: "center top",
    transform: `translate3d(0, ${PX(0, bannerLiftTo)}, 0) scale(${NUM(1.015, 1.045)})`,
    transformOrigin: "center top",
    // Static filter — animating saturate/contrast per scroll frame forces a
    // repaint of the whole banner image every frame for an effect nobody
    // can actually see mid-scroll. transform (above) stays GPU-only.
    filter: "saturate(1.01) contrast(1.005)",
    willChange: "transform",
  };
  const headerOverlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(180deg, rgb(2 6 23 / calc(0.16 + 0.24 * ${HE})) 0%, rgb(2 6 23 / calc(0.18 + 0.30 * ${HE})) 52%, rgb(2 6 23 / calc(0.48 + 0.42 * ${HE})) 100%), linear-gradient(90deg, rgba(2,6,23,0.28) 0%, rgba(2,6,23,0) 36%, rgba(2,6,23,0.22) 100%)`,
    pointerEvents: "none",
  };
  // Covers exactly the banner's "excess" height (expanded minus collapsed)
  // as you scroll, so the now-constant-height banner LOOKS like it shrunk —
  // grows from 0 to full as HE goes 0→1, giving the same crisp "edge moves
  // up" look the old literal height-shrink had, instead of a soft fade.
  // This lives inside the banner box itself — sized off fixed numbers, not
  // off profileBodyStyle's actual content height — so it covers correctly
  // regardless of how much/little content a given profile has below it.
  // profileBodyStyle's own transform (see below) only has to slide its
  // content up to meet this mask's bottom edge, not cover the gap itself.
  // Animating height here is cheap (unlike the old sticky-header height
  // animation): this element is absolutely positioned with no children and
  // no siblings that depend on its size, so the cost is isolated to just
  // this one box — it can't cascade into a page-wide reflow.
  const bannerExcessMaskStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: `calc(${(expandedBannerHeight - collapsedBannerHeight).toFixed(1)}px * ${HE})`,
    background: "var(--bg)",
    pointerEvents: "none",
  };
  const topControlBaseStyle: CSSProperties = {
    position: "absolute",
    top: "calc(env(safe-area-inset-top) + 10px)",
    zIndex: 8,
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.14)",
    background: `rgb(2 6 23 / calc(0.52 + 0.22 * ${HE}))`,
    color: "var(--text-1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    // backdrop-filter is one of the most expensive operations on iOS WebKit,
    // and these buttons sit over a banner that's moving every scroll frame —
    // a smaller radius cuts that cost noticeably while still looking frosted.
    // translateZ(0) promotes the button to its own compositor layer so the
    // blur recompute stays scoped to this small circle, not a larger region.
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transform: "translateZ(0)",
  };
  const avatarButtonStyle: CSSProperties = {
    position: "absolute",
    zIndex: 9,
    left: avatarStartLeft,
    top: `calc(env(safe-area-inset-top) + ${avatarStartTop}px)`,
    width: avatarBaseSize,
    height: avatarBaseSize,
    borderRadius: "50%",
    transform: `translate3d(${PX(0, avatarTxDelta)}, ${PX(0, avatarTyDelta)}, 0) scale(${NUM(1, avatarScaleTo)})`,
    transformOrigin: "top left",
    willChange: "transform",
  };
  const avatarImageStyle: CSSProperties = {
    width: avatarBaseSize,
    height: avatarBaseSize,
    borderRadius: "50%",
    objectFit: "cover",
    border: "4px solid var(--bg)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.14), 0 16px 44px rgba(0,0,0,0.48)",
    display: "block",
  };
  const compactUsernamePillStyle: CSSProperties = {
    position: "absolute",
    zIndex: 8,
    left: `calc(${compactLeftInner})`,
    top: `calc(env(safe-area-inset-top) + ${avatarStartTop}px + ${avatarTyDelta.toFixed(2)}px * ${HE} + (${avatarSizeExpr} - ${compactUsernameHeight}px) / 2)`,
    maxWidth: `calc(100% - (${compactLeftInner}) - 74px)`,
    height: compactUsernameHeight,
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: "var(--text-1)",
    fontSize: C ? 18 : 20,
    fontWeight: 950,
    opacity: `clamp(0, calc((${HP} - 0.3) / 0.7), 1)`,
    transform: "translate3d(0, 0, 0)",
    pointerEvents: "none",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    textShadow: "0 2px 12px rgba(0,0,0,0.72)",
  };
  const profileBodyStyle: CSSProperties = {
    position: "relative",
    zIndex: 2,
    // Constant padding (no longer interpolated — that was a layout property
    // changing every scroll frame). This trades a little extra breathing
    // room above the username once fully collapsed for zero per-frame
    // layout cost, which is the actual fix for the scroll jank.
    padding: `${topPadFrom}px 14px 16px`,
    background: "var(--bg)",
    border: "1px solid var(--border-2)",
    borderTop: "none",
    borderRadius: headerRadius,
    // Slides this whole box up to track the banner's now-constant-height
    // box exactly at the point it used to visually collapse to — replaces
    // what the old height animation used to do automatically via layout.
    // transform is compositor-only, so this costs nothing extra per frame.
    transform: `translate3d(0, calc(${(collapsedBannerHeight - expandedBannerHeight).toFixed(1)}px * ${HE}), 0)`,
    willChange: "transform",
  };
  const mainIdentityStyle: CSSProperties = {
    opacity: `clamp(0, calc(1 - ${HP} * 1.7), 1)`,
    transform: `translate3d(0, calc(-12px * ${HE}), 0)`,
    willChange: "opacity, transform",
  };
  const profileHeaderStatsStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    alignItems: "start",
    gap: 8,
    padding: "12px 0 4px",
  };
  const profileHeaderStatStyle: CSSProperties = {
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 0,
    color: "inherit",
  };
  const profileHeaderValueStyle: CSSProperties = {
    fontSize: compactProfileHeader ? 19 : 21,
    fontWeight: 950,
    color: "var(--text-1)",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  const profileHeaderLabelStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 900,
    color: "#7f91ad",
    textTransform: "uppercase",
    letterSpacing: compactProfileHeader ? "0.04em" : "0.05em",
  };
  const profileHeaderIconRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  };
  const profileHeaderIconSize = compactProfileHeader ? 15 : 18;

  async function openDuelHistory() {
    setDuelHistoryOpen(true);
    window.scrollTo(0, 0); // open at the top, not wherever the profile was scrolled
    if (duelHistory.length > 0) return;
    setDuelHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/duels/history?user_id=${profile.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDuelHistory(data.duels ?? []);
      }
    } catch {}
    setDuelHistoryLoading(false);
  }

  function getTeamLogo(name: string) {
    // Squiggle full team names → logo slug (exact, to avoid fuzzy mismatches
    // like "Port Adelaide" matching "Adelaide" or "North Melbourne" → "Melbourne")
    const SQUIGGLE_SLUG: Record<string, string> = {
      "Adelaide": "crows",
      "Brisbane Lions": "lions",
      "Carlton": "blues",
      "Collingwood": "magpies",
      "Essendon": "bombers",
      "Fremantle": "dockers",
      "Geelong": "cats",
      "Gold Coast": "suns",
      "Greater Western Sydney": "giants",
      "GWS": "giants",
      "GWS Giants": "giants",
      "Hawthorn": "hawks",
      "Melbourne": "demons",
      "North Melbourne": "kangaroos",
      "Port Adelaide": "power",
      "Richmond": "tigers",
      "St Kilda": "saints",
      "Sydney": "swans",
      "West Coast": "eagles",
      "Western Bulldogs": "bulldogs",
    };
    return `/team-logos/${SQUIGGLE_SLUG[name] ?? "unknown"}.png`;
  }

  async function openGamesViewed() {
    setGamesViewedOpen(true);
    window.scrollTo(0, 0);
    if (gamesData.length > 0) return;
    setGamesDataLoading(true);
    try {
      const { data: events } = await supabase
        .from("aura_events")
        .select("related_id")
        .eq("user_id", profile.id)
        .eq("event_type", "live_game_view");
      const counts: Record<string, { name: string; logo: string; count: number }> = {};
      for (const e of events ?? []) {
        const game = gamesMap.get(Number((e as any).related_id));
        if (!game) continue;
        for (const teamName of [game.hteam, game.ateam].filter(Boolean)) {
          if (!counts[teamName]) counts[teamName] = { name: teamName, logo: getTeamLogo(teamName), count: 0 };
          counts[teamName].count++;
        }
      }
      setGamesData(Object.values(counts).sort((a, b) => b.count - a.count));
    } catch {}
    setGamesDataLoading(false);
  }

  async function openPollsPopup() {
    setPollsOpen(true);
    window.scrollTo(0, 0);
    if (pollsData.length > 0) return;
    setPollsDataLoading(true);
    try {
      setPollsData(await loadPollEntries(profile.id));
    } catch {}
    setPollsDataLoading(false);
  }

  async function openLikesPopup() {
    setLikesOpen(true);
    window.scrollTo(0, 0);
    if (likesData.length > 0) return;
    setLikesDataLoading(true);
    try {
      const { data } = await supabase.rpc("get_likes_leaderboard", { p_limit: 100, p_offset: 0 });
      setLikesData((data ?? []).map((r: any) => ({
        id: String(r.user_id),
        username: r.username ?? null,
        avatar_url: r.avatar_url ?? null,
        total: Number(r.total_likes),
      })));
    } catch {}
    setLikesDataLoading(false);
  }

  async function handleFriendAction() {
    if (!currentUserId || !profile) return;
    setFriendLoading(true);
    if (friendStatus === "none") {
      await supabase.from("friendships").insert({ requester_id: currentUserId, addressee_id: profile.id, status: "pending" });
      setFriendStatus("pending_sent");
    } else if (friendStatus === "pending_sent") {
      await supabase.from("friendships").delete()
        .eq("requester_id", currentUserId).eq("addressee_id", profile.id);
      setFriendStatus("none");
    } else if (friendStatus === "pending_received") {
      await supabase.from("friendships").update({ status: "accepted" })
        .eq("requester_id", profile.id).eq("addressee_id", currentUserId);
      setFriendStatus("accepted");
    } else if (friendStatus === "accepted") {
      await supabase.from("friendships").delete()
        .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${currentUserId})`);
      setFriendStatus("none");
    }
    setFriendLoading(false);
  }

  function handleShareProfile() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = `@${profile.username ?? label} on Foopy`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  return (
    <main style={pageStyle} className="page-enter">
      <div style={{ ...wrapStyle, paddingTop: 0 }}>
        <div style={profileHeroShellStyle}>
          {/* controlsStickyStyle has height:0, so it must come FIRST in DOM
              order — otherwise its "natural" (pre-stick) flow position would
              start after the banner's real height instead of at the top,
              throwing off every absolute-positioned child inside it. */}
          <div style={controlsStickyStyle}>
            <button type="button" onClick={() => router.back()} aria-label="Back" style={{ ...topControlBaseStyle, left: 12 }}>
              <ChevronLeft size={22} strokeWidth={2.6} />
            </button>
            <button type="button" onClick={() => isOwnProfile ? handleShareProfile() : setOptionsOpen(true)} aria-label="Profile options" style={{ ...topControlBaseStyle, right: 12 }}>
              <MoreHorizontal size={22} strokeWidth={2.6} />
            </button>

            <div style={avatarButtonStyle}>
              {avatarSrc ? (
                <img src={avatarSrc} alt={label} style={avatarImageStyle} />
              ) : (
                <div style={{ ...avatarImageStyle, background: `linear-gradient(135deg,${avBg},var(--surface-1))`, color: avFg, display: "grid", placeItems: "center", fontSize: compactProfileHeader ? 34 : 38, fontWeight: 950 }}>
                  {label[0].toUpperCase()}
                </div>
              )}
            </div>

            <div style={compactUsernamePillStyle}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...nameColorStyle(profile.name_color) }}>@{profile.username}</span>
              {profile.verified && <VerifiedBadge size={14} />}
            </div>
          </div>

          <div style={bannerStickyStyle}>
            <div style={bannerFrameStyle}>
              {bannerSrc ? (
                <img src={bannerSrc} alt="" style={bannerMediaStyle} />
              ) : (
                <div style={{ ...bannerMediaStyle, background: "radial-gradient(ellipse at 15% 60%,rgba(59,130,246,.6),transparent 40%),radial-gradient(ellipse at 85% 20%,rgba(99,102,241,.5),transparent 40%),radial-gradient(ellipse at 50% 100%,rgba(34,197,94,.2),transparent 50%),linear-gradient(160deg,#06101e,#000)" }} />
              )}
              <div style={headerOverlayStyle} />
              <div style={bannerExcessMaskStyle} />
            </div>
          </div>

          <section style={profileBodyStyle}>
            <div style={mainIdentityStyle}>
              <h1 style={{ margin: 0, fontSize: compactProfileHeader ? 28 : 34, fontWeight: 950, letterSpacing: 0, lineHeight: 1.05, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...nameColorStyle(profile.name_color) }}>@{profile.username}</span>
                {profile.verified && <VerifiedBadge size={18} />}
              </h1>

              {profile.favourite_team && (() => {
                const team = TEAMS.find(t => t.name === profile.favourite_team);
                return team ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: `${team.color}18` }}>
                      <img src={team.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", letterSpacing: 0 }}>{profile.favourite_team}</span>
                  </div>
                ) : null;
              })()}
            </div>

            <div style={profileHeaderStatsStyle}>
              <a href={`/aura-leaderboard?user=${profile.username}`} style={profileHeaderStatStyle}>
                <span style={{ ...profileHeaderValueStyle, background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>✦ {formatAura(profile.aura ?? 0)}</span>
                <span style={profileHeaderLabelStyle}>Aura</span>
              </a>
              <Link href={`/album/${profile.username}`} style={profileHeaderStatStyle}>
                <div style={profileHeaderIconRowStyle}>
                  <Layers size={profileHeaderIconSize} color="var(--text-1)" strokeWidth={2.5} />
                  <span style={profileHeaderValueStyle}>{cardCount.toLocaleString()}</span>
                </div>
                <span style={profileHeaderLabelStyle}>Cards</span>
              </Link>
              <button onClick={() => setShowFriends(true)} style={{ ...profileHeaderStatStyle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                <div style={profileHeaderIconRowStyle}>
                  <Users size={profileHeaderIconSize} color="var(--text-1)" strokeWidth={2.5} />
                  <span style={profileHeaderValueStyle}>{friends.length}</span>
                </div>
                <span style={profileHeaderLabelStyle}>Friends</span>
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8, color: "#60a5fa", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>About</div>
              <div style={{ padding: "14px 15px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
                <p style={{ margin: 0, color: profile.bio ? "#cbd5e1" : "#475569", fontSize: 14, fontWeight: 650, lineHeight: 1.55, fontStyle: profile.bio ? "normal" : "italic" }}>
                  {profile.bio || "No bio yet."}
                </p>
              </div>
            </div>

            {!isOwnProfile && currentUserId && (
              <div style={{ display: "flex", gap: 10, paddingTop: 14 }}>
                <button
                  onClick={handleFriendAction}
                  disabled={friendLoading}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: 14, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 950, fontSize: 14,
                    background: friendStatus === "accepted" ? "rgba(239,68,68,.18)"
                      : friendStatus === "pending_sent" ? "var(--border-2)"
                      : friendStatus === "pending_received" ? "rgba(37,99,235,.28)"
                      : "#2563eb",
                    color: friendStatus === "accepted" ? "#f87171"
                      : friendStatus === "pending_sent" ? "#94a3b8"
                      : "#fff",
                    opacity: friendLoading ? 0.6 : 1,
                  }}
                >
                  {friendStatus === "accepted" ? "Remove Friend"
                    : friendStatus === "pending_sent" ? "Request Sent"
                    : friendStatus === "pending_received" ? "Accept Request"
                    : "Add Friend"}
                </button>
                <button
                  onClick={() => router.push(`/dms?open=${profile.id}`)}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: 14,
                    border: "1px solid var(--border-3)", cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 950, fontSize: 14,
                    background: "var(--surface-3)", color: "var(--text-1)",
                  }}
                >
                  Message
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ── Favourites ── */}
        <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px 22px" }}>
          <div style={{ marginBottom: 16, fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            favorites
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {favourites.map((slot, i) => {
              if (!slot) return (
                <div key={i} style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", border: "2px dashed var(--border-2)", background: "rgba(255,255,255,.025)" }} />
              );
              if (slot.type === "player") {
                const playerSlug = slot.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                return (
                  <Link key={i} href={`/player/${playerSlug}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <FavSlotView slot={slot} />
                  </Link>
                );
              }
              return <FavSlotView key={i} slot={slot} />;
            })}
          </div>
        </section>

        {/* ── Featured Cards ── */}
        {(() => {
          const featuredSlots = (profile.featured_cards ?? []).slice(0, 15);
          const featuredWithData = featuredSlots
            .map(fc => ({ fc, player: CARD_PLAYERS.find(p => p.id === fc.player_id) }))
            .filter((x): x is { fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0] } => !!x.player);
          if (featuredWithData.length === 0) return null;

          return (
            <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "16px 0 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>featured cards</div>
                <Link href={`/album/${profile.username}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textDecoration: "none" }}>
                  {featuredWithData.length}/15 · View Album
                </Link>
              </div>
              <FeaturedCardsCarousel cards={featuredWithData} />
            </section>
          );
        })()}

        {/* ── Passes ── */}
        {(() => {
          const featuredPassSlots = profile.featured_passes ?? [];
          if (featuredPassSlots.length === 0) return null;

          const featuredPasses = featuredPassSlots
            .map(slot => {
              if (slot.type === "team") {
                const pass = teamPasses.find(p => p.id === slot.id);
                return pass ? { slot, pass: pass as TeamPass | PlayerPass, passType: "team" as const } : null;
              } else {
                const pass = playerPasses.find(p => p.id === slot.id);
                return pass ? { slot, pass: pass as TeamPass | PlayerPass, passType: "player" as const } : null;
              }
            })
            .filter((x): x is { slot: FeaturedPassSlot; pass: TeamPass | PlayerPass; passType: "player" | "team" } => x !== null);

          if (featuredPasses.length === 0) return null;

          return (
            <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "16px 0 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>featured passes</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{featuredPasses.length}/10</div>
              </div>
              <FeaturedPassesCarousel passes={featuredPasses} />
            </section>
          );
        })()}

        {/* ── Album ── */}
        {(() => {
          // Pick up to 3 featured card rarities for the card fan, fall back to generic
          const previewRarities = (profile.featured_cards ?? [])
            .slice(0, 3)
            .map(fc => fc.rarity as string);
          while (previewRarities.length < 3) previewRarities.push(["gold", "silver", "bronze"][previewRarities.length]);

          const RARITY_COLORS: Record<string, string> = {
            bronze: "#cd7f32", silver: "#c0c0c0", gold: "#ffd700",
            emerald: "#10b981", sapphire: "#3b82f6", ruby: "#ef4444",
            amethyst: "#a78bfa", diamond: "#67e8f9", pinkdiamond: "#f472b6", mythic: "#c084fc",
          };

          const cardAngles = [-14, 0, 14];

          return (
            <Link href={`/album/${profile.username}`} style={{
              display: "flex", alignItems: "center", gap: 20,
              background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18,
              padding: "20px 22px", textDecoration: "none", color: "var(--text-1)",
              position: "relative", overflow: "hidden",
            }}>
              {/* Subtle background glow */}
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 50%, rgba(99,102,241,.07) 0%, transparent 60%)", pointerEvents: "none" }} />

              {/* Fanned card stack */}
              <div style={{ position: "relative", width: 72, height: 90, flexShrink: 0 }}>
                {previewRarities.map((rarity, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    width: 52, height: 72,
                    borderRadius: 7,
                    overflow: "hidden",
                    border: `1.5px solid ${RARITY_COLORS[rarity] ?? "#ffd700"}55`,
                    boxShadow: `0 4px 14px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3)`,
                    transform: `rotate(${cardAngles[i]}deg)`,
                    transformOrigin: "bottom center",
                    bottom: 0,
                    left: "50%",
                    marginLeft: -26,
                    zIndex: i,
                  }}>
                    <img
                      src={`/cards/${rarity}.png`}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                ))}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em", color: "var(--text-1)", lineHeight: 1 }}>Album</div>
                <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 700, marginTop: 5 }}>
                  {cardCount > 0 ? `${cardCount.toLocaleString()} card${cardCount !== 1 ? "s" : ""}` : "View collection"}
                </div>
              </div>

              {/* Arrow */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          );
        })()}

        {/* ── Stats grid ── */}
        {(() => {
          const passCount = playerPasses.length + teamPasses.length;
          const stats: { label: string; value: string | number; color: string; icon: React.ReactNode; onClick?: () => void }[] = [
            { label: "Aura Rank",   value: auraRank    != null ? `#${auraRank.toLocaleString()}` : "—", color: "#c084fc", icon: <Star        size={15} />, onClick: () => router.push("/aura-leaderboard") },
            { label: "Cards",       value: cardCount,                                                    color: "#fbbf24", icon: <Layers      size={15} />, onClick: () => router.push(`/album/${profile.username}`) },
            { label: "Passes",      value: passCount,                                                    color: "#60a5fa", icon: <Ticket      size={15} />, onClick: () => setPassesOpen(true) },
            { label: "Comments",    value: commentCount ?? "—",                                          color: "#38bdf8", icon: <MessageCircle size={15} />, onClick: () => commentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
            { label: "Likes",       value: profile.total_likes ?? "—",                                   color: "#f43f5e", icon: <Heart       size={15} />, onClick: openLikesPopup },
            { label: "Games",       value: gamesViewed ?? "—",                                           color: "#4ade80", icon: <Tv          size={15} />, onClick: openGamesViewed },
            { label: "Duels",       value: duelStats?.total ?? 0,                                        color: "#f97316", icon: <Zap         size={15} />, onClick: openDuelHistory },
            { label: "Polls Voted", value: pollsVoted  ?? "—",                                           color: "#a78bfa", icon: <BarChart2   size={15} />, onClick: openPollsPopup },
            { label: "Polls Won",   value: pollsWon    ?? "—",                                           color: "#22c55e", icon: <Trophy      size={15} />, onClick: openPollsPopup },
          ];
          return (
            <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {stats.map((s, i) => {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const totalRows = Math.ceil(stats.length / 3);
                const El = s.onClick ? "button" : "div";
                return (
                  <El key={s.label} onClick={s.onClick} style={{ padding: "14px 8px", background: "none", border: "none", borderRight: col < 2 ? "1px solid var(--border-2)" : "none", borderBottom: row < totalRows - 1 ? "1px solid var(--border-2)" : "none", cursor: s.onClick ? "pointer" : "default", color: "var(--text-1)", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: s.color, opacity: 0.8, lineHeight: 0, flexShrink: 0 }}>{s.icon}</span>
                      <span style={{ fontSize: 17, fontWeight: 950, letterSpacing: "-0.03em", color: s.color, lineHeight: 1 }}>{s.value}</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{s.label}</span>
                  </El>
                );
              })}
            </div>
          );
        })()}

        {/* ── Duel stats ── */}
        {duelStats && duelStats.total > 0 && (
          <div
            onClick={() => router.push("/duels/leaderboard")}
            style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 20px", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>⚔ DUELS</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6" }}>Leaderboard ›</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>{duelStats.wins}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Wins</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>{duelStats.losses}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Losses</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#3b82f6", lineHeight: 1 }}>{duelStats.winRate}%</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Win Rate</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{duelStats.winStreak}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Streak</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              member since
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
              {profile.created_at
                ? new Date(profile.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                : "—"}
            </div>
            {daysAgo !== null && (
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
                {daysAgo} days ago
              </div>
            )}
          </div>

          <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Polls win rate
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
              —
            </div>
          </div>
        </div>

        {/* ── Comment history ── */}
        {comments.length > 0 && (
          <section ref={commentsSectionRef} style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px 20px", scrollMarginTop: 70 }}>
            <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              comments
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comments.map(c => {
                const ek = c.event_key;
                let player: { name: string; team: string } | undefined;
                if (ek?.startsWith("player_")) {
                  player = playerBySlug.get(ek.slice(7));
                } else if (ek) {
                  // e.g. q1_m5_tgoal_p804 — the _p suffix is the Squiggle eventId
                  const m = ek.match(/_p([^_]+)$/);
                  if (m) player = playerByEventId.get(Number(m[1]));
                }
                const imgSrc = player ? playerImagePath(player.name, player.team) : null;
                const teams = c.game_id ? (gamesMap.get(c.game_id) ?? null) : null;
                let href: string | null = null;
                if (c.game_id && ek) {
                  if (ek.startsWith("player_") && player) {
                    const slug = ek.slice(7);
                    const stats = playerStatsMap.get(`${c.game_id}_${slug}`);
                    const p = new URLSearchParams({ label: player.name, team: player.team });
                    if (stats?.rating) p.set("rating", stats.rating);
                    if (stats?.gb)     p.set("gb", stats.gb);
                    if (stats?.d)      p.set("d", stats.d);
                    if (stats?.k)      p.set("k", stats.k);
                    if (stats?.h)      p.set("h", stats.h);
                    if (stats?.m)      p.set("m", stats.m);
                    if (stats?.t)      p.set("t", stats.t);
                    if (stats?.ho)     p.set("ho", stats.ho);
                    href = `/match/${c.game_id}/${ek}?${p.toString()}`;
                  } else {
                    const p = new URLSearchParams({ highlight: c.id });
                    if (player) {
                      const typeMatch = ek.match(/_t([^_]+)_p/);
                      const eventType = typeMatch ? typeMatch[1].toUpperCase() : "";
                      p.set("label", eventType ? `${player.name} · ${eventType}` : player.name);
                      p.set("team", player.team);
                    }
                    href = `/match/${c.game_id}/${ek}?${p.toString()}`;
                  }
                } else if (c.game_id) {
                  href = `/match/${c.game_id}?tab=chat&highlight=${c.id}`;
                }
                return <CommentRow key={c.id} comment={c} imgSrc={imgSrc} teams={teams} href={href} />;
              })}
            </div>
          </section>
        )}

      </div>

      {/* ── Friends overlay ── */}
      {showFriends && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setShowFriends(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Friends</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {friends.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 14, fontWeight: 800, padding: "30px 0", textAlign: "center" }}>No friends yet.</div>
            ) : (
              friends.map(f => (
                <button key={f.id} onClick={() => router.push(`/profile/${f.username}`)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 16, border: "1px solid var(--border-2)", background: "var(--surface-1)", color: "var(--text-1)", cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" }}>
                  {f.avatar_url
                    ? <img src={f.avatar_url} alt={f.username || ""} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />
                    : <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface-1)", color: "var(--text-2)", display: "grid", placeItems: "center", fontWeight: 950, flexShrink: 0 }}>{(f.username || "?")[0].toUpperCase()}</div>
                  }
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 15, fontWeight: 900 }}>@{f.username}{f.verified && <VerifiedBadge size={14} />}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {/* ── Duel History overlay ── */}
      {duelHistoryOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setDuelHistoryOpen(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Duel History</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {duelHistoryLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
            ) : duelHistory.filter((d: any) => d.status === "complete").length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No completed duels yet.</div>
            ) : (
              duelHistory.filter((d: any) => d.status === "complete").map((d: any) => {
                const isChallenger = d.challenger_id === profile.id;
                const myScore  = isChallenger ? d.challenger_score : d.opponent_score;
                const oppScore = isChallenger ? d.opponent_score   : d.challenger_score;
                const opponent = isChallenger ? d.opponent : d.challenger;
                const result   = d.is_draw ? "D" : d.winner_id === profile.id ? "W" : "L";
                const resultColor = result === "W" ? "#22c55e" : result === "L" ? "#ef4444" : "#94a3b8";
                const game = d.duel_game;
                return (
                  <div key={d.id} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                    {game && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>
                        Rd {game.round} · {game.home_team} vs {game.away_team}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {opponent?.avatar_url
                        ? <img src={opponent.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "var(--text-3)" }}>{(opponent?.username ?? "?")[0].toUpperCase()}</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>
                          vs @{opponent?.username ?? "Unknown"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 1 }}>
                          {d.completed_at ? new Date(d.completed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 17, fontWeight: 950, letterSpacing: "-0.03em", color: "var(--text-1)" }}>
                          {myScore ?? "—"}<span style={{ color: "var(--text-4)", fontWeight: 400, margin: "0 3px" }}>–</span>{oppScore ?? "—"}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: resultColor, background: `${resultColor}18`, border: `1px solid ${resultColor}44`, borderRadius: 8, padding: "3px 8px", minWidth: 26, textAlign: "center" as const }}>
                          {result}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {gamesViewedOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setGamesViewedOpen(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Live Games Viewed</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 16 }}>
            {gamesDataLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
            ) : gamesData.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No live games viewed yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {gamesData.map((t) => (
                  <div key={t.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 8px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                    <img src={t.logo} alt={t.name} style={{ width: 44, height: 44, objectFit: "contain", borderRadius: "50%", background: "var(--surface-1)", padding: 5 }} />
                    <div style={{ fontSize: 22, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.04em" }}>{t.count}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textAlign: "center", lineHeight: 1.3 }}>{t.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {passesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setPassesOpen(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Passes</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 16 }}>
            {playerPasses.length + teamPasses.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No passes yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                {teamPasses.map((pass) => (
                  <div key={pass.id} style={{ width: "min(100%, 320px)" }}><TeamPassCard pass={pass} /></div>
                ))}
                {playerPasses.map((pass) => (
                  <div key={pass.id} style={{ width: "min(100%, 320px)" }}><PlayerPassCard pass={pass} /></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pollsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setPollsOpen(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Poll Picks</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 16 }}>
            {pollsDataLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
            ) : pollsData.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No poll picks yet.</div>
            ) : (
              <PollPickList entries={pollsData} />
            )}
          </div>
        </div>
      )}

      {likesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", color: "var(--text-1)", overflowY: "auto" }}>
          <div style={{ height: "calc(58px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 18, padding: "env(safe-area-inset-top) 20px 0", background: "var(--bg)", borderBottom: "1px solid var(--border-2)", position: "sticky", top: 0 }}>
            <button onClick={() => setLikesOpen(false)} style={overlayBackBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Likes Leaderboard</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {likesDataLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
            ) : likesData.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>No comment likes yet.</div>
            ) : (
              likesData.map((entry, i) => {
                const isThem = entry.id === profile.id;
                return (
                  <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: isThem ? "rgba(59,130,246,.08)" : "var(--surface-2)", border: `1px solid ${isThem ? "rgba(59,130,246,.2)" : "var(--border-1)"}` }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? ["#ffd700", "#c0c0c0", "#cd7f32"][i] : "var(--text-4)", width: 22, textAlign: "center" }}>{i + 1}</div>
                    {entry.avatar_url
                      ? <img src={entry.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "var(--text-3)" }}>{(entry.username ?? "?")[0].toUpperCase()}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, color: isThem ? "#60a5fa" : "var(--text-1)" }}>@{entry.username ?? "unknown"}</div>
                    <div style={{ fontSize: 18, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.03em" }}>{entry.total.toLocaleString()}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {profile && !isOwnProfile && (
        <ReportBlockSheet
          open={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          target={{ userId: profile.id, username: profile.username, displayName: profile.display_name }}
          extraActions={[{ label: "Share profile", icon: <ShareIcon />, onClick: handleShareProfile }]}
          onChanged={() => { setFriendStatus("none"); }}
        />
      )}
    </main>
  );
}

function ShareIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const overlayBackBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#60a5fa",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
};

const floatingBackBtnStyle: React.CSSProperties = {
  position: "fixed",
  top: "calc(env(safe-area-inset-top) + 12px)",
  left: 12,
  zIndex: 100,
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "0 12px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderRadius: 18,
  overflow: "hidden",
};
