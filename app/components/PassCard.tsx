"use client";

import {
  getPassLevel,
  PLAYER_PASS_LEVELS,
  TEAM_PASS_LEVELS,
  type PlayerPass,
  type TeamPass,
} from "@/app/lib/passes";

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
  const folder = TEAM_FOLDER[teamName] ?? teamName.toLowerCase().replace(/[^a-z]/g, "");
  const slug   = playerName.toLowerCase().replace(/[^a-z]/g, "");
  if (!folder || !slug) return "";
  return `/players/${folder}/${slug}.png`;
}

// ── XP Bar ────────────────────────────────────────────────────────────────────

export function PassXpBar({ xp, levels }: { xp: number; levels: typeof PLAYER_PASS_LEVELS }) {
  const level = getPassLevel(xp, levels);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.06em" }}>
          {level.name.toUpperCase()} · {level.multiplier}×
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
          {level.isMaxed ? "MAX" : `${level.xp}/${level.nextXp}`}
        </span>
      </div>
      <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 999, height: 4, overflow: "hidden" }}>
        <div style={{
          width: `${Math.round(level.progress * 100)}%`, height: "100%", borderRadius: 999,
          background: `linear-gradient(90deg,${level.darkColor},${level.color})`,
          boxShadow: `0 0 6px ${level.color}80`,
        }} />
      </div>
    </div>
  );
}

// ── Player Pass Card ──────────────────────────────────────────────────────────

export function PlayerPassCard({ pass }: { pass: PlayerPass }) {
  const level = getPassLevel(pass.xp ?? 0, PLAYER_PASS_LEVELS);
  const img   = playerPassImgSrc(pass.player_name, pass.team_name);
  return (
    <div style={{
      borderRadius: 16, overflow: "hidden", position: "relative",
      background: level.gradient,
      border: `1.5px solid ${level.color}55`,
      boxShadow: `0 4px 24px ${level.color}22, 0 0 0 0.5px rgba(255,255,255,0.06)`,
      aspectRatio: "3/4",
      display: "flex", flexDirection: "column",
    }}>
      {/* shimmer edge */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
      {/* level badge */}
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 4, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 999 }}>
        {level.name.toUpperCase()}
      </div>
      {/* year */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 4, fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>
        2026
      </div>
      {/* photo */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "rgba(0,0,0,0.2)" }}>
        {img
          ? <img src={img} alt={pass.player_name} suppressHydrationWarning
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>👤</div>
        }
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(to bottom, transparent, ${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
      </div>
      {/* footer */}
      <div style={{ padding: "8px 10px 10px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{pass.player_name}</div>
          {pass.serial_number != null && (
            <div style={{ fontSize: 9, fontWeight: 900, color: level.color, letterSpacing: "0.04em", flexShrink: 0, marginLeft: 5 }}>#{pass.serial_number}</div>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{pass.team_name}</div>
        <PassXpBar xp={pass.xp ?? 0} levels={PLAYER_PASS_LEVELS} />
      </div>
    </div>
  );
}

// ── Team Pass Card ────────────────────────────────────────────────────────────

export function TeamPassCard({ pass }: { pass: TeamPass }) {
  const level = getPassLevel(pass.xp ?? 0, TEAM_PASS_LEVELS);
  const color = PASS_TEAM_COLORS[pass.team_name] ?? "#6d28d9";
  const logo  = PASS_TEAM_LOGOS[pass.team_name]  ?? "/team-logos/default.png";
  return (
    <div style={{
      borderRadius: 20, overflow: "hidden", position: "relative",
      background: level.gradient,
      border: `1.5px solid ${level.color}55`,
      boxShadow: `0 6px 32px ${level.color}28, 0 0 0 0.5px rgba(255,255,255,0.06)`,
      aspectRatio: "3/4",
      display: "flex", flexDirection: "column",
    }}>
      {/* shimmer top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg,transparent,${level.color}cc,transparent)`, zIndex: 3 }} />
      {/* level badge */}
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 4, background: level.color, color: "#000", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 999 }}>
        {level.name.toUpperCase()}
      </div>
      {/* year */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 4, fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>
        2026
      </div>
      {/* logo area */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: "70%", height: "70%", borderRadius: "50%", background: `${color}40`, filter: "blur(32px)" }} />
        <div style={{ width: "68%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <img src={logo} alt={pass.team_name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: `linear-gradient(to bottom, transparent, ${level.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#1a0a00"})` }} />
      </div>
      {/* footer */}
      <div style={{ padding: "10px 12px 14px", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-0.01em" }}>{pass.team_name}</div>
          {pass.serial_number != null && (
            <div style={{ fontSize: 11, fontWeight: 900, color: level.color, letterSpacing: "0.04em" }}>#{pass.serial_number}</div>
          )}
        </div>
        <div style={{ fontSize: 10, color: level.color, fontWeight: 800, marginBottom: 8, letterSpacing: "0.04em" }}>TEAM PASS · 2026 SEASON</div>
        <PassXpBar xp={pass.xp ?? 0} levels={TEAM_PASS_LEVELS} />
      </div>
    </div>
  );
}
