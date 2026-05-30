"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Layers } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import AuraBadge from "@/app/components/AuraBadge";
import { PlayerCard } from "@/app/components/PlayerCard";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { getPassLevel, PLAYER_PASS_LEVELS, TEAM_PASS_LEVELS, dedupePlayerPasses, type PlayerPass, type TeamPass } from "@/app/lib/passes";
import { PlayerPassCard, TeamPassCard } from "@/app/components/PassCard";
import playersData from "@/app/data/players.json";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/match/[id]/utils";

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
  bio: string | null;
  created_at: string | null;
  favourites: FavSlot[] | null;
  featured_cards: FeaturedCardSlot[] | null;
  featured_passes: FeaturedPassSlot[] | null;
  aura: number | null;
  coins: number | null;
  favourite_team: string | null;
};

type FriendEntry = { id: string; username: string | null; avatar_url: string | null };

// ── Teams ────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: "Adelaide",          logo: "/team-logos/crows.png",     color: "#002b5c" },
  { name: "Brisbane Lions",    logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Brisbane",          logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Carlton",           logo: "/team-logos/blues.png",     color: "#031a35" },
  { name: "Collingwood",       logo: "/team-logos/magpies.png",   color: "#1e1e28" },
  { name: "Essendon",          logo: "/team-logos/bombers.png",   color: "#cc0000" },
  { name: "Fremantle",         logo: "/team-logos/dockers.png",   color: "#4b1979" },
  { name: "Geelong Cats",      logo: "/team-logos/cats.png",      color: "#003b73" },
  { name: "Gold Coast",        logo: "/team-logos/suns.png",      color: "#c0392b" },
  { name: "GWS Giants",        logo: "/team-logos/giants.png",    color: "#e05a1a" },
  { name: "GWS",               logo: "/team-logos/giants.png",    color: "#e05a1a" },
  { name: "Hawthorn",          logo: "/team-logos/hawks.png",     color: "#6b3a1f" },
  { name: "Melbourne",         logo: "/team-logos/demons.png",    color: "#c8102e" },
  { name: "North Melbourne",   logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide",     logo: "/team-logos/power.png",     color: "#008999" },
  { name: "Richmond",          logo: "/team-logos/tigers.png",    color: "#facc15" },
  { name: "St Kilda",          logo: "/team-logos/saints.png",    color: "#c8102e" },
  { name: "Sydney",            logo: "/team-logos/swans.png",     color: "#c0392b" },
  { name: "West Coast",        logo: "/team-logos/eagles.png",    color: "#003087" },
  { name: "Western Bulldogs",  logo: "/team-logos/bulldogs.png",  color: "#1a4abf" },
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
  return f ? `/players/${f}/${slugName(name)}.png` : "";
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

  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [friends,       setFriends]       = useState<FriendEntry[]>([]);
  const [showFriends,   setShowFriends]   = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [cardCount,     setCardCount]     = useState(0);
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [gamesMap,  setGamesMap]  = useState<Map<number, { hteam: string; ateam: string }>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendStatus,  setFriendStatus]  = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [playerStatsMap, setPlayerStatsMap] = useState<Map<string, { rating: string; gb: string; d: string; k: string; h: string; m: string; t: string; ho: string }>>(new Map());
  const [playerPasses,   setPlayerPasses]   = useState<PlayerPass[]>([]);
  const [teamPasses,     setTeamPasses]     = useState<TeamPass[]>([]);

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
          next.set(`${gameId}_${slug}`, {
            rating: rating > 0 ? String(rating) : "",
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
        .select("id, username, display_name, avatar_url, banner_url, bio, created_at, favourites, featured_cards, featured_passes, aura, coins, favourite_team")
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

      const { data: rows } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${p.id},addressee_id.eq.${p.id}`);

      const ids = (rows ?? []).map(r => r.requester_id === p.id ? r.addressee_id : r.requester_id);

      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
        setFriends((data ?? []) as FriendEntry[]);
      } else {
        setFriends([]);
      }

      // Fetch passes
      const [{ data: ppData }, { data: tpData }] = await Promise.all([
        supabase.from("user_player_passes").select("*").eq("user_id", p.id).eq("active", true).order("created_at", { ascending: true }),
        supabase.from("user_team_passes").select("*").eq("user_id", p.id).eq("active", true).order("created_at", { ascending: true }),
      ]);
      setPlayerPasses(dedupePlayerPasses((ppData ?? []) as PlayerPass[]));
      setTeamPasses((tpData ?? []) as TeamPass[]);

      setLoading(false);
    }

    if (username) load().catch(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <main style={pageStyle} className="page-enter">
        <div style={topBarStyle}>
          <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
        </div>
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
        <div style={topBarStyle}>
          <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
        </div>
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

  return (
    <main style={pageStyle} className="page-enter">
      {/* Back button */}
      <div style={topBarStyle}>
        <button onClick={() => router.back()} style={backBtnStyle}>← Back</button>
      </div>

      <div style={wrapStyle}>

        {/* ── Profile header ── */}
        <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, overflow: "hidden" }}>
          {/* Banner — clean, nothing on top */}
          <div style={{
            height: 110,
            backgroundColor: "#06101e",
            backgroundImage: profile.banner_url
              ? `url(${profile.banner_url})`
              : "radial-gradient(ellipse at 15% 60%,rgba(59,130,246,.6),transparent 40%),radial-gradient(ellipse at 85% 20%,rgba(99,102,241,.5),transparent 40%),radial-gradient(ellipse at 50% 100%,rgba(34,197,94,.2),transparent 50%),linear-gradient(160deg,#06101e,#000)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }} />

          {/* Avatar + username + pills */}
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 16px", gap: 14 }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={label} style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--bg)", boxShadow: "0 0 0 2px var(--border-3)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(135deg,${avBg},var(--surface-1))`, color: avFg, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, border: "3px solid var(--bg)", boxShadow: `0 0 0 2px var(--border-3),0 0 30px ${avFg}44`, flexShrink: 0 }}>
                  {label[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Username + pills */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                @{profile.username}
              </h1>
              {/* Favourite team badge */}
              {profile.favourite_team && (() => {
                const team = TEAMS.find(t => t.name === profile.favourite_team);
                return team ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: `${team.color}18` }}>
                      <img src={team.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", letterSpacing: "-0.01em" }}>{profile.favourite_team}</span>
                  </div>
                ) : null;
              })()}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                {/* Aura */}
                <a href="/aura-leaderboard" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 900, background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>✦ {(profile.aura ?? 0).toLocaleString()}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Aura</span>
                </a>
                {/* Cards */}
                <Link href={`/album/${profile.username}`} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Layers size={18} color="var(--text-1)" strokeWidth={2.5} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{cardCount.toLocaleString()}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Cards</span>
                </Link>
                {/* Friends */}
                <button onClick={() => setShowFriends(true)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Users size={18} color="var(--text-1)" strokeWidth={2.5} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{friends.length}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Friends</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div style={{ margin: "0 14px", padding: "14px 16px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
            <p style={{ margin: 0, color: profile.bio ? "#cbd5e1" : "#475569", fontSize: 14, fontWeight: 600, lineHeight: 1.6, fontStyle: profile.bio ? "normal" : "italic" }}>
              {profile.bio || "No bio yet."}
            </p>
          </div>

          {/* Add Friend + Message buttons (only when viewing another user's profile) */}
          {!isOwnProfile && currentUserId && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px 14px" }}>
              <button
                onClick={handleFriendAction}
                disabled={friendLoading}
                style={{
                  flex: 1, padding: "11px 14px", borderRadius: 14, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 900, fontSize: 14,
                  background: friendStatus === "accepted" ? "rgba(239,68,68,.15)"
                    : friendStatus === "pending_sent" ? "var(--border-2)"
                    : friendStatus === "pending_received" ? "rgba(59,130,246,.2)"
                    : "rgba(59,130,246,.2)",
                  color: friendStatus === "accepted" ? "#f87171"
                    : friendStatus === "pending_sent" ? "#94a3b8"
                    : "#60a5fa",
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
                  flex: 1, padding: "11px 14px", borderRadius: 14,
                  border: "1px solid var(--border-3)", cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 900, fontSize: 14,
                  background: "var(--surface-3)", color: "var(--text-1)",
                }}
              >
                Message
              </button>
            </div>
          )}
        </section>

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
          const featuredSlots = (profile.featured_cards ?? []).slice(0, 5);
          const featuredWithData = featuredSlots
            .map(fc => ({ fc, player: CARD_PLAYERS.find(p => p.id === fc.player_id) }))
            .filter((x): x is { fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0] } => !!x.player);
          if (featuredWithData.length === 0) return null;

          return (
            <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "16px 0 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>featured cards</div>
                <Link href={`/album/${profile.username}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textDecoration: "none" }}>
                  {featuredWithData.length}/5 · View Album
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
          <section style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, padding: "18px 16px 20px" }}>
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
            <button onClick={() => setShowFriends(false)} style={backBtnStyle}>← Back</button>
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
                  <span style={{ fontSize: 15, fontWeight: 900 }}>@{f.username}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const topBarStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "calc(env(safe-area-inset-top) + 12px) 20px 10px",
};

const backBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#60a5fa",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
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

const avatarStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: "50%",
  objectFit: "cover",
  border: "3px solid #000",
  boxShadow: "0 0 0 2px var(--border-3)",
  flexShrink: 0,
};
