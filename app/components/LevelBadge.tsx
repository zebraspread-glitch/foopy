"use client";

import type { CSSProperties } from "react";
import { levelTitle } from "@/app/lib/xp";

type Props = {
  level: number;
  size?: "sm" | "md" | "lg";
  showTitle?: boolean;
};

const SIZE_MAP = {
  sm: { badge: 22, font: 10, gap: 4, titleSize: 11 },
  md: { badge: 30, font: 13, gap: 6, titleSize: 12 },
  lg: { badge: 40, font: 16, gap: 8, titleSize: 14 },
};

// Color gradient based on level tier
function levelColor(level: number): string {
  if (level >= 10) return "linear-gradient(135deg, #f59e0b, #fbbf24)"; // gold GOAT
  if (level >= 7)  return "linear-gradient(135deg, #8b5cf6, #a78bfa)"; // purple Legend
  if (level >= 5)  return "linear-gradient(135deg, #ef4444, #f87171)"; // red Die Hard
  if (level >= 3)  return "linear-gradient(135deg, #3b82f6, #60a5fa)"; // blue Fan
  return "linear-gradient(135deg, #6b7280, #9ca3af)";                   // grey Rookie
}

export default function LevelBadge({ level, size = "md", showTitle = false }: Props) {
  const { badge, font, gap, titleSize } = SIZE_MAP[size];
  const title = levelTitle(level);

  const wrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: `${gap}px`,
  };

  const badgeStyle: CSSProperties = {
    width:  `${badge}px`,
    height: `${badge}px`,
    borderRadius: "50%",
    background: levelColor(level),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  };

  const numStyle: CSSProperties = {
    fontSize: `${font}px`,
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1,
    letterSpacing: "-0.5px",
  };

  const titleStyle: CSSProperties = {
    fontSize: `${titleSize}px`,
    fontWeight: 700,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1,
  };

  return (
    <div style={wrapStyle}>
      <div style={badgeStyle}>
        <span style={numStyle}>{level}</span>
      </div>
      {showTitle && <span style={titleStyle}>{title}</span>}
    </div>
  );
}
