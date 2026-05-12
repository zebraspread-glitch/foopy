"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Layers } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import XPBar from "@/app/components/XPBar";
import LevelBadge from "@/app/components/LevelBadge";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import playersData from "@/app/data/players.json";

// ── Types ─────────────────────────────────────────────────────────────────────

type FavSlot =
  | { type: "team" | "player"; label: string; sublabel?: string; image: string; color: string }
  | null;

type FeaturedCardSlot = { player_id: string; rarity: string };

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
  xp: number | null;
  level: number | null;
  coins: number | null;
};

type FriendEntry = { id: string; username: string | null; avatar_url: string | null };

// ── Teams ────────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: "Adelaide",          logo: "/team-logos/crows.png",     color: "#002b5c" },
  { name: "Brisbane Lions",    logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Brisbane",          logo: "/team-logos/lions.png",     color: "#7a003c" },
  { name: "Carlton",           logo: "/team-logos/blues.png",     color: "#031a35" },
  { name: "Collingwood",       logo: "/team-logos/magpies.png",   color: "#111111" },
  { name: "Essendon",          logo: "/team-logos/bombers.png",   color: "#cc0000" },
  { name: "Fremantle",         logo: "/team-logos/dockers.png",   color: "#4b1979" },
  { name: "Geelong Cats",      logo: "/team-logos/cats.png",      color: "#003b73" },
  { name: "Gold Coast",        logo: "/team-logos/suns.png",      color: "#c0392b" },
  { name: "GWS Giants",        logo: "/team-logos/giants.png",    color: "#e05a1a" },
  { name: "Hawthorn",          logo: "/team-logos/hawks.png",     color: "#6b3a1f" },
  { name: "Melbourne",         logo: "/team-logos/demons.png",    color: "#c8102e" },
  { name: "North Melbourne",   logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide",     logo: "/team-logos/power.png",     color: "#008999" },
  { name: "Richmond",          logo: "/team-logos/tigers.png",    color: "#1a1a1a" },
  { name: "St Kilda",          logo: "/team-logos/saints.png",    color: "#c8102e" },
  { name: "Sydney",            logo: "/team-logos/swans.png",     color: "#c0392b" },
  { name: "West Coast",        logo: "/team-logos/eagles.png",    color: "#003087" },
  { name: "Western Bulldogs",  logo: "/team-logos/bulldogs.png",  color: "#1a4abf" },
];

const RARITY_META: Record<string, { color: string; glow: string }> = {
  bronze:  { color: "#cd7f32", glow: "rgba(205,127,50,0.6)" },
  silver:  { color: "#c0c0c0", glow: "rgba(192,192,192,0.6)" },
  gold:    { color: "#ffd700", glow: "rgba(255,215,0,0.6)" },
  diamond: { color: "#67e8f9", glow: "rgba(103,232,249,0.7)" },
  mythic:  { color: "#c084fc", glow: "rgba(192,132,252,0.8)" },
};

function slugName(s: string) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerImagePath(name: string, team?: string) {
  const folder = TEAMS.find(t => slugName(t.name) === slugName(team ?? ""))?.name
    .toLowerCase().replace(/\s+/g, "") ?? slugName(team ?? "");
  const clubFolder: Record<string, string> = {
    adelaide: "crows", brisbanelions: "lions", carlton: "blues",
    collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
    geelongcats: "cats", goldcoast: "suns", gwsgiants: "giants",
    hawthorn: "hawks", melbourne: "demons", northmelbourne: "kangaroos",
    portadelaide: "power", richmond: "tigers", stkilda: "saints",
    sydney: "swans", westcoast: "eagles", westernbulldogs: "bulldogs",
  };
  const f = clubFolder[folder] ?? folder;
  return f ? `/players/${f}/${slugName(name)}.png` : "";
}

function normaliseFavSlot(slot: FavSlot): FavSlot {
  if (!slot) return null;
  if (slot.type === "player") {
    return { ...slot, image: playerImagePath(slot.label, slot.sublabel) };
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
// apiSportsId → { name, team }  (for play event keys like q1_m5_tgoal_p804)
// slugName(name) → team          (for player_ event keys)
const playerById  = new Map<string, { name: string; team: string }>();
const playerBySlug = new Map<string, { name: string; team: string }>();
for (const p of playersData as Array<{ name: string; team: string; apiSportsId?: number }>) {
  if (p.apiSportsId) playerById.set(String(p.apiSportsId), p);
  playerBySlug.set(slugName(p.name), p);
}

// ── Fav slot component (needs its own hook) ───────────────────────────────────

function FavSlotView({ slot }: { slot: NonNullable<FavSlot> }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = slot.image && !imgErr;

  return (
    <div style={{ minWidth: 0, textAlign: "center" as const }}>
      <div style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", background: slot.color || "#111827" }}>
        {showImg ? (
          <img
            src={slot.image}
            alt={slot.label}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 950 }}>{initials(slot.label)}</span>
        )}
      </div>
      <div style={{ marginTop: 7, color: "#64748b", fontSize: 10, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
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
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: team?.color ?? "#1e293b", border: "1.5px solid rgba(255,255,255,.12)" }} />
  );
  return (
    <img src={team.logo} alt={name} onError={() => setErr(true)}
      style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(255,255,255,.12)", background: team.color }} />
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
      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", cursor: href ? "pointer" : "default" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.5, wordBreak: "break-word" as const }}>
          {comment.body}
        </p>
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#475569" }}>
          {timeAgo(comment.created_at)}
        </div>
      </div>
      {imgSrc && !imgErr ? (
        <img src={imgSrc} alt="" onError={() => setImgErr(true)}
          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid rgba(255,255,255,.1)", background: "#111" }} />
      ) : teams ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <TeamLogoImg name={teams.hteam} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "#334155" }}>vs</span>
          <TeamLogoImg name={teams.ateam} />
        </div>
      ) : null}
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
    fetch("/api/squiggle/games")
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
        .select("id, username, display_name, avatar_url, banner_url, bio, created_at, favourites, featured_cards, xp, level, coins")
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

      setLoading(false);
    }

    if (username) load();
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>This profile doesn't exist or may have been removed.</p>
          <button onClick={() => router.back()} style={{ padding: "12px 22px", borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Go back</button>
        </div>
      </main>
    );
  }

  const label    = profile.username || profile.display_name || "User";
  const [avBg, avFg] = avatarColors(label);
  const xp       = profile.xp    ?? 0;
  const level    = profile.level  ?? 1;
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
        <section style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, overflow: "hidden" }}>
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
                <img src={profile.avatar_url} alt={label} style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "3px solid #111", boxShadow: "0 0 0 2px rgba(255,255,255,.12)", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(135deg,${avBg},#050505)`, color: avFg, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, border: "3px solid #111", boxShadow: `0 0 0 2px rgba(255,255,255,.12),0 0 30px ${avFg}44`, flexShrink: 0 }}>
                  {label[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Username + pills */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                @{profile.username}
              </h1>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 6px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <LevelBadge level={level} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>Level {level}</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <Layers size={14} color="#94a3b8" strokeWidth={2} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>{cardCount.toLocaleString()} cards</span>
                </div>
                <button onClick={() => setShowFriends(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", color: "#e2e8f0", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  <Users size={14} color="#94a3b8" strokeWidth={2} />
                  <span>{friends.length} friends</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div style={{ margin: "0 14px", padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
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
                    : friendStatus === "pending_sent" ? "rgba(255,255,255,.08)"
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
                  border: "1px solid rgba(255,255,255,.12)", cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 900, fontSize: 14,
                  background: "rgba(255,255,255,.06)", color: "#e2e8f0",
                }}
              >
                Message
              </button>
            </div>
          )}
        </section>

        {/* ── Favourites ── */}
        <section style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "18px 16px 22px" }}>
          <div style={{ marginBottom: 16, fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            favorites
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {favourites.map((slot, i) =>
              slot ? (
                <FavSlotView key={i} slot={slot} />
              ) : (
                <div key={i} style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", border: "2px dashed rgba(255,255,255,.1)", background: "rgba(255,255,255,.025)" }} />
              )
            )}
          </div>
        </section>

        {/* ── Featured Cards ── */}
        {(() => {
          const featuredSlots = (profile.featured_cards ?? []).slice(0, 5);
          const featuredWithData = featuredSlots
            .map(fc => ({ fc, player: CARD_PLAYERS.find(p => p.id === fc.player_id) }))
            .filter((x): x is { fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0] } => !!x.player);
          const hasFeatured = featuredWithData.length > 0;

          return (
            <Link href={`/album/${profile.username}`} style={{ textDecoration: "none", color: "#fff" }}>
              <section style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "18px 16px 20px", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>featured cards</div>
                  {hasFeatured && <div style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{featuredWithData.length}/5</div>}
                </div>
                {hasFeatured ? (
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" as const }}>
                    {featuredWithData.map(({ fc, player }, idx) => {
                      const meta = RARITY_META[fc.rarity] ?? RARITY_META.bronze;
                      return (
                        <div key={idx} style={{ flexShrink: 0, position: "relative", width: 110, height: 154, borderRadius: 14, overflow: "hidden", border: `1.5px solid ${meta.color}99`, boxShadow: `0 2px 16px ${meta.glow}` }}>
                          <img src={`/cards/${fc.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.04) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.5) 65%, rgba(0,0,0,.88) 100%)" }} />
                          <div style={{ position: "absolute", top: "11%", left: "50%", transform: "translateX(-50%)", width: "66%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", border: `2px solid ${meta.color}`, boxShadow: `0 0 12px ${meta.glow}`, background: "#0a0a0a" }}>
                            <img src={`/players/${player.folder}/${player.id}.png`} alt={player.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                          </div>
                          <div style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,.85)", color: meta.color, fontSize: 7, fontWeight: 1000, padding: "2px 5px", borderRadius: 5, border: `1px solid ${meta.color}44`, letterSpacing: ".04em" }}>
                            {fc.rarity.toUpperCase()}
                          </div>
                          <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
                            <div style={{ fontSize: 9, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 10px ${meta.glow}` }}>
                              {player.name}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "28px 0 16px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>No featured cards yet</div>
                  </div>
                )}
              </section>
            </Link>
          );
        })()}

        {/* ── Album ── */}
        <Link href={`/album/${profile.username}`} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18,
          padding: "22px 20px", textDecoration: "none", color: "#fff",
        }}>
          <span style={{ fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em" }}>Album</span>
        </Link>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "18px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              member since
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.02em", color: "#f8fafc" }}>
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

          <div style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "18px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Polls win rate
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              —
            </div>
          </div>
        </div>

        {/* ── Comment history ── */}
        {comments.length > 0 && (
          <section style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "18px 16px 20px" }}>
            <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              comments
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comments.map(c => {
                const ek = c.event_key;
                let player: { name: string; team: string } | undefined;
                if (ek?.startsWith("player_")) {
                  player = playerBySlug.get(ek.slice(7));
                } else if (ek) {
                  // e.g. q1_m5_tgoal_p804 — the _p suffix is the numeric apiSportsId
                  const m = ek.match(/_p([^_]+)$/);
                  if (m) player = playerById.get(m[1]);
                }
                const imgSrc = player ? playerImagePath(player.name, player.team) : null;
                const teams = c.game_id ? (gamesMap.get(c.game_id) ?? null) : null;
                const href = c.game_id && ek
                  ? `/match/${c.game_id}/${ek}?highlight=${c.id}`
                  : c.game_id
                  ? `/match/${c.game_id}?tab=chat&highlight=${c.id}`
                  : null;
                return <CommentRow key={c.id} comment={c} imgSrc={imgSrc} teams={teams} href={href} />;
              })}
            </div>
          </section>
        )}

      </div>

      {/* ── Friends overlay ── */}
      {showFriends && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000", color: "#fff", overflowY: "auto" }}>
          <div style={{ height: 58, display: "flex", alignItems: "center", gap: 18, padding: "0 20px", background: "#050505", borderBottom: "1px solid rgba(255,255,255,.09)", position: "sticky", top: 0 }}>
            <button onClick={() => setShowFriends(false)} style={backBtnStyle}>← Back</button>
            <strong style={{ fontSize: 18 }}>Friends</strong>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {friends.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 14, fontWeight: 800, padding: "30px 0", textAlign: "center" }}>No friends yet.</div>
            ) : (
              friends.map(f => (
                <button key={f.id} onClick={() => router.push(`/profile/${f.username}`)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", background: "#0d0d0d", color: "#fff", cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" }}>
                  {f.avatar_url
                    ? <img src={f.avatar_url} alt={f.username || ""} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />
                    : <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#111", color: "#94a3b8", display: "grid", placeItems: "center", fontWeight: 950, flexShrink: 0 }}>{(f.username || "?")[0].toUpperCase()}</div>
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
  background: "#000",
  color: "#fff",
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
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
  overflow: "hidden",
};

const avatarStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: "50%",
  objectFit: "cover",
  border: "3px solid #000",
  boxShadow: "0 0 0 2px rgba(255,255,255,.12)",
  flexShrink: 0,
};
