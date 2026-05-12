"use client";

import type { CSSProperties } from "react";
import { levelTitle } from "@/app/lib/xp";

type Props = {
  level: number;
  size?: "sm" | "md" | "lg" | "xl";
  showTitle?: boolean;
};

const SIZE_MAP = {
  sm: { badge: 22,  font: 9,  gap: 4, titleSize: 11 },
  md: { badge: 30,  font: 12, gap: 6, titleSize: 12 },
  lg: { badge: 40,  font: 15, gap: 8, titleSize: 14 },
  xl: { badge: 80,  font: 22, gap: 0, titleSize: 0  },
};

function badgeImage(level: number): string {
  const tier = Math.floor((level - 1) / 100) * 100;
  const capped = Math.min(tier, 1000);
  return `/levels/level${capped}.png`;
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
    width:    `${badge}px`,
    height:   `${badge}px`,
    position: "relative",
    flexShrink: 0,
    display:  "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const imgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
  };

  const numStyle: CSSProperties = {
    position:   "relative",
    fontSize:   `${font}px`,
    fontWeight: 900,
    color:      "#fff",
    lineHeight: 1,
    letterSpacing: "-0.5px",
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
    zIndex: 1,
  };

  const titleStyle: CSSProperties = {
    fontSize:   `${titleSize}px`,
    fontWeight: 700,
    color:      "rgba(255,255,255,0.75)",
    lineHeight: 1,
  };

  return (
    <div style={wrapStyle}>
      <div style={badgeStyle}>
        <img src={badgeImage(level)} alt="" style={imgStyle} />
        <span style={numStyle}>{level}</span>
      </div>
      {showTitle && <span style={titleStyle}>{title}</span>}
    </div>
  );
}
