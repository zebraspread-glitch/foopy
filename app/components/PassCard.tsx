"use client";

import {
  getPassLevel,
  xpProgressLabel,
  PLAYER_PASS_LEVELS,
  TEAM_PASS_LEVELS,
  type PlayerPass,
  type TeamPass,
  type PassLevelInfo,
} from "@/app/lib/passes";
import { playerImgUrl } from "@/app/lib/playerImage";

// ── Helpers ───────────────────────────────────────────────────────────────────

export const PASS_TEAM_LOGOS: Record<string, string> = {
  "Adelaide Crows": "/team-logos/crows.png", "Brisbane Lions": "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  "Geelong Cats": "/team-logos/cats.png", "Gold Coast Suns": "/team-logos/suns.png",
  "GWS Giants": "/team-logos/giants.png", Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png", "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png", Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png", "Sydney Swans": "/team-logos/swans.png",
  "West Coast Eagles": "/team-logos/eagles.png", "Western Bulldogs": "/team-logos/bulldogs.png",
};

export const PASS_TEAM_COLORS: Record<string, string> = {
  "Adelaide Crows": "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1a1a1a", Essendon: "#ef4444", Fremantle: "#7c3aed",
  "Geelong Cats": "#1e3a8a", "Gold Coast Suns": "#ef4444", "GWS Giants": "#f97316",
  Hawthorn: "#78350f", Melbourne: "#1e40af", "North Melbourne": "#1e3a8a",
  "Port Adelaide": "#1e293b", Richmond: "#f59e0b", "St Kilda": "#dc2626",
  "Sydney Swans": "#dc2626", "West Coast Eagles": "#1d4ed8", "Western Bulldogs": "#1e40af",
};

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows",
  Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues", Collingwood: "magpies",
  Essendon: "bombers", Fremantle: "dockers",
  GWS: "giants", "GWS Giants": "giants",
  Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns",
  Hawthorn: "hawks", Melbourne: "demons",
  "North Melbourne": "kangaroos",
  "Port Adelaide": "power", Richmond: "tigers",
  "St Kilda": "saints",
  Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
};

export function playerPassImgSrc(playerName: string, teamName: string): string {
  return playerImgUrl(playerName, teamName);
}

const MYTHIC_TEXT = "#29276b";
const MYTHIC_MUTED = "rgba(41,39,107,0.62)";
const MYTHIC_ACCENT = "#5b5ff0";

function isMythicLevel(level: { name: string }) {
  return level.name === "Mythic";
}

function MythicShine({ zIndex = 2 }: { zIndex?: number }) {
  return <div className="mythic-pass-shine" style={{ zIndex }} />;
}

// ── Pass background patterns ─────────────────────────────────────────────────
// Patterns are bought once and re-colour themselves to match whatever level a
// pass is currently at — e.g. "Stripes" renders in bronze on a Bronze pass and
// in gold once it ranks up to Gold.

const PASS_PATTERNS: Record<string, (level: PassLevelInfo) => string> = {
  stripes: (level) =>
    `repeating-linear-gradient(135deg, transparent 0px, transparent 10px, ${level.color}26 10px, ${level.color}26 20px), ${level.gradient}`,
  dots: (level) =>
    `radial-gradient(circle, ${level.color}55 2px, transparent 2.5px) 0 0/16px 16px, ${level.gradient}`,
  camo: (level) =>
    `radial-gradient(circle at 15% 20%, ${level.color}40 0%, ${level.color}40 18%, transparent 19%), radial-gradient(circle at 60% 15%, ${level.darkColor}80 0%, ${level.darkColor}80 22%, transparent 23%), radial-gradient(circle at 85% 60%, ${level.color}33 0%, ${level.color}33 16%, transparent 17%), radial-gradient(circle at 35% 75%, ${level.darkColor}66 0%, ${level.darkColor}66 20%, transparent 21%), radial-gradient(circle at 75% 90%, ${level.color}3a 0%, ${level.color}3a 17%, transparent 18%), ${level.gradient}`,
  carbon: (level) =>
    `repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0px, rgba(255,255,255,.05) 6px, transparent 6px, transparent 12px), ${level.gradient}`,
  grid: (level) =>
    `repeating-linear-gradient(0deg, ${level.color}26 0px, ${level.color}26 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, ${level.color}26 0px, ${level.color}26 1px, transparent 1px, transparent 18px), ${level.gradient}`,
  waves: (level) =>
    `radial-gradient(circle at 50% 120%, transparent 36%, ${level.color}40 37%, ${level.color}40 41%, transparent 42%) 0 0/30px 15px, radial-gradient(ellipse 70% 50% at 80% 75%, ${level.darkColor}66, transparent 60%), ${level.gradient}`,
  checker: (level) =>
    `repeating-conic-gradient(${level.color}26 0% 25%, transparent 0% 50%) 0 0 / 24px 24px, ${level.gradient}`,
  rings: (level) =>
    `repeating-radial-gradient(circle, ${level.color}26 0px, ${level.color}26 2px, transparent 2px, transparent 14px), ${level.gradient}`,
  splatter: (level) =>
    `radial-gradient(circle at 15% 20%, ${level.color}40 0%, ${level.color}40 10%, transparent 11%), radial-gradient(circle at 70% 15%, ${level.color}33 0%, ${level.color}33 14%, transparent 15%), radial-gradient(circle at 40% 60%, ${level.color}3a 0%, ${level.color}3a 8%, transparent 9%), radial-gradient(circle at 85% 70%, ${level.color}26 0%, ${level.color}26 12%, transparent 13%), radial-gradient(circle at 25% 85%, ${level.color}33 0%, ${level.color}33 9%, transparent 10%), ${level.gradient}`,
  hex: (level) => {
    const size = "0 0/40px 70px";
    const a = `linear-gradient(30deg, ${level.color}26 12%, transparent 12.5%, transparent 87%, ${level.color}26 87.5%, ${level.color}26) ${size}`;
    const b = `linear-gradient(150deg, ${level.color}26 12%, transparent 12.5%, transparent 87%, ${level.color}26 87.5%, ${level.color}26) ${size}`;
    const c = `linear-gradient(60deg, ${level.color}1a 25%, transparent 25.5%, transparent 75%, ${level.color}1a 75%, ${level.color}1a) ${size}`;
    return `${a}, ${b}, ${a}, ${b}, ${c}, ${c}, ${level.gradient}`;
  },
  vstripes: (level) =>
    `repeating-linear-gradient(90deg, transparent 0px, transparent 8px, ${level.color}3a 8px, ${level.color}3a 16px), ${level.gradient}`,
  crosshatch: (level) =>
    `repeating-linear-gradient(45deg, ${level.color}33 0 8px, transparent 8px 16px), repeating-linear-gradient(-45deg, ${level.color}33 0 8px, transparent 8px 16px), ${level.gradient}`,
  diamond: (level) =>
    `repeating-linear-gradient(45deg, ${level.color}40 0 2px, transparent 2px 15px), repeating-linear-gradient(-45deg, ${level.color}40 0 2px, transparent 2px 15px), ${level.gradient}`,
  chevron: (level) =>
    `linear-gradient(135deg, ${level.color}40 25%, transparent 25%) -11px 0/22px 22px, linear-gradient(225deg, ${level.color}40 25%, transparent 25%) -11px 0/22px 22px, linear-gradient(315deg, ${level.color}40 25%, transparent 25%) 0 0/22px 22px, linear-gradient(45deg, ${level.color}40 25%, transparent 25%) 0 0/22px 22px, ${level.gradient}`,
  weave: (level) =>
    `linear-gradient(45deg, ${level.color}40 25%, transparent 25%, transparent 75%, ${level.color}40 75%) 0 0/22px 22px, linear-gradient(45deg, ${level.color}40 25%, transparent 25%, transparent 75%, ${level.color}40 75%) 11px 11px/22px 22px, ${level.gradient}`,
  confetti: (level) =>
    `radial-gradient(circle at 25% 25%, ${level.color}80 0 3.5px, transparent 4.5px) 0 0/26px 26px, radial-gradient(circle at 70% 55%, ${level.darkColor}99 0 3px, transparent 4px) 0 0/32px 32px, radial-gradient(circle at 45% 85%, ${level.color}66 0 2.5px, transparent 3.5px) 0 0/28px 28px, ${level.gradient}`,
  pyramids: (level) =>
    `linear-gradient(60deg, ${level.color}33 25%, transparent 25.5%) 0 0/22px 38px, linear-gradient(-60deg, ${level.color}33 25%, transparent 25.5%) 0 0/22px 38px, ${level.gradient}`,
};

/** Resolves an equipped pattern key (e.g. "dots") into a CSS background for the given pass level. Falls back to the level's own gradient when no pattern is equipped. */
export function patternBackground(pattern: string | null | undefined, level: PassLevelInfo): string {
  const fn = pattern ? PASS_PATTERNS[pattern] : undefined;
  return fn ? fn(level) : level.gradient;
}

// ── XP Bar ────────────────────────────────────────────────────────────────────

export function PassXpBar({ xp, levels }: { xp: number; levels: typeof PLAYER_PASS_LEVELS }) {
  const level = getPassLevel(xp, levels);
  const isMythic = isMythicLevel(level);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: isMythic ? MYTHIC_ACCENT : level.color, letterSpacing: "0.06em" }}>
          {level.name.toUpperCase()} · {level.multiplier}×
        </span>
        <span style={{ fontSize: 9, color: isMythic ? MYTHIC_MUTED : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
          {xpProgressLabel(level)}
        </span>
      </div>
      <div style={{ background: isMythic ? "rgba(91,95,240,0.16)" : "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
        <div style={{
          width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999,
          background: isMythic ? `linear-gradient(90deg,${level.darkColor},#22d3ee,#ffffff)` : `linear-gradient(90deg,${level.darkColor},${level.color})`,
          boxShadow: `0 0 6px ${level.color}80`,
        }} />
      </div>
    </div>
  );
}

// ── Player Pass Card ──────────────────────────────────────────────────────────

export function PlayerPassCard({ pass, pattern }: { pass: PlayerPass; pattern?: string | null }) {
  const level = getPassLevel(pass.xp ?? 0, PLAYER_PASS_LEVELS);
  const img   = playerPassImgSrc(pass.player_name, pass.team_name);
  const isMythic = isMythicLevel(level);
  return (
    <div style={{
      borderRadius: 16, overflow: "hidden", position: "relative",
      background: patternBackground(pattern, level),
      border: `1.5px solid ${isMythic ? "rgba(125,211,252,0.75)" : level.color + "55"}`,
      boxShadow: isMythic
        ? "0 4px 26px rgba(125,211,252,0.30), 0 0 18px rgba(167,139,250,0.22), 0 0 0 0.5px rgba(255,255,255,0.70)"
        : `0 4px 24px ${level.color}22, 0 0 0 0.5px rgba(255,255,255,0.06)`,
      aspectRatio: "3/4",
      display: "flex", flexDirection: "column",
    }}>
      {isMythic && <MythicShine />}
      {/* shimmer edge */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
      {/* level badge */}
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 4, background: isMythic ? "linear-gradient(135deg,rgba(255,255,255,0.82),rgba(125,211,252,0.34),rgba(167,139,250,0.36))" : level.color, color: isMythic ? MYTHIC_ACCENT : "#000", border: isMythic ? "1px solid rgba(125,211,252,0.55)" : "none", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>
        {level.name.toUpperCase()}
      </div>
      {/* serial number */}
      {pass.serial_number != null && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 4, fontSize: 8, fontWeight: 900, color: isMythic ? MYTHIC_TEXT : "#fff", letterSpacing: "0.06em" }}>
          #{pass.serial_number}
        </div>
      )}
      {/* photo */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: isMythic ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.2)" }}>
        {img
          ? <img src={img} alt={pass.player_name} suppressHydrationWarning
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
        }
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: isMythic ? "linear-gradient(to bottom, transparent, rgba(238,247,255,0.92))" : `linear-gradient(to bottom, transparent, ${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
      </div>
      {/* footer */}
      <div style={{ padding: "8px 10px 10px", background: isMythic ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.25)", flexShrink: 0, position: "relative", zIndex: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: isMythic ? MYTHIC_TEXT : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{pass.player_name}</div>
        </div>
        <div style={{ fontSize: 9.5, color: isMythic ? MYTHIC_MUTED : "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
        <PassXpBar xp={pass.xp ?? 0} levels={PLAYER_PASS_LEVELS} />
      </div>
    </div>
  );
}

// ── Team Pass Card ────────────────────────────────────────────────────────────

export function TeamPassCard({ pass, pattern }: { pass: TeamPass; pattern?: string | null }) {
  const level = getPassLevel(pass.xp ?? 0, TEAM_PASS_LEVELS);
  const color = PASS_TEAM_COLORS[pass.team_name] ?? "#6d28d9";
  const logo  = PASS_TEAM_LOGOS[pass.team_name]  ?? "/team-logos/default.png";
  const isMythic = isMythicLevel(level);
  return (
    <div style={{
      borderRadius: 20, overflow: "hidden", position: "relative",
      background: patternBackground(pattern, level),
      border: `1.5px solid ${isMythic ? "rgba(125,211,252,0.75)" : level.color + "55"}`,
      boxShadow: isMythic
        ? "0 6px 34px rgba(125,211,252,0.32), 0 0 20px rgba(167,139,250,0.24), 0 0 0 0.5px rgba(255,255,255,0.70)"
        : `0 6px 32px ${level.color}28, 0 0 0 0.5px rgba(255,255,255,0.06)`,
      aspectRatio: "3/4",
      display: "flex", flexDirection: "column",
    }}>
      {isMythic && <MythicShine />}
      {/* shimmer top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
      {/* level badge */}
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 4, background: isMythic ? "linear-gradient(135deg,rgba(255,255,255,0.82),rgba(125,211,252,0.34),rgba(167,139,250,0.36))" : level.color, color: isMythic ? MYTHIC_ACCENT : "#000", border: isMythic ? "1px solid rgba(125,211,252,0.55)" : "none", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999 }}>
        {level.name.toUpperCase()}
      </div>
      {/* serial number */}
      {pass.serial_number != null && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 4, fontSize: 8, fontWeight: 900, color: isMythic ? MYTHIC_TEXT : "#fff", letterSpacing: "0.06em" }}>
          #{pass.serial_number}
        </div>
      )}
      {/* logo area */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: "70%", height: "70%", borderRadius: "50%", background: `${color}40`, filter: "blur(32px)" }} />
        <div style={{ width: "68%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <img src={logo} alt={pass.team_name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: isMythic ? "linear-gradient(to bottom, transparent, rgba(238,247,255,0.92))" : `linear-gradient(to bottom, transparent, ${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
      </div>
      {/* footer */}
      <div style={{ padding: "10px 12px 14px", background: isMythic ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.25)", flexShrink: 0, position: "relative", zIndex: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: isMythic ? MYTHIC_TEXT : "#fff", letterSpacing: "-0.01em" }}>{pass.team_name}</div>
        </div>
        <div style={{ fontSize: 10, color: isMythic ? MYTHIC_ACCENT : level.color, fontWeight: 800, marginBottom: 8, letterSpacing: "0.04em" }}>TEAM PASS · 2026 SEASON</div>
        <PassXpBar xp={pass.xp ?? 0} levels={TEAM_PASS_LEVELS} />
      </div>
    </div>
  );
}
