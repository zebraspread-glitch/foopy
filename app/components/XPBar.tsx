"use client";

import type { CSSProperties } from "react";
import { levelFromXP, levelProgress, xpForCurrentLevel, xpInCurrentLevel } from "@/app/lib/xp";

type Props = {
  xp: number;
  compact?: boolean;
};

export default function XPBar({ xp, compact = false }: Props) {
  const level    = levelFromXP(xp);
  const progress = levelProgress(xp);
  const current  = xpInCurrentLevel(xp);
  const needed   = xpForCurrentLevel(xp);

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: compact ? "4px" : "6px",
    width: "100%",
  };

  const labelRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  };

  const trackStyle: CSSProperties = {
    width: "100%",
    height: compact ? "5px" : "7px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  };

  const fillStyle: CSSProperties = {
    height: "100%",
    width: `${Math.round(progress * 100)}%`,
    borderRadius: "999px",
    background: "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)",
    transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
    boxShadow: "0 0 8px rgba(59,130,246,0.5)",
  };

  if (compact) {
    return (
      <div style={containerStyle}>
        <div style={trackStyle}>
          <div style={fillStyle} />
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={labelRowStyle}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
          Level {level}
        </span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
          {current} / {needed} XP
        </span>
      </div>
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textAlign: "right" }}>
        {Math.round(progress * 100)}% to Level {level + 1}
      </span>
    </div>
  );
}
