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
import AuraBadge from "@/app/components/AuraBadge";
import { supabase } from "@/app/lib/supabase";
import { createNotification } from "@/app/lib/notifications";
import playersRaw from "@/app/data/players.json";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";
import { PlayerCard } from "@/app/components/PlayerCard";
import { PlayerPassCard, TeamPassCard } from "@/app/components/PassCard";
import { type PlayerPass, type TeamPass, PLAYER_PASS_LEVELS, TEAM_PASS_LEVELS, getPassLevel } from "@/app/lib/passes";

/* ─────────────────── Types ─────────────────── */
type FeaturedCardSlot = { player_id: string; rarity: string };
type FeaturedPassSlot = { type: "player" | "team"; id: string };

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
  featured_passes: FeaturedPassSlot[] | null;
  coins: number | null;
  matches_viewed: number | null;
  total_likes: number | null;
  aura: number | null;
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
  { name: "Carlton", logo: "/team-logos/blues.png", color: "#031a35" },
  { name: "Collingwood", logo: "/team-logos/magpies.png", color: "#1e1e28" },
  { name: "Essendon", logo: "/team-logos/bombers.png", color: "#cc0000" },
  { name: "Fremantle", logo: "/team-logos/dockers.png", color: "#4b1979" },
  { name: "Geelong Cats", logo: "/team-logos/cats.png", color: "#003b73" },
  { name: "Gold Coast", logo: "/team-logos/suns.png", color: "#c0392b" },
  { name: "GWS Giants", logo: "/team-logos/giants.png", color: "#e05a1a" },
  { name: "GWS",        logo: "/team-logos/giants.png", color: "#e05a1a" },
  { name: "Hawthorn", logo: "/team-logos/hawks.png", color: "#6b3a1f" },
  { name: "Melbourne", logo: "/team-logos/demons.png", color: "#c8102e" },
  { name: "North Melbourne", logo: "/team-logos/kangaroos.png", color: "#0055a4" },
  { name: "Port Adelaide", logo: "/team-logos/power.png", color: "#008999" },
  { name: "Richmond", logo: "/team-logos/tigers.png", color: "#facc15" },
  { name: "St Kilda", logo: "/team-logos/saints.png", color: "#c8102e" },
  { name: "Sydney", logo: "/team-logos/swans.png", color: "#c0392b" },
  { name: "West Coast", logo: "/team-logos/eagles.png", color: "#003087" },
  { name: "Western Bulldogs", logo: "/team-logos/bulldogs.png", color: "#1a4abf" },
];

/* ─────────────────── Rarity meta ─────────────────── */
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

/* ─────────────────── Featured Cards Carousel ─────────────────── */
function teamShortName(team: string) {
  const map: Record<string, string> = {
    "Western Bulldogs": "Bulldogs", "Brisbane Lions": "Lions",
    "North Melbourne": "North", "Port Adelaide": "Port",
    "Gold Coast": "Suns", "West Coast": "Eagles",
    "St Kilda": "Saints", "GWS": "GWS",
  };
  return map[team] ?? team;
}

function FeaturedCardsCarousel({ cards }: {
  cards: Array<{ fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0]; rating?: number }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function update() {
      const center = el!.scrollLeft + el!.clientWidth / 2;
      const children = Array.from(el!.children) as HTMLElement[];
      let closest = 0;
      let minDist = Infinity;
      children.forEach((child, i) => {
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(center - childCenter);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      setActiveIdx(closest);
    }

    // Convert vertical wheel scroll into horizontal scroll on desktop
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already horizontal
      e.preventDefault();
      el!.scrollBy({ left: e.deltaY * 1.5, behavior: "auto" });
    }

    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    update();
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
    };
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
      {cards.map(({ fc, player, rating }, idx) => {
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
                rating,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────── Featured Passes Carousel ───────────────────────────── */
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
      let closest = 0;
      let minDist = Infinity;
      children.forEach((child, i) => {
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(center - childCenter);
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
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
    };
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
      {passes.map(({ slot, pass, passType }, idx) => {
        const isActive = idx === activeIdx;
        const level = getPassLevel(pass.xp ?? 0, passType === "player" ? PLAYER_PASS_LEVELS : TEAM_PASS_LEVELS);
        return (
          <div
            key={slot.id}
            style={{
              flexShrink: 0,
              width: CARD_W,
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

/* ─────────────────── Player helpers ─────────────────── */
type RawPlayer = { name?: string; team?: string };
const PLAYERS = (playersRaw as RawPlayer[]).filter((p) => p.name);
const playerTeamBySlug = new Map<string, string>();
for (const p of PLAYERS) {
  if (p.name && p.team) playerTeamBySlug.set(slugName(p.name), p.team);
}

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", adelaidecrows: "crows", crows: "crows",
  brisbane: "lions", brisbanelions: "lions", lions: "lions",
  carlton: "blues", carltonblues: "blues", blues: "blues",
  collingwood: "magpies", collingwoodmagpies: "magpies", magpies: "magpies",
  essendon: "bombers", essendonbombers: "bombers", bombers: "bombers",
  fremantle: "dockers", fremantledockers: "dockers", dockers: "dockers",
  geelong: "cats", geelongcats: "cats", cats: "cats",
  goldcoast: "suns", goldcoastsuns: "suns", suns: "suns",
  gws: "giants", gwsgiants: "giants", greaterwesternsydney: "giants", greaterwesternsydneygiants: "giants", giants: "giants",
  hawthorn: "hawks", hawthornhawks: "hawks", hawks: "hawks",
  melbourne: "demons", melbournedemons: "demons", demons: "demons",
  northmelbourne: "kangaroos", northmelbournekangaroos: "kangaroos", kangaroos: "kangaroos",
  portadelaide: "power", portadelaidepower: "power", power: "power",
  richmond: "tigers", richmondtigers: "tigers", tigers: "tigers",
  stkilda: "saints", stkildasaints: "saints", saints: "saints",
  sydney: "swans", sydneyswans: "swans", swans: "swans",
  westcoast: "eagles", westcoasteagles: "eagles", eagles: "eagles",
  westernbulldogs: "bulldogs", bulldogs: "bulldogs",
};

function slugName(name: string) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerImagePath(name: string, team?: string) {
  const resolvedTeam = team || playerTeamBySlug.get(slugName(name)) || "";
  const folder = CLUB_FOLDER[slugName(resolvedTeam)] ?? slugName(resolvedTeam);
  return folder ? `/players/${folder}/${slugName(name)}.png` : "";
}

function teamColor(teamName: string) {
  const aliases: Record<string, string> = {
    Brisbane: "Brisbane Lions",
    Geelong: "Geelong Cats",
    "Greater Western Sydney": "GWS",
    "Greater Western Sydney Giants": "GWS",
    "GWS Giants": "GWS",
  };
  const resolved = aliases[teamName] ?? teamName;
  return TEAMS.find((t) => t.name === resolved)?.color ?? "#1a1a2e";
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
              background: "var(--surface-3)",
              border: "none",
              color: "var(--text-2)",
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
                background: tab === t ? "var(--text-1)" : "transparent",
                color: tab === t ? "var(--bg)" : "var(--text-3)",
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
                  border: "1px solid var(--border-2)",
                  background: "var(--surface-1)",
                  color: "var(--text-1)",
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
                      color: "var(--text-1)",
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(p.name!)}
                  </div>
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>{p.team}</div>
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
              <span style={{ fontSize: 16, fontWeight: 950, color: "var(--text-1)" }}>{getInitials(slot.label)}</span>
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);

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

  // ── Featured card picker ──
  const [showFeaturedPicker, setShowFeaturedPicker] = useState(false);
  const [pickerCards, setPickerCards] = useState<{ player_id: string; rarity: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [pickerSearch, setPickerSearch] = useState("");

  function openFeaturedPicker() {
    if (!user) return;
    setShowFeaturedPicker(true);
    setPickerSearch("");
  }

  // ── Featured passes picker ──
  const [showPassesPicker, setShowPassesPicker]       = useState(false);
  const [pickerPlayerPasses, setPickerPlayerPasses]   = useState<PlayerPass[]>([]);
  const [pickerTeamPasses, setPickerTeamPasses]       = useState<TeamPass[]>([]);
  const [passesPickerLoading, setPassesPickerLoading] = useState(true);
  const [passesPickerSearch, setPassesPickerSearch]   = useState("");

  function openPassesPicker() {
    if (!user) return;
    setShowPassesPicker(true);
    setPassesPickerSearch("");
  }

  async function toggleFeaturedPass(type: "player" | "team", id: string) {
    if (!user || !profile) return;
    const current = profile.featured_passes ?? [];
    const isFeatured = current.some(f => f.id === id);
    let newFeatured: FeaturedPassSlot[];
    if (isFeatured) {
      newFeatured = current.filter(f => f.id !== id);
    } else {
      if (current.length >= 10) return;
      newFeatured = [...current, { type, id }];
    }
    setProfile(prev => prev ? { ...prev, featured_passes: newFeatured } : prev);
    const token = accessTokenRef.current;
    if (!token) return;
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featured_passes: newFeatured }),
    });
    if (!res.ok) {
      console.error("Failed to save featured passes:", await res.text());
      setProfile(prev => prev ? { ...prev, featured_passes: current } : prev);
    }
  }

  async function toggleFeaturedCard(playerId: string, rarity: string) {
    if (!user || !profile) return;
    const current = profile.featured_cards ?? [];
    const isFeatured = current.some(f => f.player_id === playerId && f.rarity === rarity);
    let newFeatured: FeaturedCardSlot[];
    if (isFeatured) {
      newFeatured = current.filter(f => !(f.player_id === playerId && f.rarity === rarity));
    } else {
      if (current.length >= 15) return;
      newFeatured = [...current, { player_id: playerId, rarity }];
    }
    // Optimistic update
    setProfile(prev => prev ? { ...prev, featured_cards: newFeatured } : prev);
    // Save via API route (service role — bypasses RLS)
    const token = accessTokenRef.current;
    if (!token) {
      console.error("No access token available — cannot save featured cards");
      setProfile(prev => prev ? { ...prev, featured_cards: current } : prev);
      return;
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featured_cards: newFeatured }),
    });
    if (!res.ok) {
      console.error("Failed to save featured cards:", await res.text());
      // Revert on failure
      setProfile(prev => prev ? { ...prev, featured_cards: current } : prev);
    }
  }

  // ── Stats section ──
  type StatsPopup = null | "games" | "likes" | "polls";
  const [statsPopup, setStatsPopup] = useState<StatsPopup>(null);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [featuredCardRatings, setFeaturedCardRatings] = useState<Map<string, number>>(new Map());
  const [totalLikes, setTotalLikes] = useState<number | null>(null);

  type TeamStat = { name: string; logo: string; count: number };
  type LikeEntry = { id: string; username: string | null; avatar_url: string | null; total: number };
  type PollTeamStat = { name: string; logo: string; wins: number; losses: number };

  const [gamesData, setGamesData] = useState<TeamStat[]>([]);
  const [gamesDataLoading, setGamesDataLoading] = useState(false);
  const [likesData, setLikesData] = useState<LikeEntry[]>([]);
  const [likesDataLoading, setLikesDataLoading] = useState(false);
  const [likesOffset, setLikesOffset] = useState(0);
  const [likesHasMore, setLikesHasMore] = useState(true);
  const [myLikesRank, setMyLikesRank] = useState<{ rank: number; total: number } | null>(null);
  const likesSentinelRef = useRef<HTMLDivElement>(null);
  const likesLoadingRef = useRef(false);
  const [pollsData, setPollsData] = useState<PollTeamStat[]>([]);
  const [pollsDataLoading, setPollsDataLoading] = useState(false);

  useEffect(() => {
    // Safety net: never hang on the loading screen longer than 8 seconds
    const fallback = setTimeout(() => setLoading(false), 8000);

    // onAuthStateChange is the single source of truth.
    // INITIAL_SESSION always fires once on mount with the restored session (or null),
    // so it's more reliable than getSession() which can return null mid-refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      // Always keep the latest access token cached for API calls
      if (session?.access_token) accessTokenRef.current = session.access_token;

      if (event === "INITIAL_SESSION") {
        setUser(u);
        if (u) {
          const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
          await applyPending(u.id, data as Profile | null);
          loadFriends(u.id);
          // Award daily login Aura (deduped per calendar day)
          if (session?.access_token) {
            const today = new Date().toISOString().split("T")[0];
            fetch("/api/aura/award", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ event_type: "daily_login", related_id: today }),
            }).catch(() => {});
          }
        }
        clearTimeout(fallback);
        setLoading(false);
        return;
      }

      if (event === "SIGNED_IN") {
        setUser(u);
        if (u) {
          const { data } = await supabase.from("profiles").select("*").eq("id", u.id).single();
          await applyPending(u.id, data as Profile | null);
          loadFriends(u.id);
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        return;
      }

      // TOKEN_REFRESHED / USER_UPDATED — just keep user token current, no profile re-fetch
      if (u) setUser(u);
    });

    return () => { clearTimeout(fallback); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!user) return;
    // Card count (for stats row)
    supabase
      .from("user_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setCardCount(count ?? 0));
    // Prefetch picker cards so the modal opens instantly
    setPickerLoading(true);
    supabase
      .from("user_cards")
      .select("player_id, rarity")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setPickerCards(data ?? []);
        setPickerLoading(false);
      });
    // Prefetch passes for the passes picker
    setPassesPickerLoading(true);
    Promise.all([
      supabase.from("user_player_passes").select("*").eq("user_id", user.id),
      supabase.from("user_team_passes").select("*").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: true }),
    ]).then(([playerRes, teamRes]) => {
      setPickerPlayerPasses((playerRes.data ?? []) as PlayerPass[]);
      setPickerTeamPasses((teamRes.data ?? []) as TeamPass[]);
      setPassesPickerLoading(false);
    });
  }, [user]);

  // Fetch ratings for featured cards so the carousel can show them
  useEffect(() => {
    const slots = profile?.featured_cards;
    if (!user || !slots?.length) { setFeaturedCardRatings(new Map()); return; }
    const playerIds = [...new Set(slots.map(fc => fc.player_id))];
    supabase
      .from("user_cards")
      .select("player_id, rarity, rating")
      .eq("user_id", user.id)
      .in("player_id", playerIds)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const card of data ?? []) {
          // Key by player_id::rarity — pick highest rating if duplicates
          const key = `${card.player_id}::${card.rarity}`;
          const existing = map.get(key);
          if (existing === undefined || card.rating > existing) {
            map.set(key, card.rating);
          }
        }
        setFeaturedCardRatings(map);
      });
  }, [user, profile?.featured_cards]);

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

  function getTeamLogo(name: string) {
    const t = TEAMS.find((t) => t.name === name || t.name.includes(name) || name.includes(t.name.split(" ")[0]));
    return t?.logo ?? "/team-logos/crows.png";
  }

  async function openGamesPopup() {
    setStatsPopup("games");
    if (gamesData.length > 0) return;
    setGamesDataLoading(true);
    try {
      const res = await fetch("/api/games", { cache: "no-store" });
      const raw = await res.json();
      const all: { id: number; hteam?: string; ateam?: string }[] = Array.isArray(raw) ? raw : (raw.games ?? []);
      const matchIds: string[] = [];
      const counts: Record<string, TeamStat> = {};
      for (const mid of matchIds) {
        const game = all.find((g) => String(g.id) === String(mid));
        if (!game) continue;
        for (const teamName of [game.hteam, game.ateam].filter(Boolean) as string[]) {
          if (!counts[teamName]) counts[teamName] = { name: teamName, logo: getTeamLogo(teamName), count: 0 };
          counts[teamName].count++;
        }
      }
      setGamesData(Object.values(counts).sort((a, b) => b.count - a.count));
    } catch {}
    setGamesDataLoading(false);
  }

  const PAGE_SIZE = 40;

  async function fetchLikesPage(offset: number, append: boolean) {
    if (likesLoadingRef.current) return;
    likesLoadingRef.current = true;
    setLikesDataLoading(true);
    try {
      const { data: rows, error } = await supabase.rpc("get_likes_leaderboard", { p_limit: PAGE_SIZE, p_offset: offset });
      if (error) throw error;
      const entries: LikeEntry[] = (rows ?? []).map((r: any) => ({
        id: String(r.user_id),
        username: r.username ?? null,
        avatar_url: r.avatar_url ?? null,
        total: Number(r.total_likes),
      }));
      setLikesData((prev) => append ? [...prev, ...entries] : entries);
      setLikesOffset(offset + entries.length);
      setLikesHasMore(entries.length === PAGE_SIZE);
    } catch (e: any) { console.error("likes leaderboard error:", e?.message ?? e); }
    likesLoadingRef.current = false;
    setLikesDataLoading(false);
  }

  useEffect(() => {
    if (statsPopup !== "likes" || !likesSentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && likesHasMore && !likesLoadingRef.current) {
        fetchLikesPage(likesOffset, true);
      }
    }, { threshold: 0.1 });
    observer.observe(likesSentinelRef.current);
    return () => observer.disconnect();
  }, [statsPopup, likesOffset, likesHasMore]);

  async function openLikesPopup() {
    setStatsPopup("likes");
    supabase.rpc("get_my_likes_rank").then(({ data }) => {
      const row = (data ?? [])[0];
      if (row) setMyLikesRank({ rank: Number(row.rank), total: Number(row.total_likes) });
    });
    if (likesData.length > 0) return;
    setLikesOffset(0);
    setLikesHasMore(true);
    fetchLikesPage(0, false);
  }

  async function openPollsPopup() {
    setStatsPopup("polls");
    if (pollsData.length > 0) return;
    setPollsDataLoading(true);
    try {
      const res = await fetch("/api/games", { cache: "no-store" });
      const raw = await res.json();
      const all: { id: number; hteam?: string; ateam?: string; hscore?: number; ascore?: number; complete?: number; is_final?: number }[] = Array.isArray(raw) ? raw : (raw.games ?? []);
      const picks: Record<string, "home" | "away"> = {};
      try { Object.assign(picks, JSON.parse(localStorage.getItem("foopy_picks") ?? "{}")); } catch {}
      const correctIds = new Set<string>();
      const teamStats: Record<string, PollTeamStat> = {};
      for (const [gidStr, side] of Object.entries(picks)) {
        const game = all.find((g) => String(g.id) === String(gidStr));
        if (!game) continue;
        const isDone = (game.complete ?? 0) >= 100 || game.is_final === 1;
        if (!isDone) continue;
        const hs = game.hscore ?? 0, as = game.ascore ?? 0;
        const winner: "home" | "away" | "draw" = hs > as ? "home" : as > hs ? "away" : "draw";
        if (winner === "draw") continue;
        const pickedTeam = side === "home" ? (game.hteam ?? "") : (game.ateam ?? "");
        if (!pickedTeam) continue;
        if (!teamStats[pickedTeam]) teamStats[pickedTeam] = { name: pickedTeam, logo: getTeamLogo(pickedTeam), wins: 0, losses: 0 };
        if (correctIds.has(String(gidStr))) teamStats[pickedTeam].wins++;
        else teamStats[pickedTeam].losses++;
      }
      setPollsData(Object.values(teamStats).sort((a, b) => b.wins - a.wins || a.losses - b.losses));
    } catch {}
    setPollsDataLoading(false);
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80dvh", gap: 20, padding: "0 28px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#5865f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>

          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--text-1)" }}>Your Profile</h2>
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: 14, fontWeight: 500, lineHeight: 1.6, maxWidth: 260 }}>
              Sign in to track your cards, passes, and connect with other fans.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
            <button onClick={() => router.push("/login")}
              style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#5865f2", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Sign In
            </button>
            <button onClick={() => router.push("/login?mode=signup")}
              style={{ width: "100%", padding: "14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Create Account
            </button>
          </div>
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
          <div style={profile?.banner_url ? { height: bannerStyle.height, backgroundImage: `url(${profile.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : bannerStyle} />

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
                <img src={profile.avatar_url} alt="Profile" style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--bg)", boxShadow: "0 0 0 2px var(--border-3)" }} />
              ) : (
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(135deg,${avBg},var(--surface-1))`, color: avFg, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, border: "3px solid var(--bg)", boxShadow: `0 0 0 2px var(--border-3),0 0 30px ${avFg}44` }}>
                  {label[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Username + pills */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                @{username || "—"}
              </h1>

              {/* Stats row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                {/* Aura */}
                <a href="/aura-leaderboard?tab=history" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 900, background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>✦ {(profile?.aura ?? 0).toLocaleString()}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Aura</span>
                </a>
                {/* Coins */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <img src="/coin/coin.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{(profile?.coins ?? 0).toLocaleString()}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Coins</span>
                </div>
                {/* Friends */}
                <button onClick={openFriends} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Users size={18} color="var(--text-1)" strokeWidth={2.5} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{friends.length}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Friends</span>
                </button>
              </div>
            </div>
          </div>

          {avatarErr && <div style={{ ...errBoxSty, margin: "0 16px 12px" }}>{avatarErr}</div>}
          {bannerErr && <div style={{ ...errBoxSty, margin: "0 16px 12px" }}>{bannerErr}</div>}

          {/* Bio section */}
          <div style={{ margin: "0 14px", padding: "14px 16px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
            <p style={{ margin: 0, color: profile?.bio ? "#cbd5e1" : "#475569", fontSize: 14, fontWeight: 600, lineHeight: 1.6, fontStyle: profile?.bio ? "normal" : "italic" }}>
              {profile?.bio || "No bio yet."}
            </p>
          </div>

          {/* Edit button */}
          <div style={{ padding: "12px 14px 16px" }}>
            <button onClick={() => setEditSection("menu")} style={editBtnStyle}>Edit</button>
          </div>

        </div>

        {/* ── Favourites ── */}
        <div style={sectionCardStyle}>
          <div style={{ marginBottom: 16, fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
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
          const featuredSlots = (profile?.featured_cards ?? []).slice(0, 15);
          const featuredWithData = featuredSlots
            .map(fc => ({
              fc,
              player: CARD_PLAYERS.find(p => p.id === fc.player_id),
              rating: featuredCardRatings.get(`${fc.player_id}::${fc.rarity}`),
            }))
            .filter((x): x is { fc: FeaturedCardSlot; player: typeof CARD_PLAYERS[0]; rating: number | undefined } => !!x.player);
          const hasFeatured = featuredWithData.length > 0;

          return (
            <div style={{ ...sectionCardStyle, padding: "16px 0 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", marginBottom: 0 }}>
                <button
                  onClick={openFeaturedPicker}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontSize: 12, fontWeight: 800, color: "var(--text-3)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  featured cards
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button
                  onClick={openFeaturedPicker}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}
                >
                  {hasFeatured ? `${featuredWithData.length}/15 · Edit` : "Add Cards"}
                </button>
              </div>
              {hasFeatured ? (
                <FeaturedCardsCarousel cards={featuredWithData} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "28px 0 20px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-4)" }}>No featured cards yet</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1e293b", marginTop: 4 }}>Tap "featured cards" to pick some</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Featured Passes ── */}
        {(() => {
          const featuredPassSlots = profile?.featured_passes ?? [];
          const featuredPasses = featuredPassSlots
            .map(slot => {
              if (slot.type === "team") {
                const pass = pickerTeamPasses.find(p => p.id === slot.id) ?? null;
                return pass ? { slot, pass: pass as TeamPass | PlayerPass, passType: "team" as const } : null;
              } else {
                const pass = pickerPlayerPasses.find(p => p.id === slot.id);
                return pass ? { slot, pass: pass as TeamPass | PlayerPass, passType: "player" as const } : null;
              }
            })
            .filter((x): x is { slot: FeaturedPassSlot; pass: TeamPass | PlayerPass; passType: "player" | "team" } => x !== null);

          const hasPasses = featuredPasses.length > 0;
          return (
            <div style={{ ...sectionCardStyle, padding: "16px 0 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", marginBottom: 0 }}>
                <button
                  onClick={openPassesPicker}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}
                >
                  featured passes
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onClick={openPassesPicker} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>
                  {hasPasses ? `${featuredPasses.length}/10 · Edit` : "Add Passes"}
                </button>
              </div>
              {hasPasses ? (
                <FeaturedPassesCarousel passes={featuredPasses} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "28px 0 20px" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-4)" }}>No featured passes yet</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1e293b", marginTop: 4 }}>Tap "featured passes" to pick some</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Stats row ── */}
        <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, display: "flex" }}>
          {(
            [
              { label: "Games",     value: profile?.matches_viewed ?? 0,           color: "var(--text-1)",  onClick: openGamesPopup },
              { label: "Likes",     value: profile?.total_likes ?? totalLikes ?? "—", color: "var(--text-1)",  onClick: openLikesPopup },
              { label: "Polls Won", value: 0,                                       color: "#22c55e",  onClick: openPollsPopup },
              { label: "Cards",     value: cardCount ?? "—",                        color: "#c084fc",  onClick: () => router.push("/album") },
            ] as const
          ).map((s, i, arr) => (
            <button
              key={s.label}
              onClick={s.onClick}
              style={{
                flex: 1,
                padding: "16px 8px",
                background: "none",
                border: "none",
                borderRight: i < arr.length - 1 ? "1px solid var(--border-2)" : "none",
                cursor: "pointer",
                color: "var(--text-1)",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em", color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
            </button>
          ))}
        </div>

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
                background: "var(--surface-1)",
                border: "1px solid var(--border-3)",
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
                  border: "1px solid var(--border-3)",
                  background: "var(--surface-3)",
                  color: "var(--text-2)",
                  fontWeight: 900,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <RotateCcw size={15} />
                Reset
              </button>
            </div>

            <div style={{ marginTop: 16, color: "var(--text-3)", fontSize: 13, fontWeight: 800 }}>
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
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 201, width: "calc(100% - 32px)", maxWidth: 420, background: "var(--surface-1)", borderRadius: 24, border: "1px solid var(--border-2)", padding: "24px 20px", maxHeight: "80dvh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>

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
                    <p style={{ margin: "8px 0 14px", color: "var(--text-3)", fontSize: 14 }}>
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
                  <div style={{ textAlign: "right" as const, color: "var(--text-3)", fontSize: 11, marginTop: -6 }}>{eBio.length}/160</div>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 110, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-2)",
              background: "var(--bg)",
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
              <span style={{ background: "#ef4444", color: "var(--text-1)", borderRadius: 999, fontSize: 11, fontWeight: 900, padding: "2px 8px" }}>
                {requests.length}
              </span>
            )}
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid var(--border-2)", background: "var(--bg)" }}>
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
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>Loading…</div>
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
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>Loading…</div>
              ) : requests.length === 0 ? (
                <EmptyState icon="📬" text="No pending friend requests." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {requests.map((r) => (
                    <div key={r.friendship_id} style={friendRowStyle}>
                      <Avatar name={r.username || "?"} url={r.avatar_url} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>@{r.username}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>wants to be your friend</div>
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
                  style={{ ...fieldSty, background: "var(--surface-1)" }}
                  autoFocus
                />

                {searching && <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)" }}>Searching…</div>}

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

      {/* ── Stats popups ── */}
      {statsPopup !== null && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
            onClick={() => setStatsPopup(null)}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 301, background: "var(--bg)", borderRadius: 24, border: "1px solid var(--border-2)", width: "calc(100% - 32px)", maxWidth: 480, maxHeight: "80dvh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em" }}>
                {statsPopup === "games" && "Live Games Viewed"}
                {statsPopup === "likes" && "Likes Leaderboard"}
                {statsPopup === "polls" && "Polls Won by Team"}
              </div>
              <button onClick={() => setStatsPopup(null)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>

              {/* Games popup */}
              {statsPopup === "games" && (
                gamesDataLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
                ) : gamesData.length === 0 ? (
                  <EmptyState icon="📺" text="No live games viewed yet. Tune in to a live match!" />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {gamesData.map((t) => (
                      <div key={t.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 8px", borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                        <img src={t.logo} alt={t.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
                        <div style={{ fontSize: 22, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.04em" }}>{t.count}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textAlign: "center", lineHeight: 1.3 }}>{t.name}</div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Likes popup */}
              {statsPopup === "likes" && (
                <>
                  {myLikesRank && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", marginBottom: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
                      <Avatar name={profile?.username || "?"} url={profile?.avatar_url} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                        You are <strong style={{ color: "var(--text-1)" }}>#{myLikesRank.rank.toLocaleString()}</strong> with <strong style={{ color: "var(--text-1)" }}>{myLikesRank.total.toLocaleString()}</strong> likes
                      </span>
                    </div>
                  )}
                  {likesDataLoading && likesData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
                ) : likesData.length === 0 ? (
                  <EmptyState icon="❤️" text="No comment likes yet." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {likesData.map((entry, i) => {
                      const isMe = entry.id === user?.id;
                      return (
                        <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: isMe ? "rgba(59,130,246,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${isMe ? "rgba(59,130,246,.2)" : "var(--border-1)"}` }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? ["#ffd700","#c0c0c0","#cd7f32"][i] : "#334155", width: 22, textAlign: "center" }}>
                            {i + 1}
                          </div>
                          <Avatar name={entry.username || "?"} url={entry.avatar_url} size={36} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: isMe ? "#60a5fa" : "#f8fafc" }}>
                              @{entry.username ?? "unknown"}{isMe ? " (you)" : ""}
                            </div>
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 950, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
                            {entry.total.toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={likesSentinelRef} style={{ height: 1 }} />
                    {likesDataLoading && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid var(--border-3)", borderTopColor: "#60a5fa", animation: "spin 0.7s linear infinite" }} />
                      </div>
                    )}
                  </div>
                )}
                </>
              )}

              {/* Polls popup */}
              {statsPopup === "polls" && (
                pollsDataLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading…</div>
                ) : pollsData.length === 0 ? (
                  <EmptyState icon="📊" text="No completed picks yet. Head to a match and pick a winner!" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pollsData.map((t) => (
                      <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
                        <img src={t.logo} alt={t.name} style={{ width: 40, height: 40, objectFit: "contain" }} />
                        <div style={{ flex: 1, fontWeight: 800, fontSize: 14, color: "var(--text-1)" }}>{t.name}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: "#22c55e" }}>{t.wins}W</span>
                          <span style={{ fontSize: 12, color: "var(--text-4)" }}>–</span>
                          <span style={{ fontSize: 14, fontWeight: 900, color: "#ef4444" }}>{t.losses}L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Featured Card Picker Modal ── */}
      {showFeaturedPicker && (() => {
        const currentFeatured = profile?.featured_cards ?? [];
        const query = pickerSearch.toLowerCase();
        const RARITY_ORDER = ["pinkdiamond","mythic","diamond","amethyst","ruby","sapphire","emerald","gold","silver","bronze"];
        const filtered = pickerCards
          .map(pc => ({ pc, player: CARD_PLAYERS.find(p => p.id === pc.player_id) }))
          .filter((x): x is { pc: typeof pickerCards[0]; player: typeof CARD_PLAYERS[0] } => !!x.player)
          .filter(({ player }) =>
            !query ||
            player.name.toLowerCase().includes(query) ||
            player.team.toLowerCase().includes(query)
          );
        // Selected cards first, then by rarity
        filtered.sort((a, b) => {
          const aFeat = currentFeatured.some(f => f.player_id === a.pc.player_id && f.rarity === a.pc.rarity) ? 0 : 1;
          const bFeat = currentFeatured.some(f => f.player_id === b.pc.player_id && f.rarity === b.pc.rarity) ? 0 : 1;
          if (aFeat !== bFeat) return aFeat - bFeat;
          const ai = RARITY_ORDER.indexOf(a.pc.rarity);
          const bi = RARITY_ORDER.indexOf(b.pc.rarity);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        return createPortal(
          <>
            {/* Backdrop */}
            <div
              onClick={() => setShowFeaturedPicker(false)}
              style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            />
            {/* Sheet */}
            <div style={{
              position: "fixed", left: "50%", top: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 201,
              width: "min(520px, 96vw)", maxHeight: "82dvh",
              background: "var(--surface-1)",
              border: "1px solid var(--border-2)",
              borderRadius: 22,
              display: "flex", flexDirection: "column",
              boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 18px 12px",
                borderBottom: "1px solid var(--border-1)", flexShrink: 0,
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Featured Cards</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, fontWeight: 600 }}>
                    {currentFeatured.length}/15 selected
                  </div>
                </div>
                <button
                  onClick={() => setShowFeaturedPicker(false)}
                  style={{ background: "var(--surface-3)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)", flexShrink: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Search */}
              <div style={{ padding: "10px 14px 8px", flexShrink: 0, borderBottom: "1px solid var(--border-1)" }}>
                <div style={{ position: "relative" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Search by player or team…"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "var(--surface-3)", border: "1px solid var(--border-2)",
                      borderRadius: 10, padding: "8px 10px 8px 30px",
                      color: "var(--text-1)", fontSize: 13, fontWeight: 500,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Card grid */}
              <div style={{ overflowY: "auto", flex: 1, padding: "12px 10px 16px" }}>
                {pickerLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>Loading your cards…</div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>
                    {pickerCards.length === 0 ? "You have no cards yet" : "No cards match your search"}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {filtered.map(({ pc, player }) => {
                      const isFeat = currentFeatured.some(f => f.player_id === pc.player_id && f.rarity === pc.rarity);
                      const meta = RARITY_META[pc.rarity] ?? RARITY_META.bronze;
                      const canAdd = isFeat || currentFeatured.length < 15;
                      return (
                        <div
                          key={`${pc.player_id}-${pc.rarity}`}
                          onClick={() => canAdd && toggleFeaturedCard(pc.player_id, pc.rarity)}
                          style={{
                            position: "relative",
                            cursor: canAdd ? "pointer" : "not-allowed",
                            opacity: !canAdd ? 0.4 : 1,
                            borderRadius: 11,
                            outline: isFeat ? `3px solid ${meta.color}` : "3px solid transparent",
                            outlineOffset: 2,
                            transition: "outline-color 0.15s, opacity 0.15s",
                          }}
                        >
                          <PlayerCard
                            card={{
                              playerId: player.id,
                              playerName: player.name,
                              playerFolder: player.folder,
                              playerTeam: player.team,
                              playerTeamLogo: player.teamLogo,
                              rarity: pc.rarity,
                            }}
                          />
                          {/* Selected checkmark overlay */}
                          {isFeat && (
                            <div style={{
                              position: "absolute", top: 7, right: 7,
                              width: 20, height: 20, borderRadius: "50%",
                              background: meta.color, zIndex: 10,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              boxShadow: `0 0 8px ${meta.glow}`,
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ borderTop: "1px solid var(--border-1)", padding: "12px 18px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowFeaturedPicker(false)}
                  style={{ background: "#3b82f6", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          </>,
          document.body
        );
      })()}

      {/* ── Featured Passes Picker Modal ── */}
      {showPassesPicker && (() => {
        const currentFeatured = profile?.featured_passes ?? [];
        const query = passesPickerSearch.toLowerCase();
        const allPasses: { type: "player" | "team"; pass: PlayerPass | TeamPass }[] = [
          ...pickerTeamPasses.map(p => ({ type: "team" as const, pass: p as TeamPass | PlayerPass })),
          ...pickerPlayerPasses.map(p => ({ type: "player" as const, pass: p as TeamPass | PlayerPass })),
        ].filter(({ pass }) => {
          if (!query) return true;
          const name = (pass as PlayerPass).player_name ?? (pass as TeamPass).team_name ?? "";
          const team = (pass as PlayerPass).team_name ?? "";
          return name.toLowerCase().includes(query) || team.toLowerCase().includes(query);
        });
        // Featured first
        allPasses.sort((a, b) => {
          const aFeat = currentFeatured.some(f => f.id === a.pass.id) ? 0 : 1;
          const bFeat = currentFeatured.some(f => f.id === b.pass.id) ? 0 : 1;
          if (aFeat !== bFeat) return aFeat - bFeat;
          // team passes first
          if (a.type !== b.type) return a.type === "team" ? -1 : 1;
          // then by xp desc
          return (b.pass.xp ?? 0) - (a.pass.xp ?? 0);
        });

        return createPortal(
          <>
            <div onClick={() => setShowPassesPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} />
            <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 201, width: "min(520px, 96vw)", maxHeight: "82dvh", background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 22, display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Featured Passes</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, fontWeight: 600 }}>{currentFeatured.length}/10 selected</div>
                </div>
                <button onClick={() => setShowPassesPicker(false)} style={{ background: "var(--surface-3)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Search */}
              <div style={{ padding: "10px 14px 8px", flexShrink: 0, borderBottom: "1px solid var(--border-1)" }}>
                <div style={{ position: "relative" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={passesPickerSearch} onChange={e => setPassesPickerSearch(e.target.value)} placeholder="Search by player or team…" style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "8px 10px 8px 30px", color: "var(--text-1)", fontSize: 13, fontWeight: 500, outline: "none" }} />
                </div>
              </div>
              {/* Grid */}
              <div style={{ overflowY: "auto", flex: 1, padding: "12px 10px 16px" }}>
                {passesPickerLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>Loading your passes…</div>
                ) : allPasses.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 13 }}>
                    {(pickerPlayerPasses.length + pickerTeamPasses.length) === 0 ? "You have no passes yet" : "No passes match your search"}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {allPasses.map(({ type, pass }) => {
                      const isFeat = currentFeatured.some(f => f.id === pass.id);
                      const canAdd = isFeat || currentFeatured.length < 10;
                      const levelColor = getPassLevel(pass.xp ?? 0, type === "player" ? PLAYER_PASS_LEVELS : TEAM_PASS_LEVELS).color;
                      return (
                        <div
                          key={pass.id}
                          onClick={() => canAdd && toggleFeaturedPass(type, pass.id)}
                          style={{ position: "relative", cursor: canAdd ? "pointer" : "not-allowed", opacity: !canAdd ? 0.4 : 1, borderRadius: 11, outline: isFeat ? `3px solid ${levelColor}` : "3px solid transparent", outlineOffset: 2, transition: "outline-color 0.15s" }}
                        >
                          {type === "player"
                            ? <PlayerPassCard pass={pass as PlayerPass} />
                            : <TeamPassCard   pass={pass as TeamPass} />
                          }
                          {isFeat && (
                            <div style={{ position: "absolute", top: 7, right: 7, width: 20, height: 20, borderRadius: "50%", background: levelColor, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 8px ${levelColor}88` }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{ borderTop: "1px solid var(--border-1)", padding: "12px 18px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setShowPassesPicker(false)} style={{ background: "#3b82f6", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            </div>
          </>,
          document.body
        );
      })()}
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
      <div style={{ color: "var(--text-3)", fontSize: 14, fontWeight: 700 }}>{text}</div>
    </div>
  );
}

/* ═══════════════════ Styles ═══════════════════ */
const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
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
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
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
  background: "var(--surface-2)",
  border: "1px solid var(--border-1)",
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
  color: "var(--text-2)",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.55,
};

const editBtnStyle: CSSProperties = {
  padding: "9px 16px",
  borderRadius: 999,
  border: "1px solid var(--border-3)",
  background: "var(--surface-3)",
  color: "var(--text-1)",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
  alignSelf: "flex-end",
  marginBottom: 4,
};

const editPanelStyle: CSSProperties = {
  padding: "16px 20px 20px",
  borderTop: "1px solid var(--border-1)",
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
  border: "1px solid var(--border-2)",
  background: "var(--surface-1)",
  color: "var(--text-1)",
  cursor: "pointer",
  textAlign: "left",
};

const lockedBoxStyle: CSSProperties = {
  padding: 18,
  borderRadius: 14,
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  color: "var(--text-2)",
};

const labelSty: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 900,
  color: "var(--text-3)",
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

const fieldSty: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  borderRadius: 14,
  padding: "13px 15px",
  color: "var(--text-1)",
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
  color: "var(--text-1)",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

const cancelBtnSty: CSSProperties = {
  width: "100%",
  padding: 13,
  borderRadius: 14,
  border: "1px solid var(--border-2)",
  background: "transparent",
  color: "var(--text-2)",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

const sectionCardStyle: CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
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
  color: "var(--text-3)",
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
  border: "2px dashed var(--border-3)",
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
  border: "2px solid var(--border-3)",
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
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const slotLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "var(--text-3)",
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
};

const statCardStyle: CSSProperties = {
  padding: "18px 16px",
  borderRadius: 18,
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
};

const statCardClickStyle: CSSProperties = {
  padding: "18px 16px",
  borderRadius: 18,
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  cursor: "pointer",
  textAlign: "left",
  color: "var(--text-1)",
  fontFamily: "inherit",
  transition: "border-color 0.15s, background 0.15s",
};

const statValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 950,
};

const statLabelStyle: CSSProperties = {
  marginTop: 3,
  color: "var(--text-2)",
  fontSize: 12,
  fontWeight: 800,
};


const friendRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 16px",
  borderRadius: 16,
  background: "var(--surface-1)",
  border: "1px solid var(--border-1)",
  cursor: "pointer",
};

const acceptBtnSty: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: "#22c55e",
  color: "var(--text-1)",
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
  background: "var(--surface-1)",
  borderRadius: 20,
  border: "1px solid var(--border-2)",
  padding: "20px 20px 24px",
  overflowY: "auto",
  boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
};

const pickerTabsStyle: CSSProperties = {
  display: "flex",
  padding: 3,
  borderRadius: 999,
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
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
  border: "1px solid var(--border-1)",
  background: "var(--surface-2)",
  cursor: "pointer",
};

const playerPickItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "var(--surface-2)",
  color: "var(--text-1)",
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
  background: "var(--bg)",
  borderBottom: "1px solid var(--border-2)",
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
