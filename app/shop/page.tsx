"use client";

import { formatCoins } from "@/app/lib/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";
import { PlayerCard as SharedPlayerCard } from "@/app/components/PlayerCard";
import { PLAYER_IMG_BASE } from "@/app/lib/playerImage";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";
type PackType = "starter" | "general" | "mythical";

interface OpenedCard {
  player_id: string;
  player_name: string;
  team: string;
  team_logo: string;
  player_image: string;
  rarity: Rarity;
  rating: number;
  is_new: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_ORDER: Record<Rarity, number> = {
  bronze: 0, silver: 1, gold: 2, emerald: 3, sapphire: 4,
  ruby: 5, amethyst: 6, diamond: 7, pinkdiamond: 8, mythic: 9,
};

const RARITY_META: Record<Rarity, { label: string; color: string; glow: string; bg: string }> = {
  bronze:      { label: "Bronze",       color: "#cd7f32", glow: "rgba(205,127,50,0.55)",   bg: "rgba(205,127,50,0.12)" },
  silver:      { label: "Silver",       color: "#c0c0c0", glow: "rgba(192,192,192,0.55)",  bg: "rgba(192,192,192,0.10)" },
  gold:        { label: "Gold",         color: "#ffd700", glow: "rgba(255,215,0,0.55)",    bg: "rgba(255,215,0,0.12)" },
  emerald:     { label: "Emerald",      color: "#10b981", glow: "rgba(16,185,129,0.60)",   bg: "rgba(16,185,129,0.12)" },
  sapphire:    { label: "Sapphire",     color: "#3b82f6", glow: "rgba(59,130,246,0.60)",   bg: "rgba(59,130,246,0.12)" },
  ruby:        { label: "Ruby",         color: "#ef4444", glow: "rgba(239,68,68,0.60)",    bg: "rgba(239,68,68,0.12)" },
  amethyst:    { label: "Amethyst",     color: "#a78bfa", glow: "rgba(167,139,250,0.65)",  bg: "rgba(167,139,250,0.12)" },
  diamond:     { label: "Diamond",      color: "#67e8f9", glow: "rgba(103,232,249,0.65)",  bg: "rgba(103,232,249,0.12)" },
  pinkdiamond: { label: "Pink Diamond", color: "#f472b6", glow: "rgba(244,114,182,0.65)",  bg: "rgba(244,114,182,0.12)" },
  mythic:      { label: "Mythic",       color: "#c084fc", glow: "rgba(192,132,252,0.75)",  bg: "rgba(192,132,252,0.14)" },
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const TEAM_PLAYER_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows", Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues", "Carlton Blues": "blues", Collingwood: "magpies", "Collingwood Magpies": "magpies",
  Essendon: "bombers", "Essendon Bombers": "bombers", Fremantle: "dockers", "Fremantle Dockers": "dockers",
  Geelong: "cats", "Geelong Cats": "cats", "Gold Coast": "suns", "Gold Coast Suns": "suns",
  GWS: "giants", "GWS Giants": "giants", "Greater Western Sydney": "giants",
  Hawthorn: "hawks", "Hawthorn Hawks": "hawks", Melbourne: "demons", "Melbourne Demons": "demons",
  "North Melbourne": "kangaroos", "North Melbourne Kangaroos": "kangaroos",
  "Port Adelaide": "power", "Port Adelaide Power": "power", Richmond: "tigers", "Richmond Tigers": "tigers",
  "St Kilda": "saints", "St Kilda Saints": "saints", Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles", "Western Bulldogs": "bulldogs", Bulldogs: "bulldogs",
};

const CARD_IMAGE_ALIASES: Record<string, string[]> = {
  archiemay: ["archermay"], bodieryan: ["brodieryan"], bradleyclose: ["bradclose"],
  chrisscerri: ["christopherscerri"], connornash: ["conornash"], danielbutler: ["danbutler"],
  josephfonti: ["joefonti"], joshdraper: ["joshuadraper"], joshuagibcus: ["joshgibcus"],
  joshuakelly: ["joshkelly"], kaylegerreyn: ["kaylegerryn"], lennoxhoffman: ["lennoxhofmann"],
  leolombard: ["leonardolombard"], matthewroberts: ["mattyroberts"], mitchellewis: ["mitchlewis"],
  mitchitoowens: ["mitchowens"], nickdriscoll: ["nicholasdriscoll"], nikolascox: ["nikcox"],
  noahrobertsthomson: ["noahrobertsthompson"], olliedempsey: ["oliverdempsey"],
  olliegreeves: ["olivergreeves"], roberthansenjr: ["roberthansen"], thomassims: ["tomsims"],
  willgreen: ["williamgreen"], zacharywilliams: ["zacwilliams"],
};

const PACKS: { type: PackType; label: string; cost: number; cards: string; image: string; accent: string; description: string }[] = [
  { type: "starter",  label: "Starter Pack",  cost: 100,  cards: "3 cards", image: "/packs/starter.png",  accent: "#cd7f32", description: "Up to Emerald rarity" },
  { type: "general",  label: "General Pack",  cost: 200,  cards: "7 cards", image: "/packs/general.png",  accent: "#ffd700", description: "Up to Mythic rarity" },
  { type: "mythical", label: "Mythical Pack", cost: 3000, cards: "4 cards", image: "/packs/mythical.png", accent: "#c084fc", description: "3 cards + 1 guaranteed Mythic" },
];

const RARITY_ODDS: Record<PackType, { rarity: Rarity; pct: string }[]> = {
  starter: [
    { rarity: "bronze", pct: "55%" }, { rarity: "silver", pct: "30%" },
    { rarity: "gold", pct: "12%" },   { rarity: "emerald", pct: "3%" },
  ],
  general: [
    { rarity: "bronze", pct: "50%" },       { rarity: "silver", pct: "24%" },
    { rarity: "gold", pct: "12%" },         { rarity: "emerald", pct: "6%" },
    { rarity: "sapphire", pct: "3.5%" },    { rarity: "ruby", pct: "2%" },
    { rarity: "amethyst", pct: "1%" },      { rarity: "diamond", pct: "0.35%" },
    { rarity: "pinkdiamond", pct: "0.1%" }, { rarity: "mythic", pct: "0.05%" },
  ],
  mythical: [
    { rarity: "bronze", pct: "18%" },   { rarity: "silver", pct: "22%" },
    { rarity: "gold", pct: "20%" },     { rarity: "emerald", pct: "15%" },
    { rarity: "sapphire", pct: "10%" }, { rarity: "ruby", pct: "7%" },
    { rarity: "amethyst", pct: "4%" },  { rarity: "diamond", pct: "2%" },
    { rarity: "pinkdiamond", pct: "1%" }, { rarity: "mythic", pct: "100% (1 guaranteed)" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePlayerId(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPlayerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#f59e0b" />
      <circle cx="10" cy="10" r="7" fill="#fbbf24" />
      <text x="10" y="14" textAnchor="middle" fontSize="9" fontWeight="900" fill="#92400e">C</text>
    </svg>
  );
}

function Spinner() {
  return <div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

function CardPlayerImage({ card, imageStyle }: { card: Pick<OpenedCard, "player_id" | "player_name" | "team" | "player_image">; imageStyle?: CSSProperties }) {
  const folder = TEAM_PLAYER_FOLDER[card.team] ?? normalizePlayerId(card.team);
  const pid = normalizePlayerId(card.player_id);
  const nid = normalizePlayerId(card.player_name);
  const candidates = useMemo(() => {
    const urls: string[] = [];
    const add = (u?: string) => { if (u && !urls.includes(u)) urls.push(u); };
    add(card.player_image);
    add(`${PLAYER_IMG_BASE}/${folder}/${pid}.png`);
    add(`${PLAYER_IMG_BASE}/${folder}/${nid}.png`);
    CARD_IMAGE_ALIASES[pid]?.forEach(a => add(`${PLAYER_IMG_BASE}/${folder}/${a}.png`));
    return urls;
  }, [card.player_id, card.player_name, card.team, card.player_image]);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [candidates.join("|")]);
  const src = candidates[idx];

  if (!src) return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-1)", fontSize: 18, fontWeight: 900 }}>{getPlayerInitials(card.player_name)}</div>;
  return <img key={src} src={src} alt={card.player_name} loading="eager" onError={() => setIdx(i => i + 1)} style={imageStyle} />;
}

// ── Rarity Reveal Overlay (for high rarities) ────────────────────────────────

function RarityRevealOverlay({ rarity, meta, duration }: { rarity: Rarity; meta: { color: string; glow: string }; duration: number }) {
  const order = RARITY_ORDER[rarity];
  const label = `✦ ${RARITY_META[rarity].label.toUpperCase()} ✦`;

  if (order === 4) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}25 0%, transparent 60%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${duration * 0.82}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}66`, animation: `revealRing ${duration}ms 110ms ease-out forwards` }} />
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".24em", color: meta.color, textShadow: `0 0 14px ${meta.color}` }}>{label}</div>
        </div>
      </div>
    );
  }

  if (order === 5) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}38 0%, transparent 65%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `2px solid ${meta.color}`, animation: `revealRing ${duration * 0.65}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1.5px solid ${meta.color}88`, animation: `revealRing ${duration * 0.85}ms 70ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "40%", aspectRatio: "1", borderRadius: "50%", border: `1px solid ${meta.color}55`, animation: `revealRing ${duration}ms 140ms ease-out forwards` }} />
        <div style={{ position: "absolute", bottom: "12%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".26em", color: meta.color, textShadow: `0 0 18px ${meta.color}, 0 0 36px ${meta.color}66` }}>{label}</div>
        </div>
      </div>
    );
  }

  if (order >= 6 && order <= 8) {
    const numRays = order >= 8 ? 16 : 12;
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}50 0%, transparent 65%)`, animation: `revealFlash ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", width: "70%", aspectRatio: "1" }}>
          {Array.from({ length: numRays }).map((_, i) => (
            <div key={i} style={{ position: "absolute", top: "50%", left: "50%", width: "2px", height: "50%", transformOrigin: "0 0", transform: `rotate(${(i / numRays) * 360}deg)`, background: `linear-gradient(to bottom, ${meta.color}cc, transparent)`, animation: `revealRays ${duration}ms ease-out forwards` }} />
          ))}
        </div>
        {[0.32, 0.46, 0.62].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: `${s * 100}%`, aspectRatio: "1", borderRadius: "50%", border: `${1.5 - i * 0.4}px solid ${meta.color}${i === 0 ? "" : "88"}`, animation: `revealRing ${duration * (0.6 + i * 0.18)}ms ${i * 90}ms ease-out forwards` }} />
        ))}
        <div style={{ position: "absolute", bottom: "10%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".28em", color: meta.color, textShadow: `0 0 24px ${meta.color}, 0 0 48px ${meta.color}88` }}>{label}</div>
        </div>
      </div>
    );
  }

  if (order === 9) {
    return (
      <div style={{ position: "absolute", inset: -60, zIndex: 30, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${meta.color}65 0%, transparent 70%)`, animation: `mythicPulse ${duration}ms ease-out forwards` }} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 10%, ${meta.color}40 0%, transparent 50%)`, animation: `revealScreenEdge ${duration}ms ease-out forwards` }} />
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", width: 5, height: 5, borderRadius: "50%", background: meta.color, left: `${Math.random() * 80 + 10}%`, top: `${Math.random() * 80 + 10}%`, animation: `revealParticle ${duration * (0.5 + Math.random() * 0.5)}ms ${Math.random() * 200}ms ease-out forwards`, boxShadow: `0 0 8px ${meta.color}` }} />
        ))}
        {[0.28, 0.44, 0.62, 0.8].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: `${s * 100}%`, aspectRatio: "1", borderRadius: "50%", border: `${2 - i * 0.4}px solid ${meta.color}${i === 0 ? "" : "99"}`, animation: `revealRing ${duration * (0.5 + i * 0.16)}ms ${i * 80}ms ease-out forwards` }} />
        ))}
        <div style={{ position: "absolute", bottom: "10%", left: "50%", whiteSpace: "nowrap", animation: `revealText ${duration}ms ease-out forwards` }}>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: ".32em", color: meta.color, textShadow: `0 0 32px ${meta.color}, 0 0 64px ${meta.color}88, 0 0 96px ${meta.color}44` }}>{label}</div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Pack Open Modal ───────────────────────────────────────────────────────────

function PackOpenModal({ cards: rawCards, onClose }: { cards: OpenedCard[]; onClose: () => void }) {
  const cards = useMemo(
    () => [...rawCards].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]),
    [rawCards],
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const current = cards[index];
  const meta = current ? RARITY_META[current.rarity] : null;
  const RARITY_REVEAL_DURATIONS: Partial<Record<Rarity, number>> = {
    sapphire: 800, ruby: 1050, amethyst: 1200, diamond: 1450, pinkdiamond: 1650, mythic: 1950,
  };
  const hasRevealAnim = current ? RARITY_ORDER[current.rarity] >= RARITY_ORDER["sapphire"] : false;
  const REVEAL_DURATION = (current && RARITY_REVEAL_DURATIONS[current.rarity]) ?? 1000;

  const flip = () => {
    if (revealing) return;
    if (!flipped) {
      if (hasRevealAnim) {
        setRevealing(true);
        setTimeout(() => { setRevealing(false); setFlipped(true); }, REVEAL_DURATION);
      } else {
        setFlipped(true);
      }
      return;
    }
    setFlipped(false);
    if (index < cards.length - 1) {
      setTimeout(() => setIndex(i => i + 1), 180);
    } else {
      setDone(true);
    }
  };

  const skipAll = () => { setRevealing(false); setDone(true); };

  const overlayStyle: CSSProperties = {
    position: "fixed", inset: 0, zIndex: 100,
    background: "rgba(0,0,0,.86)", backdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  if (done) {
    return (
      <div style={{ ...overlayStyle, padding: "20px 16px" }}>
        <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 24, padding: "20px 16px 16px", width: "100%", maxWidth: 480, animation: "slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)" }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.38)", marginBottom: 4 }}>PACK OPENED</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "var(--text-1)" }}>{cards.length} Card{cards.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`, gap: 6, marginBottom: 14 }}>
            {cards.map((card, i) => (
              <div key={i} style={{ position: "relative" }}>
                <SharedPlayerCard card={{
                  playerId: card.player_id, playerName: card.player_name,
                  playerFolder: TEAM_PLAYER_FOLDER[card.team] ?? card.team.toLowerCase().replace(/[^a-z]/g, ""),
                  playerTeam: card.team, playerTeamLogo: card.team_logo,
                  rarity: card.rarity, rating: card.rating,
                }} />
                {card.is_new && (
                  <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "2px 7px", fontSize: 7, fontWeight: 900, color: "#fff", letterSpacing: ".1em", boxShadow: "0 2px 8px rgba(34,197,94,.5)", whiteSpace: "nowrap", zIndex: 10 }}>✦ NEW</div>
                )}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ display: "block", width: "100%", padding: "13px", borderRadius: 14, border: "none", background: "var(--border-3)", color: "var(--text-1)", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
            Add to Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 340, padding: "0 20px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          {cards.map((_, i) => (
            <div key={i} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 99, background: i < index ? "rgba(255,255,255,.5)" : i === index ? "#fff" : "var(--border-3)", transition: "all 0.25s ease" }} />
          ))}
        </div>
        <div style={{ position: "relative", width: "100%", maxWidth: 260, marginBottom: 28 }}>
          {revealing && current && meta && (
            <RarityRevealOverlay rarity={current.rarity} meta={meta} duration={REVEAL_DURATION} />
          )}
          <div onClick={flip} style={{ width: "100%", aspectRatio: "3/4.2", cursor: revealing ? "default" : "pointer", perspective: 800 }}>
            <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)", transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1)" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", backfaceVisibility: "hidden", boxShadow: flipped && meta ? `0 0 0 2px ${meta.color}88, 0 16px 48px ${meta.glow}, 0 0 80px ${meta.glow}44` : "none" }}>
                {current && meta && (
                  <>
                    <img src={`/cards/${current.rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />
                    <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>{current.rating}</div>
                    {current.is_new && (
                      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: ".12em", boxShadow: "0 2px 12px rgba(34,197,94,.55)", whiteSpace: "nowrap", zIndex: 5 }}>✦ NEW</div>
                    )}
                    <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[current.team] ?? "#1e2438") + "33" }}>
                      <CardPlayerImage card={current} imageStyle={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                    </div>
                    <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
                      <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 12px ${meta.glow}` }}>{current.player_name}</div>
                    </div>
                    <div className="ac-logo" style={{ background: "rgba(0,0,0,.55)", border: "1.5px solid var(--border-3)" }}>
                      <img src={current.team_logo} alt={current.team} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>2025</div>
                  </>
                )}
              </div>
              <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", boxShadow: "0 0 0 1.5px var(--border-2), 0 12px 40px rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>🃏</div>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.28)" }}>TAP TO REVEAL</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button onClick={flip} disabled={revealing} style={{ width: "100%", padding: "15px", borderRadius: 16, border: "none", background: flipped ? "var(--border-3)" : "var(--border-2)", color: "var(--text-1)", fontWeight: 900, fontSize: 15, cursor: revealing ? "default" : "pointer", marginBottom: 10, backdropFilter: "blur(12px)", transition: "background 0.15s ease", opacity: revealing ? 0.4 : 1 }}>
          {revealing ? "…" : !flipped ? "Reveal Card" : index < cards.length - 1 ? `Next Card  ·  ${cards.length - index - 1} left` : "View All"}
        </button>
        <button onClick={skipAll} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}>
          Skip to end
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ShopPage() {
  const [user, setUser] = useState<User | null>(null);
  const [coins, setCoins] = useState(0);
  const [opening, setOpening] = useState<PackType | null>(null);
  const [openedCards, setOpenedCards] = useState<OpenedCard[] | null>(null);
  const [expandedPack, setExpandedPack] = useState<PackType | null>(null);

  const fetchBalance = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles").select("coins").eq("id", uid).single();
    setCoins(data?.coins ?? 0);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchBalance(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchBalance(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, [fetchBalance]);

  async function handleOpenPack(packType: PackType) {
    if (opening) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setOpening(packType);
    try {
      const res = await fetch("/api/cards/open-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ packType }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to open pack"); return; }
      setCoins(data.newCoins);
      setOpenedCards(data.cards as OpenedCard[]);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-14px) scale(1.025); }
        }
        @keyframes floatGlow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes revealRing    { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(3.5); opacity: 0; } }
        @keyframes revealFlash   { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes revealText    { 0% { opacity: 0; transform: translateX(-50%) scale(0.7); } 30% { opacity: 1; transform: translateX(-50%) scale(1.08); } 65% { opacity: 1; transform: translateX(-50%) scale(1); } 100% { opacity: 0; transform: translateX(-50%) scale(0.95); } }
        @keyframes revealRays    { 0% { opacity: 0; transform: scale(0.5) rotate(0deg); } 20% { opacity: 0.6; } 100% { opacity: 0; transform: scale(2.2) rotate(30deg); } }
        @keyframes revealParticle{ 0% { opacity: 0; transform: scale(0) translateY(0); } 15% { opacity: 1; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.4) translateY(-50px); } }
        @keyframes revealScreenEdge { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes mythicPulse   { 0%,100% { opacity: 0; } 15% { opacity: 0.55; } 45% { opacity: 0.3; } 75% { opacity: 0.45; } }
        @keyframes panelIn       { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .shop-scroll {
          display: flex;
          overflow-x: auto;
          overflow-y: visible;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          padding: 32px 40px 40px;
          gap: 24px;
          align-items: flex-start;
          flex: 1;
        }
        .shop-scroll::-webkit-scrollbar { display: none; }

        .pack-item {
          scroll-snap-align: center;
          flex-shrink: 0;
          width: min(300px, 76vw);
          display: flex;
          flex-direction: column;
        }

        .pack-img-wrap {
          position: relative;
          border-radius: 22px;
          overflow: visible;
          aspect-ratio: 3/4;
          cursor: pointer;
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }
        .pack-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 22px;
          display: block;
        }
        .pack-img-wrap:active { transform: scale(0.97) !important; }

        .pack-float {
          animation: float 4s ease-in-out infinite;
        }

        .pack-detail {
          animation: panelIn 0.22s ease;
          margin-top: 14px;
          border-radius: 20px;
          padding: 18px 16px 16px;
          border: 1px solid var(--border-2);
          background: var(--surface-2);
        }

        .pack-open-btn {
          width: 100%;
          border: none;
          border-radius: 12px;
          padding: 13px 0;
          font-weight: 900;
          font-size: 15px;
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .pack-open-btn:active:not(:disabled) { transform: scale(0.97); opacity: 0.85; }
        .pack-open-btn:disabled { cursor: not-allowed; }

        .tap-hint {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,.65);
          backdrop-filter: blur(8px);
          border-radius: 99px;
          padding: 5px 14px;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,.85);
          white-space: nowrap;
          pointer-events: none;
          transition: opacity 0.2s;
        }
      `}</style>

      {/* Coin balance */}
      {user && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", borderRadius: 99, padding: "7px 16px", border: "1px solid var(--border-2)" }}>
            <CoinIcon size={16} />
            <span style={{ fontWeight: 900, fontSize: 15, color: "#fbbf24" }}>{formatCoins(coins)}</span>
          </div>
        </div>
      )}

      {/* Title */}
      <div style={{ textAlign: "center", padding: user ? "18px 20px 0" : "32px 20px 0", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.35)", marginBottom: 6 }}>FOOPY CARDS</div>
        <div style={{ fontSize: 26, fontWeight: 1000, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Pack Shop</div>
      </div>

      {/* Scrollable pack carousel */}
      <div className="shop-scroll">
        {PACKS.map((pack, i) => {
          const isMiddle = i === 1;
          const isExpanded = expandedPack === pack.type;
          const canAfford = user ? coins >= pack.cost : false;
          const isOpening = opening === pack.type;

          return (
            <div key={pack.type} className="pack-item" style={{ position: "relative" }}>
              {/* Glow shadow under floating pack */}
              {isMiddle && (
                <div style={{
                  position: "absolute",
                  bottom: -18,
                  left: "10%",
                  width: "80%",
                  height: 30,
                  borderRadius: "50%",
                  background: `radial-gradient(ellipse, ${pack.accent}66 0%, transparent 70%)`,
                  filter: "blur(8px)",
                  animation: "floatGlow 4s ease-in-out infinite",
                  pointerEvents: "none",
                  zIndex: 0,
                }} />
              )}

              {/* Pack image */}
              <div
                className={`pack-img-wrap${isMiddle ? " pack-float" : ""}`}
                style={{ boxShadow: isExpanded ? `0 0 0 2px ${pack.accent}88, 0 20px 60px rgba(0,0,0,.55), 0 0 40px ${pack.accent}33` : `0 20px 60px rgba(0,0,0,.5)` }}
                onClick={() => setExpandedPack(isExpanded ? null : pack.type)}
              >
                <img src={pack.image} alt={pack.label} />
                {!isExpanded && <div className="tap-hint">Tap to view</div>}
              </div>

              {/* Expandable detail panel */}
              {isExpanded && (
                <div className="pack-detail" style={{ borderColor: `${pack.accent}44` }}>
                  <div style={{ fontWeight: 900, fontSize: 17, color: "var(--text-1)", marginBottom: 2 }}>{pack.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginBottom: 14 }}>{pack.description} · {pack.cards}</div>

                  {/* Price */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <CoinIcon size={18} />
                    <span style={{ fontWeight: 900, fontSize: 22, color: canAfford ? "#fbbf24" : "#475569" }}>{pack.cost.toLocaleString()}</span>
                    {user && !canAfford && <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Not enough coins</span>}
                  </div>

                  {/* Odds */}
                  <div style={{ background: "rgba(0,0,0,.35)", borderRadius: 12, padding: "10px 12px", border: "1px solid var(--border-1)", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: "rgba(255,255,255,.35)", marginBottom: 7 }}>ODDS</div>
                    {RARITY_ODDS[pack.type].map(({ rarity, pct }) => (
                      <div key={rarity} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: RARITY_META[rarity].color }}>{RARITY_META[rarity].label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{pct}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  {user ? (
                    <button
                      className="pack-open-btn"
                      onClick={() => handleOpenPack(pack.type)}
                      disabled={!canAfford || !!opening}
                      style={{
                        background: canAfford ? pack.accent : "var(--border-1)",
                        color: canAfford ? "#14141e" : "var(--text-4)",
                        opacity: canAfford && !opening ? 1 : 0.45,
                        boxShadow: canAfford ? `0 4px 20px ${pack.accent}55` : "none",
                      }}
                    >
                      {isOpening ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Spinner /> Opening…</span> : "Open Pack"}
                    </button>
                  ) : (
                    <a href="/login" style={{ display: "block", textAlign: "center", borderRadius: 12, padding: "13px 0", fontWeight: 900, fontSize: 15, background: pack.accent, color: "#14141e", textDecoration: "none", boxShadow: `0 4px 20px ${pack.accent}55` }}>
                      Log in to open
                    </a>
                  )}

                  {/* Purchase terms */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textAlign: "center", marginTop: 10 }}>
                    All purchases are non-refundable.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pack open result modal */}
      {openedCards && (
        <PackOpenModal
          cards={openedCards}
          onClose={() => setOpenedCards(null)}
        />
      )}
    </main>
  );
}
