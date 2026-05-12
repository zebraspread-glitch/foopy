"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import type { CSSProperties } from "react";
import { X, Plus, Search, RotateCcw, Camera, ImageIcon, AtSign, Pencil, Users } from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { supabase } from "@/app/lib/supabase";
import { createNotification } from "@/app/lib/notifications";
import { useXP } from "@/app/context/XPContext";
import XPBar from "@/app/components/XPBar";
import LevelBadge from "@/app/components/LevelBadge";
import playersRaw from "@/app/data/players.json";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";

/* ─────────────────── Types ─────────────────── */
type FeaturedCardSlot = { player_id: string; rarity: string };

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  username_updated_at: string | null;
  bio: string | null;
  banner_url: string | null;
  favourites: FavSlot[] | null;
  featured_cards: FeaturedCardSlot[] | null;
  coins: number | null;
};

type FriendEntry = {
  friendship_id: string;
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type RequestEntry = {
  friendship_id: string;
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
};

type EditSection = null | "menu" | "username" | "bio";
type FriendsTab = "friends" | "requests" | "add";
type PreviewType = "avatar" | "banner";

type FavSlot =
  | {
      type: "team" | "player";
      label: string;
      sublabel?: string;
      image: string;
      color: string;
    }
  | null;

type PickerTab = "teams" | "players";

/* ─────────────────── Teams constant ─────────────────── */
const TEAMS = [
  { name: "Adelaide", logo: "/team-logos/crows.png", color: "#002b5c" },
  { name: "Brisbane Lions", logo: "/team-logos/lions.png", color: "#7a003c" },
  { name: "Brisbane", logo: "/team-logos/lions.png", color: "#7a003c" },
  { name: "Carlton", logo: "/team-logos/blues.png", color: "#031a35" },
  { name: "Collingwood", logo: "/team-logos/magpies.png", color: "#111111" },
  { name: "Essendon", logo: "/team-logos/bombers.png", color: "#cc0000" },
  { name: "Fremantle", logo: "/team-logos/dockers.png", color: "#4b1979" },
  { name: "Geelong Cats", logo: "/team-logos/cats.png", color: "#003b73" },
  { name: "Gold Coast", logo: "/team-logos/suns.png", color: "#c0392b" },
  { name: "GWS Giants", logo: "/team-logos/giants.png", color: "#e05a1a" },
  { name: "Hawthorn", logo: "/team-logos/hawks.png", color: "#6b3a1f" },
  { name: "Melbourne", logo: "/team-logos/demons.png", color: "#c8102e" },
  { name: "North Melbourne", logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide", logo: "/team-logos/power.png", color: "#008999" },
  { name: "Richmond", logo: "/team-logos/tigers.png", color: "#1a1a1a" },
  { name: "St Kilda", logo: "/team-logos/saints.png", color: "#c8102e" },
  { name: "Sydney", logo: "/team-logos/swans.png", color: "#c0392b" },
  { name: "West Coast", logo: "/team-logos/eagles.png", color: "#003087" },
  { name: "Western Bulldogs", logo: "/team-logos/bulldogs.png", color: "#1a4abf" },
];

/* ─────────────────── Rarity meta ─────────────────── */
const RARITY_META: Record<string, { color: string; glow: string }> = {
  bronze:  { color: "#cd7f32", glow: "rgba(205,127,50,0.6)" },
  silver:  { color: "#c0c0c0", glow: "rgba(192,192,192,0.6)" },
  gold:    { color: "#ffd700", glow: "rgba(255,215,0,0.6)" },
  diamond: { color: "#67e8f9", glow: "rgba(103,232,249,0.7)" },
  mythic:  { color: "#c084fc", glow: "rgba(192,132,252,0.8)" },
};

/* ─────────────────── Player helpers ─────────────────── */
type RawPlayer = { name?: string; team?: string };
const PLAYERS = (playersRaw as RawPlayer[]).filter((p) => p.name);

const CLUB_FOLDER: Record<string, string> = {
  Adelaide: "crows",
  Crows: "crows",

  Brisbane: "lions",
  "Brisbane Lions": "lions",
  Lions: "lions",

  Carlton: "blues",
  Blues: "blues",

  Collingwood: "magpies",
  Magpies: "magpies",

  Essendon: "bombers",
  Bombers: "bombers",

  Fremantle: "dockers",
  Dockers: "dockers",

  Geelong: "cats",
  "Geelong Cats": "cats",
  Cats: "cats",

  "Gold Coast": "suns",
  "Gold Coast Suns": "suns",
  Suns: "suns",

  GWS: "giants",
  "GWS Giants": "giants",
  Giants: "giants",

  Hawthorn: "hawks",
  Hawks: "hawks",

  Melbourne: "demons",
  Demons: "demons",

  "North Melbourne": "kangaroos",
  Kangaroos: "kangaroos",

  "Port Adelaide": "power",
  Power: "power",

  Richmond: "tigers",
  Tigers: "tigers",

  "St Kilda": "saints",
  Saints: "saints",

  Sydney: "swans",
  Swans: "swans",

  "West Coast": "eagles",
  "West Coast Eagles": "eagles",
  Eagles: "eagles",

  "Western Bulldogs": "bulldogs",
  Bulldogs: "bulldogs",
};

function slugName(name: string) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerImagePath(name: string, team?: string) {
  const folder = CLUB_FOLDER[team ?? ""] ?? slugName(team ?? "");
  return folder ? `/players/${folder}/${slugName(name)}.png` : "";
}

function teamColor(teamName: string) {
  return TEAMS.find((t) => t.name === teamName)?.color ?? "#1a1a2e";
}


function normaliseFavSlot(slot: FavSlot): FavSlot {
  if (!slot) return null;

  if (slot.type === "player") {
    return {
      ...slot,
      image: playerImagePath(slot.label, slot.sublabel),
      color: teamColor(slot.sublabel ?? "") || slot.color,
    };
  }

  const team = TEAMS.find((t) => t.name === slot.label);
  if (team) {
    return { ...slot, image: team.logo, color: team.color };
  }

  return slot;
}

function normaliseFavSlots(slots: FavSlot[]) {
  return slots.slice(0, 8).map(normaliseFavSlot).concat(Array(Math.max(0, 8 - slots.length)).fill(null));
}

/* ─────────────────── Avatar helpers ─────────────────── */
const AVATAR_PALETTE: [string, string][] = [
  ["#1a3a5c", "#60a5fa"],
  ["#2d1b4e", "#c084fc"],
  ["#1a3d2e", "#4ade80"],
  ["#3d2a10", "#fb923c"],
  ["#3d1a1a", "#f87171"],
  ["#1a3d3a", "#2dd4bf"],
  ["#2a2a10", "#facc15"],
  ["#1a2a3d", "#38bdf8"],
];

function avatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [bg, fg] = avatarColors(name || "?");

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 950,
        flexShrink: 0,
      }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

/* ─────────────────── Username helpers ─────────────────── */
function nextChangeDate(d: string | null) {
  if (!d) return null;
  const r = new Date(d);
  r.setDate(r.getDate() + 30);
  return r;
}

function canChangeUsername(d: string | null) {
  if (!d) return true;
  return new Date() >= nextChangeDate(d)!;
}

function validImageFile(file: File, type: PreviewType) {
  const avatarAllowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
  const bannerAllowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const allowed = type === "avatar" ? avatarAllowed : bannerAllowed;
  const maxSize = type === "avatar" ? 5 * 1024 * 1024 : 8 * 1024 * 1024;

  if (file.size > maxSize) {
    return type === "avatar" ? "Image must be under 5 MB." : "Banner must be under 8 MB.";
  }

  if (!allowed.includes(file.type)) {
    return type === "avatar" ? "Only JPG, PNG, WebP, or HEIC images are allowed." : "Only JPG, PNG, or WebP images are allowed.";
  }

  return "";
}

async function getCroppedImage(imageSrc: string, cropPixels: Area, type: PreviewType): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Could not create image canvas.");

  canvas.width = type === "banner" ? 1500 : 512;
  canvas.height = type === "banner" ? 500 : 512;

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Could not crop image."));
        else resolve(b);
      },
      "image/jpeg",
      0.92
    );
  });

  return new File([blob], type === "banner" ? "banner.jpg" : "avatar.jpg", {
    type: "image/jpeg",
  });
}

/* ─────────────────── Favourites Picker ─────────────────── */
function FavouritesPicker({
  onPick,
  onClose,
}: {
  onPick: (slot: NonNullable<FavSlot>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>("teams");
  const [query, setQuery] = useState("");

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLAYERS.slice(0, 60);
    return PLAYERS.filter((p) => p.name!.toLowerCase().includes(q)).slice(0, 60);
  }, [query]);

  function pickTeam(t: (typeof TEAMS)[number]) {
    onPick({ type: "team", label: t.name, image: t.logo, color: t.color });
  }

  function pickPlayer(p: RawPlayer) {
    onPick({
      type: "player",
      label: p.name!,
      sublabel: p.team,
      image: playerImagePath(p.name!, p.team),
      color: teamColor(p.team ?? ""),
    });
  }

  return (
    <div style={pickerOverlayStyle} onClick={onClose}>
      <div style={pickerSheetStyle} onClick={(e) => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 950 }}>Add Favourite</span>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.08)",
              border: "none",
              color: "#94a3b8",
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={pickerTabsStyle}>
          {(["teams", "players"] as PickerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...pickerTabBtnStyle,
                background: tab === t ? "white" : "transparent",
                color: tab === t ? "#000" : "#64748b",
                fontWeight: tab === t ? 900 : 700,
              }}
            >
              {t === "teams" ? "Teams" : "Players"}
            </button>
          ))}
        </div>

        {tab === "teams" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              maxHeight: 360,
              overflowY: "auto",
              paddingTop: 4,
            }}
          >
            {TEAMS.map((t) => (
              <button key={t.name} onClick={() => pickTeam(t)} style={teamPickItemStyle}>
                <img src={t.logo} alt={t.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
                <span style={{ fontSize: 11, fontWeight: 800, textAlign: "center", lineHeight: 1.2, color: "#cbd5e1" }}>
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === "players" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                color="#475569"
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />
              <input
                placeholder="Search players…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 14px 12px 40px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "#111",
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredPlayers.map((p, i) => (
                <button key={i} onClick={() => pickPlayer(p)} style={playerPickItemStyle}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: teamColor(p.team ?? ""),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 950,
                      color: "white",
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(p.name!)}
                  </div>
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{p.team}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Favourite Slot ─────────────────── */
function FavSlotButton({
  slot,
  index,
  onAdd,
  onRemove,
}: {
  slot: FavSlot;
  index: number;
  onAdd: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [slot?.image, slot?.label, slot?.sublabel]);

  const showImg = slot?.image && !imgError;

  // Both empty and filled share the same outer wrapper so grid sizes them identically
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1" }}>
        {!slot ? (
          <button onClick={() => onAdd(index)} style={emptySlotStyle}>
            <Plus size={20} color="rgba(255,255,255,.3)" strokeWidth={1.8} />
          </button>
        ) : (
          <button
            onClick={() => onAdd(index)}
            style={{ ...filledSlotStyle, background: slot.color, padding: 0 }}
            title="Edit favourite"
          >
            {showImg ? (
              <img
                src={slot.image}
                alt={slot.label}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={() => setImgError(true)}
              />
            ) : (
              <span style={{ fontSize: 16, fontWeight: 950, color: "white" }}>{getInitials(slot.label)}</span>
            )}
          </button>
        )}

        {slot && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(index); }}
            style={removeSlotBtnStyle}
            title="Remove"
          >
            <X size={9} strokeWidth={3} />
          </button>
        )}
      </div>

      <span style={slotLabelStyle}>
        {slot
          ? slot.type === "team"
            ? slot.label.replace(" Lions", "").replace(" Cats", "").replace(" Giants", "").replace(" Bulldogs", "")
            : slot.label.split(" ").pop()
          : ""}
      </span>
    </div>
  );
}

/* ═══════════════════ Main Page ═══════════════════ */
export default function ProfilePage() {
  const router = useRouter();
  const { xp, level, awardXP } = useXP();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [favs, setFavs] = useState<FavSlot[]>(Array(8).fill(null));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number>(0);

  const [editSection, setEditSection] = useState<EditSection>(null);
  const [eUname, setEUname] = useState("");
  const [eUnameErr, setEUnameErr] = useState("");
  const [eUnameBusy, setEUnameBusy] = useState(false);
  const [eBio, setEBio] = useState("");
  const [eBioBusy, setEBioBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarErr, setAvatarErr] = useState("");

  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerErr, setBannerErr] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<PreviewType | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [showFriends, setShowFriends] = useState(false);
  const [friendsTab, setFriendsTab] = useState<FriendsTab>("friends");
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchRes, setSearchRes] = useState<FriendEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
        await applyPending(u.id, data as Profile | null);
        loadFriends(u.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    // Safety net: never hang on the loading screen longer than 6 seconds
    const fallback = setTimeout(() => setLoading(false), 6000);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
          await applyPending(u.id, data as Profile | null);
          loadFriends(u.id);
          // Award daily login XP — XPContext handles cooldown check
          awardXP("daily_login");
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(fallback); setLoading(false); });

    return () => { clearTimeout(fallback); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function applyPending(userId: string, p: Profile | null) {
    const pending = localStorage.getItem("foopy_pending_username");

    if (pending) {
      localStorage.removeItem("foopy_pending_username");

      const { data } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          username: pending,
          display_name: pending,
          username_updated_at: new Date().toISOString(),
        }, { onConflict: "id" })
        .select()
        .single();

      setProfile((data ?? p) as Profile | null);
    } else {
      setProfile(p);
    }
  }

  useEffect(() => {
  if (!user) return;

  const dbFavs = profile?.favourites;

  if (Array.isArray(dbFavs) && dbFavs.length > 0) {
    const fixed = normaliseFavSlots(dbFavs);
    setFavs(fixed);
    localStorage.setItem(`foopy_favs_${user.id}`, JSON.stringify(fixed));
    supabase.from("profiles").update({ favourites: fixed }).eq("id", user.id);
    return;
  }

  const saved = localStorage.getItem(`foopy_favs_${user.id}`);
  if (saved) {
    try {
      const arr = JSON.parse(saved) as FavSlot[];
      const fixed = normaliseFavSlots(arr);
      setFavs(fixed);

      supabase.from("profiles").update({ favourites: fixed }).eq("id", user.id);
    } catch {
      // ignore
    }
  }
}, [user, profile]);

  async function saveFavs(next: FavSlot[]) {
  const fixed = normaliseFavSlots(next);
  setFavs(fixed);

  if (!user) return;

  localStorage.setItem(`foopy_favs_${user.id}`, JSON.stringify(fixed));

  await supabase
    .from("profiles")
    .update({ favourites: fixed })
    .eq("id", user.id);

  setProfile((prev) => (prev ? { ...prev, favourites: fixed } : prev));
}

  function openPicker(i: number) {
    setPickerSlot(i);
    setPickerOpen(true);
  }

  function handlePick(slot: NonNullable<FavSlot>) {
    const alreadyExists = favs.some(
      (f, i) => i !== pickerSlot && f?.label === slot.label && f?.type === slot.type
    );
    if (alreadyExists) return;
    const next = [...favs];
    next[pickerSlot] = slot;
    saveFavs(next);
    setPickerOpen(false);
    awardXP("add_favourite", { slot: pickerSlot });
  }

  function removeSlot(i: number) {
    const next = [...favs];
    next[i] = null;
    saveFavs(next);
  }

  const loadFriends = useCallback(async (uid: string) => {
    setFriendsLoading(true);

    const [{ data: rows }, { data: reqs }] = await Promise.all([
      supabase
        .from("friendships")
        .select("id,requester_id,addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase
        .from("friendships")
        .select("id,requester_id,created_at")
        .eq("addressee_id", uid)
        .eq("status", "pending"),
    ]);

    const otherIds = (rows ?? []).map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
    const reqIds = (reqs ?? []).map((r: any) => r.requester_id);

    const [{ data: fp }, { data: rp }] = await Promise.all([
      otherIds.length
        ? supabase.from("profiles").select("id,username,avatar_url").in("id", otherIds)
        : Promise.resolve({ data: [] }),
      reqIds.length
        ? supabase.from("profiles").select("id,username,avatar_url").in("id", reqIds)
        : Promise.resolve({ data: [] }),
    ]);

    setFriends(
      (fp ?? []).map((p: any) => ({
        ...p,
        friendship_id: (rows ?? []).find((r) => r.requester_id === p.id || r.addressee_id === p.id)!.id,
      }))
    );

    setRequests(
      (rp ?? []).map((p: any) => {
        const req = (reqs ?? []).find((r: any) => r.requester_id === p.id)!;
        return { ...p, friendship_id: req.id, created_at: req.created_at };
      })
    );

    setFriendsLoading(false);
  }, []);

  function openFriends() {
    setShowFriends(true);
    setFriendsTab("friends");
    setFriendSearch("");
    setSearchRes([]);
    if (user) loadFriends(user.id);
  }

  useEffect(() => {
    if (!friendSearch.trim() || !user) {
      setSearchRes([]);
      return;
    }

    if (searchTimer.current) clearTimeout(searchTimer.current);

    searchTimer.current = setTimeout(async () => {
      setSearching(true);

      const { data } = await supabase
        .from("profiles")
        .select("id,username,avatar_url")
        .ilike("username", `%${friendSearch.trim().toLowerCase()}%`)
        .neq("id", user.id)
        .limit(15);

      setSearchRes((data ?? []) as FriendEntry[]);
      setSearching(false);
    }, 350);
  }, [friendSearch, user]);

  async function sendRequest(id: string) {
    if (!user) return;

    await supabase.from("friendships").upsert(
      {
        requester_id: user.id,
        addressee_id: id,
        status: "pending",
      },
      { onConflict: "requester_id,addressee_id" }
    );

    // Notify the addressee
    createNotification(id, "friend_request", user.id);

    setSearchRes((prev) => prev.filter((p) => p.id !== id));
  }

  async function acceptRequest(fid: string) {
    // Get the requester_id before updating
    const { data: row } = await supabase.from("friendships").select("requester_id").eq("id", fid).single();
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", fid);
    // Notify requester their request was accepted
    if (row?.requester_id && user) createNotification(row.requester_id, "friend_accepted", user.id);
    if (user) loadFriends(user.id);
  }

  async function declineRequest(fid: string) {
    await supabase.from("friendships").delete().eq("id", fid);
    setRequests((prev) => prev.filter((r) => r.friendship_id !== fid));
  }

  async function removeFriend(fid: string) {
    await supabase.from("friendships").delete().eq("id", fid);
    setFriends((prev) => prev.filter((f) => f.friendship_id !== fid));
  }

  function openImagePreview(file: File, type: PreviewType) {
    const err = validImageFile(file, type);

    if (err) {
      if (type === "avatar") setAvatarErr(err);
      if (type === "banner") setBannerErr(err);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    setPreviewFile(file);
    setPreviewType(type);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewOpen(true);
  }

  function closeImagePreview() {
    setPreviewOpen(false);
    setPreviewFile(null);
    setPreviewType(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  }

  async function confirmImageUpload() {
    if (!previewFile || !previewType || !previewUrl || !croppedAreaPixels) return;

    try {
      const type = previewType;
      const croppedFile = await getCroppedImage(previewUrl, croppedAreaPixels, type);

      closeImagePreview();

      if (type === "avatar") await uploadAvatarFile(croppedFile);
      if (type === "banner") await uploadBannerFile(croppedFile);
    } catch (err: any) {
      const message = err?.message || "Could not crop image.";
      if (previewType === "avatar") setAvatarErr(message);
      if (previewType === "banner") setBannerErr(message);
    }
  }

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();

    const clean = eUname.toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (clean.length < 3) {
      setEUnameErr("Username needs 3+ characters.");
      return;
    }

    if (profile?.username && !canChangeUsername(profile.username_updated_at)) {
      setEUnameErr(
        `Next change on ${nextChangeDate(profile.username_updated_at)!.toLocaleDateString("en-AU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}.`
      );
      return;
    }

    setEUnameBusy(true);
    setEUnameErr("");

    const { data, error } = await supabase
      .from("profiles")
      .update({
        username: clean,
        display_name: clean,
        username_updated_at: new Date().toISOString(),
      })
      .eq("id", user!.id)
      .select()
      .single();

    if (error) {
      setEUnameErr(error.code === "23505" ? "Username taken — try another." : error.message);
      setEUnameBusy(false);
      return;
    }

    setProfile(data as Profile);
    setEditSection(null);
    setEUnameBusy(false);
    awardXP("set_username");
  }

  async function saveBio(e: React.FormEvent) {
    e.preventDefault();
    setEBioBusy(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({ bio: eBio.trim() || null })
      .eq("id", user!.id)
      .select()
      .single();

    if (!error) {
      setProfile(data as Profile);
      awardXP("set_bio");
    }

    setEditSection(null);
    setEBioBusy(false);
  }

  async function uploadAvatarFile(file: File) {
    const err = validImageFile(file, "avatar");
    if (err) {
      setAvatarErr(err);
      return;
    }

    setAvatarUploading(true);
    setAvatarErr("");

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user!.id}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (upErr) {
      setAvatarErr(upErr.message);
      setAvatarUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;

    const { data, error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user!.id).select().single();

    if (error) {
      setAvatarErr(error.message);
      setAvatarUploading(false);
      return;
    }

    setProfile(data as Profile);
    setAvatarUploading(false);
    setEditSection(null);
    awardXP("set_avatar");
  }

  async function uploadBannerFile(file: File) {
    const err = validImageFile(file, "banner");
    if (err) {
      setBannerErr(err);
      return;
    }

    setBannerUploading(true);
    setBannerErr("");

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user!.id}/banner.${ext}`;

    const { error: upErr } = await supabase.storage.from("banners").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (upErr) {
      setBannerErr(upErr.message);
      setBannerUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("banners").getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;

    const { data, error } = await supabase.from("profiles").update({ banner_url: url }).eq("id", user!.id).select().single();

    if (error) {
      setBannerErr(error.message);
      setBannerUploading(false);
      return;
    }

    setProfile(data as Profile);
    setBannerUploading(false);
    setEditSection(null);
  }

  async function signOut() {
    setSignOutBusy(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main style={pageStyle} className="page-enter">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="spinner" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle} className="page-enter">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            gap: 20,
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 52 }}>👤</div>
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 950 }}>Sign in to see your profile</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
              Create an account to track your picks and connect with friends.
            </p>
          </div>
          <button
            onClick={() => router.push("/login")}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 300,
              padding: 16,
              borderRadius: 16,
              background: "linear-gradient(135deg,#3b82f6,#6366f1)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              textAlign: "center",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(59,130,246,0.4)",
            }}
          >
            Sign In / Sign Up
          </button>
        </div>
      </main>
    );
  }

  const username = profile?.username ?? "";
  const label = username || user.email?.split("@")[0] || "User";
  const [avBg, avFg] = avatarColors(label);
  const locked = !!profile?.username && !canChangeUsername(profile.username_updated_at);
  const nextDate = locked ? nextChangeDate(profile!.username_updated_at) : null;
  const filledCount = favs.filter(Boolean).length;

  return (
    <main style={pageStyle} className="page-enter">
      <div style={wrapStyle}>
        {/* ── Profile header card ── */}
        <div style={profileCardStyle}>
          {/* Banner — clean, nothing on top */}
          <div style={{ height: bannerStyle.height, backgroundColor: "#06101e", backgroundImage: profile?.banner_url ? `url(${profile.banner_url})` : bannerStyle.backgroundImage, backgroundSize: "cover", backgroundPosition: "center" }} />

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" style={{ display: "none" }}
            onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setAvatarErr(""); openImagePreview(file, "avatar"); e.target.value = ""; }}
          />
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: "none" }}
            onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setBannerErr(""); openImagePreview(file, "banner"); e.target.value = ""; }}
          />

          {/* Avatar + username + pills — all below the banner */}
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 16px", gap: 14 }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "3px solid #111", boxShadow: "0 0 0 2px rgba(255,255,255,.12)" }} />
              ) : (
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(135deg,${avBg},#050505)`, color: avFg, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, border: "3px solid #111", boxShadow: `0 0 0 2px rgba(255,255,255,.12),0 0 30px ${avFg}44` }}>
                  {label[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Username + pills */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                @{username || "—"}
              </h1>

              {/* Pills: level · coins · friends */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 6px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <LevelBadge level={level} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>Level {level}</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <img src="/coin/coin.png" alt="coins" style={{ width: 16, height: 16, objectFit: "contain" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>{(profile?.coins ?? 0).toLocaleString()}</span>
                </div>
                <button onClick={openFriends} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", color: "#e2e8f0", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  <Users size={14} color="#94a3b8" strokeWidth={2} />
                  <span>{friends.length} friends</span>
                </button>
              </div>
            </div>
          </div>

          {avatarErr && <div style={{ ...errBoxSty, margin: "0 16px 12px" }}>{avatarErr}</div>}
          {bannerErr && <div style={{ ...errBoxSty, margin: "0 16px 12px" }}>{bannerErr}</div>}

          {/* Bio section */}
          <div style={{ margin: "0 14px", padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <p style={{ margin: 0, color: profile?.bio ? "#cbd5e1" : "#475569", fontSize: 14, fontWeight: 600, lineHeight: 1.6, fontStyle: profile?.bio ? "normal" : "italic" }}>
              {profile?.bio || "No bio yet."}
            </p>
          </div>

          {/* Edit button */}
          <div style={{ padding: "12px 14px 16px" }}>
            <button onClick={() => setEditSection("menu")} style={editBtnStyle}>Edit</button>
          </div>

        </div>

        {/* ── XP Progress ── */}
        <div style={{ background: "#080808", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <LevelBadge level={level} size="xl" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                {xp} XP total
              </span>
            </div>
            <XPBar xp={xp} />
          </div>
        </div>

        {/* ── Favourites ── */}
        <div style={sectionCardStyle}>
          <div style={{ marginBottom: 16, fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            favorites
          </div>
          <div style={favsGridStyle}>
            {favs.map((slot, i) => (
              <FavSlotButton key={i} slot={slot} index={i} onAdd={openPicker} onRemove={removeSlot} />
            ))}
          </div>
        </div>

        {/* ── Featured Cards ── */}
        {(() => {
          const featuredSlots = (profile?.featured_cards ?? []).slice(0, 5);
          const featuredWithData = featuredSlots
            .map(fc => ({ fc, player: CARD_PLAYERS.find(p => p.id === fc.player_id) }))
            .filter((x): x is { fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0] } => !!x.player);
          const hasFeatured = featuredWithData.length > 0;

          return (
            <Link href="/album" style={{ textDecoration: "none", color: "#fff" }}>
              <div style={sectionCardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>featured cards</div>
                  {hasFeatured && <div style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{featuredWithData.length}/5</div>}
                </div>
                {hasFeatured ? (
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" as const }}>
                    {featuredWithData.map(({ fc, player }, idx) => {
                      const meta = RARITY_META[fc.rarity] ?? RARITY_META.bronze;
                      return (
                        <div key={idx} style={{ flexShrink: 0, position: "relative", width: 110, height: 154, borderRadius: 14, overflow: "hidden", border: `1.5px solid ${meta.color}99`, boxShadow: `0 2px 16px ${meta.glow}, 0 0 0 0px ${meta.color}` }}>
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
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>No featured cards yet</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1e293b", marginTop: 4 }}>Tap ⭐ on cards in your album</div>
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })()}

        {/* ── Album ── */}
        <Link
          href="/album"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#080808", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 18, padding: "22px 20px", textDecoration: "none", color: "#fff",
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em" }}>Album</span>
        </Link>

        {/* ── Stats row ── */}
        <div style={statsRowStyle}>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Member since
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.03em", color: "#f8fafc" }}>
              {new Date(user.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
              {Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)} days ago
            </div>
          </div>

          <div style={statCardStyle}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Polls win rate
            </div>
            <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: "-0.03em", color: "#f8fafc" }}>
              —
            </div>
          </div>
        </div>

        <button onClick={signOut} disabled={signOutBusy} style={{ ...signOutBtnStyle, opacity: signOutBusy ? 0.6 : 1 }}>
          {signOutBusy ? "Signing out…" : "Sign Out"}
        </button>
      </div>

      {previewOpen && previewUrl && previewType && (
        <div style={previewOverlayStyle}>
          <div style={previewHeaderStyle}>
            <button onClick={closeImagePreview} style={previewIconBtnStyle} aria-label="Cancel preview">
              ←
            </button>

            <strong style={{ fontSize: 16 }}>Image Preview</strong>

            <button onClick={confirmImageUpload} style={previewIconBtnStyle} aria-label="Confirm image">
              ✓
            </button>
          </div>

          <div style={previewBodyStyle}>
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: previewType === "banner" ? 720 : 420,
                aspectRatio: previewType === "banner" ? "3 / 1" : "1 / 1",
                borderRadius: previewType === "banner" ? 14 : "50%",
                overflow: "hidden",
                background: "#111",
                border: "1px solid rgba(255,255,255,.16)",
                boxShadow: "0 20px 60px rgba(0,0,0,.5)",
              }}
            >
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={previewType === "banner" ? 3 / 1 : 1 / 1}
                cropShape={previewType === "avatar" ? "round" : "rect"}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            </div>

            <div style={{ width: "100%", maxWidth: 420, marginTop: 18 }}>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: "100%" }}
              />

              <button
                onClick={() => {
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.06)",
                  color: "#94a3b8",
                  fontWeight: 900,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <RotateCcw size={15} />
                Reset
              </button>
            </div>

            <div style={{ marginTop: 16, color: "#64748b", fontSize: 13, fontWeight: 800 }}>
              Drag the image and use the slider to crop it.
            </div>
          </div>
        </div>
      )}

      {pickerOpen && <FavouritesPicker onPick={handlePick} onClose={() => setPickerOpen(false)} />}

      {/* ── Edit profile modal ── */}
      {editSection !== null && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)" }} onClick={() => setEditSection(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 201, width: "calc(100% - 32px)", maxWidth: 420, background: "#0d0d0d", borderRadius: 24, border: "1px solid rgba(255,255,255,.1)", padding: "24px 20px", maxHeight: "80dvh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>

            {editSection === "menu" && (
              <>
                <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 18 }}>Edit Profile</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <button onClick={() => { setAvatarErr(""); fileInputRef.current?.click(); setEditSection(null); }} disabled={avatarUploading} style={menuBtnSty}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Camera size={18} color="#94a3b8" />
                      <strong>{avatarUploading ? "Uploading…" : "Edit Photo"}</strong>
                    </div>
                    <Chevron />
                  </button>
                  <button onClick={() => { setBannerErr(""); bannerInputRef.current?.click(); setEditSection(null); }} disabled={bannerUploading} style={menuBtnSty}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <ImageIcon size={18} color="#94a3b8" />
                      <strong>{bannerUploading ? "Uploading…" : "Edit Banner"}</strong>
                    </div>
                    <Chevron />
                  </button>
                  <button onClick={() => { setEUname(profile?.username ?? ""); setEUnameErr(""); setEditSection("username"); }} style={menuBtnSty}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <AtSign size={18} color="#94a3b8" />
                      <div style={{ textAlign: "left" as const }}>
                        <strong>Change Username</strong>
                        {locked && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>Locked until {nextDate!.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>}
                      </div>
                    </div>
                    <Chevron />
                  </button>
                  <button onClick={() => { setEBio(profile?.bio ?? ""); setEditSection("bio"); }} style={menuBtnSty}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Pencil size={18} color="#94a3b8" />
                      <strong>Edit Bio</strong>
                    </div>
                    <Chevron />
                  </button>
                  <button onClick={() => setEditSection(null)} style={cancelBtnSty}>Cancel</button>
                </div>
              </>
            )}

            {editSection === "username" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setEditSection("menu")} style={{ background: "none", border: "none", color: "#60a5fa", fontWeight: 800, fontSize: 15, cursor: "pointer", padding: 0 }}>← Back</button>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>Change Username</div>
                </div>
                {locked ? (
                  <div style={lockedBoxStyle}>
                    <strong>🔒 Username locked</strong>
                    <p style={{ margin: "8px 0 14px", color: "#64748b", fontSize: 14 }}>
                      Next change on {nextDate!.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
                    </p>
                    <button onClick={() => setEditSection("menu")} style={cancelBtnSty}>Back</button>
                  </div>
                ) : (
                  <form onSubmit={saveUsername} style={{ display: "grid", gap: 12 }}>
                    <label style={labelSty}>New username</label>
                    <input placeholder="e.g. footyking" value={eUname} onChange={(e) => setEUname(e.target.value)} maxLength={20} style={fieldSty} autoFocus />
                    {eUnameErr && <div style={errBoxSty}>{eUnameErr}</div>}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button type="submit" disabled={eUnameBusy} style={{ ...primaryBtnSty, opacity: eUnameBusy ? 0.65 : 1 }}>{eUnameBusy ? "Saving…" : "Save"}</button>
                      <button type="button" onClick={() => setEditSection("menu")} style={cancelBtnSty}>Back</button>
                    </div>
                  </form>
                )}
              </>
            )}

            {editSection === "bio" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setEditSection("menu")} style={{ background: "none", border: "none", color: "#60a5fa", fontWeight: 800, fontSize: 15, cursor: "pointer", padding: 0 }}>← Back</button>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>Edit Bio</div>
                </div>
                <form onSubmit={saveBio} style={{ display: "grid", gap: 12 }}>
                  <textarea placeholder="Tell people a bit about yourself…" value={eBio} onChange={(e) => setEBio(e.target.value)} maxLength={160} rows={4} style={{ ...fieldSty, resize: "none", lineHeight: 1.5 }} autoFocus />
                  <div style={{ textAlign: "right" as const, color: "#475569", fontSize: 11, marginTop: -6 }}>{eBio.length}/160</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button type="submit" disabled={eBioBusy} style={{ ...primaryBtnSty, opacity: eBioBusy ? 0.65 : 1 }}>{eBioBusy ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => setEditSection("menu")} style={cancelBtnSty}>Back</button>
                  </div>
                </form>
              </>
            )}

            {avatarErr && <div style={{ ...errBoxSty, marginTop: 12 }}>{avatarErr}</div>}
            {bannerErr && <div style={{ ...errBoxSty, marginTop: 12 }}>{bannerErr}</div>}
          </div>
        </>,
        document.body
      )}

      {showFriends && (
        <div style={{ position: "fixed", inset: 0, zIndex: 110, background: "#000", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255,255,255,.08)",
              background: "#050505",
            }}
          >
            <button
              onClick={() => setShowFriends(false)}
              style={{
                background: "none",
                border: "none",
                color: "#60a5fa",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← Back
            </button>

            <span style={{ fontWeight: 950, fontSize: 18, flex: 1 }}>Friends</span>

            {requests.length > 0 && friendsTab !== "requests" && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 900, padding: "2px 8px" }}>
                {requests.length}
              </span>
            )}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.08)", background: "#050505" }}>
            {(["friends", "requests", "add"] as FriendsTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFriendsTab(tab)}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 14,
                  color: friendsTab === tab ? "#fff" : "#475569",
                  borderBottom: friendsTab === tab ? "2px solid #60a5fa" : "2px solid transparent",
                }}
              >
                {tab === "friends"
                  ? `Friends${friends.length > 0 ? ` (${friends.length})` : ""}`
                  : tab === "requests"
                  ? `Requests${requests.length > 0 ? ` (${requests.length})` : ""}`
                  : "Add"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            {friendsTab === "friends" &&
              (friendsLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "#475569" }}>Loading…</div>
              ) : friends.length === 0 ? (
                <EmptyState icon="👥" text="No friends yet. Use the Add tab to find people." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {friends.map((f) => (
                    <div key={f.friendship_id} style={friendRowStyle} onClick={() => router.push(`/profile/${f.username}`)}>
                      <Avatar name={f.username || "?"} url={f.avatar_url} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>@{f.username}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFriend(f.friendship_id);
                        }}
                        style={dangerBtnSty}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ))}

            {friendsTab === "requests" &&
              (friendsLoading ? (
                <div style={{ textAlign: "center", padding: 32, color: "#475569" }}>Loading…</div>
              ) : requests.length === 0 ? (
                <EmptyState icon="📬" text="No pending friend requests." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {requests.map((r) => (
                    <div key={r.friendship_id} style={friendRowStyle}>
                      <Avatar name={r.username || "?"} url={r.avatar_url} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>@{r.username}</div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>wants to be your friend</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => acceptRequest(r.friendship_id)} style={acceptBtnSty}>
                          Accept
                        </button>
                        <button onClick={() => declineRequest(r.friendship_id)} style={dangerBtnSty}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

            {friendsTab === "add" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <input
                  placeholder="Search by username…"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  style={{ ...fieldSty, background: "#111" }}
                  autoFocus
                />

                {searching && <div style={{ textAlign: "center", padding: 24, color: "#475569" }}>Searching…</div>}

                {!searching && friendSearch.trim() && searchRes.length === 0 && <EmptyState icon="🔍" text="No users found." />}

                {searchRes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {searchRes.map((p) => {
                      const isFriend = friends.some((f) => f.id === p.id);

                      return (
                        <div
                          key={p.id}
                          style={{ ...friendRowStyle, cursor: "pointer" }}
                          onClick={() => router.push(`/profile/${p.username}`)}
                        >
                          <Avatar name={p.username || "?"} url={p.avatar_url} size={44} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>@{p.username}</div>
                          </div>

                          {isFriend ? (
                            <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 800 }}>Friends ✓</span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                sendRequest(p.id);
                              }}
                              style={acceptBtnSty}
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Small components ── */
function Chevron() {
  return (
    <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ opacity: 0.3 }}>
      <path d="M1 1.5l5 5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ color: "#475569", fontSize: 14, fontWeight: 700 }}>{text}</div>
    </div>
  );
}

/* ═══════════════════ Styles ═══════════════════ */
const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#000",
  color: "#fff",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const wrapStyle: CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "env(safe-area-inset-top) 12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const profileCardStyle: CSSProperties = {
  overflow: "hidden",
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
};

const bannerStyle: CSSProperties = {
  height: 110,
  background:
    "radial-gradient(ellipse at 15% 60%,rgba(59,130,246,.6),transparent 40%),radial-gradient(ellipse at 85% 20%,rgba(99,102,241,.5),transparent 40%),radial-gradient(ellipse at 50% 100%,rgba(34,197,94,.2),transparent 50%),linear-gradient(160deg,#06101e,#000)",
};

const profileTopStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr auto",
  alignItems: "end",
  gap: 14,
  padding: "0 20px 20px",
  marginTop: -40,
};

const bioBoxStyle: CSSProperties = {
  margin: "0 20px 20px",
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.07)",
};

const bioLabelStyle: CSSProperties = {
  marginBottom: 5,
  color: "#38bdf8",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: ".1em",
  textTransform: "uppercase",
};

const bioTextStyle: CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.55,
};

const editBtnStyle: CSSProperties = {
  padding: "9px 16px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
  alignSelf: "flex-end",
  marginBottom: 4,
};

const editPanelStyle: CSSProperties = {
  padding: "16px 20px 20px",
  borderTop: "1px solid rgba(255,255,255,.07)",
  background: "rgba(255,255,255,.015)",
};

const menuBtnSty: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  background: "#0d0d0d",
  color: "#fff",
  cursor: "pointer",
  textAlign: "left",
};

const lockedBoxStyle: CSSProperties = {
  padding: 18,
  borderRadius: 14,
  background: "#0d0d0d",
  border: "1px solid rgba(255,255,255,.08)",
  color: "#94a3b8",
};

const labelSty: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 900,
  color: "#64748b",
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

const fieldSty: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#111",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 14,
  padding: "13px 15px",
  color: "#fff",
  fontSize: 15,
  outline: "none",
  fontFamily: "inherit",
};

const errBoxSty: CSSProperties = {
  background: "rgba(239,68,68,.1)",
  border: "1px solid rgba(239,68,68,.32)",
  borderRadius: 12,
  padding: "10px 14px",
  color: "#fca5a5",
  fontSize: 13,
  fontWeight: 800,
};

const primaryBtnSty: CSSProperties = {
  width: "100%",
  padding: 13,
  border: "none",
  borderRadius: 14,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

const cancelBtnSty: CSSProperties = {
  width: "100%",
  padding: 13,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.1)",
  background: "transparent",
  color: "#94a3b8",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

const sectionCardStyle: CSSProperties = {
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
  padding: "18px 16px 20px",
  overflow: "hidden",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

const sectionSubStyle: CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700,
  marginTop: 3,
};

const favsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
};

const emptySlotStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  border: "2px dashed rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.025)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "border-color 0.15s, background 0.15s",
  width: "100%",
  height: "100%",
};

const filledSlotStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid rgba(255,255,255,.12)",
  cursor: "pointer",
};

const removeSlotBtnStyle: CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "rgba(0,0,0,.75)",
  border: "none",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const slotLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textAlign: "center",
  width: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const statsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  padding: "0 0",
};

const statCardStyle: CSSProperties = {
  padding: "18px 16px",
  borderRadius: 18,
  background: "#080808",
  border: "1px solid rgba(255,255,255,.1)",
};

const statValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 950,
};

const statLabelStyle: CSSProperties = {
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
};

const signOutBtnStyle: CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 18,
  background: "rgba(239,68,68,.07)",
  border: "1px solid rgba(239,68,68,.18)",
  color: "#f87171",
  fontWeight: 950,
  fontSize: 16,
  cursor: "pointer",
  letterSpacing: "-0.01em",
};

const friendRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 16px",
  borderRadius: 16,
  background: "#0d0d0d",
  border: "1px solid rgba(255,255,255,.07)",
  cursor: "pointer",
};

const acceptBtnSty: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: "#22c55e",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const dangerBtnSty: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  border: "1px solid rgba(239,68,68,.3)",
  background: "rgba(239,68,68,.08)",
  color: "#f87171",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const pickerOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(0,0,0,.75)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const pickerSheetStyle: CSSProperties = {
  width: "min(420px, 92vw)",
  maxHeight: "82dvh",
  background: "#131313",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,.1)",
  padding: "20px 20px 24px",
  overflowY: "auto",
  boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
};

const pickerTabsStyle: CSSProperties = {
  display: "flex",
  padding: 3,
  borderRadius: 999,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.08)",
  marginBottom: 16,
};

const pickerTabBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 999,
  border: "none",
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const teamPickItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "12px 8px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.07)",
  background: "rgba(255,255,255,.03)",
  cursor: "pointer",
};

const playerPickItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "rgba(255,255,255,.04)",
  color: "#fff",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  fontFamily: "inherit",
};

const previewOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
  background: "rgba(0,0,0,.96)",
  display: "flex",
  flexDirection: "column",
};

const previewHeaderStyle: CSSProperties = {
  height: 58,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 18px",
  background: "#050505",
  borderBottom: "1px solid rgba(255,255,255,.1)",
};

const previewIconBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "#0ea5e9",
  fontSize: 30,
  lineHeight: 1,
  cursor: "pointer",
};

const previewBodyStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 22,
  textAlign: "center",
};
