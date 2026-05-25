"use client";

/**
 * Shared card component — the single source of truth for how every
 * player card looks across the app (album, pack opening, trades, featured).
 */

import type { CSSProperties } from "react";

export type PlayerCardData = {
  playerId: string;
  playerName: string;
  playerFolder: string;
  playerTeam: string;
  playerTeamLogo: string;
  rarity: string;
  rating?: number;
  duplicateCount?: number;
  year?: string | number;
};

export const RARITY_META: Record<string, { color: string; glow: string }> = {
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

export const TEAM_BG_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

export function PlayerCard({
  card,
  locked = false,
  featured = false,
  style,
  onClick,
}: {
  card: PlayerCardData;
  locked?: boolean;
  featured?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const meta = RARITY_META[card.rarity] ?? RARITY_META.bronze;
  const dupeCount = card.duplicateCount ?? 1;
  const logoOffset = "clamp(4px, 4.75%, 7px)";
  const logoSize = "clamp(16px, 17.5%, 26px)";

  return (
    <div
      style={{ position: "relative", aspectRatio: "3/4.2", cursor: onClick ? "pointer" : "default", ...style }}
      onClick={onClick}
    >
      <div style={{
        position: "absolute", inset: 0, borderRadius: 9, overflow: "hidden",
        boxShadow: locked
          ? "0 0 0 1px var(--border-1)"
          : `0 0 0 1.5px ${meta.color}99, 0 6px 20px ${meta.glow}`,
        filter: locked ? "grayscale(1) brightness(0.18)" : "none",
        transition: "box-shadow 0.2s ease",
      }}>
        {/* Card art */}
        <img
          src={locked ? "/cards/bronze.png" : `/cards/${card.rarity}.png`}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />

        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 75%, rgba(0,0,0,.88) 100%)" }} />

        {!locked ? (
          <>
            {/* Rating — top right */}
            {card.rating !== undefined && (
              <div className="ac-rating" style={{ background: "rgba(0,0,0,.82)", fontWeight: 1000, color: meta.color, border: `1px solid ${meta.color}44` }}>
                {card.rating}
              </div>
            )}

            {/* Duplicate count — top center */}
            {dupeCount > 1 && (
              <div className="ac-dup" style={{ background: "rgba(0,0,0,.75)", fontWeight: 900, color: "rgba(255,255,255,.6)" }}>
                ×{dupeCount}
              </div>
            )}

            {/* Player photo circle */}
            <div style={{
              position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)",
              width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden",
              background: (TEAM_BG_COLORS[card.playerTeam] ?? "#1e2438") + "33",
            }}>
              <img
                src={`/players/${card.playerFolder}/${card.playerId}.png`}
                alt={card.playerName}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
              />
            </div>

            {/* Player name */}
            <div style={{ position: "absolute", top: "71%", left: 0, right: 0, textAlign: "center", padding: "0 5px" }}>
              <div className="ac-name" style={{ fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: `0 0 10px ${meta.glow}` }}>
                {card.playerName}
              </div>
            </div>

            {/* Team logo — bottom left */}
            <div
              className="ac-logo"
              style={{
                position: "absolute",
                left: logoOffset,
                bottom: logoOffset,
                top: "auto",
                right: "auto",
                width: logoSize,
                height: logoSize,
                borderRadius: "50%",
                overflow: "hidden",
                zIndex: 4,
                background: "rgba(0,0,0,.55)",
                border: "1.5px solid var(--border-3)",
              }}
            >
              <img src={card.playerTeamLogo} alt={card.playerTeam} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>

            {/* Year — bottom right */}
            <div className="ac-pos" style={{ background: "rgba(0,0,0,.7)", fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: ".05em" }}>
              {card.year ?? "2025"}
            </div>
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ fontSize: 14, opacity: 0.2 }}>🔒</div>
            <div className="ac-name" style={{ fontWeight: 800, color: "rgba(255,255,255,.2)", textAlign: "center", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
              {card.playerName}
            </div>
          </div>
        )}
      </div>

      {/* Featured star badge */}
      {featured && (
        <div style={{
          position: "absolute", top: dupeCount > 1 ? 24 : 3, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, width: 16, height: 16, borderRadius: "50%",
          background: "#ffd700", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 6px rgba(255,215,0,0.8)", pointerEvents: "none",
        }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="#14141e">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        </div>
      )}
    </div>
  );
}
