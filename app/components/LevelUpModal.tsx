"use client";

import type { CSSProperties } from "react";
import { LEVEL_MILESTONES, levelTitle } from "@/app/lib/xp";
import LevelBadge from "./LevelBadge";

type Props = {
  newLevel: number;
  prevLevel: number;
  onDismiss: () => void;
};

export default function LevelUpModal({ newLevel, prevLevel, onDismiss }: Props) {
  const milestone = LEVEL_MILESTONES[newLevel];
  const title = levelTitle(newLevel);

  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(8px)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    animation: "fadeIn 0.2s ease both",
  };

  const cardStyle: CSSProperties = {
    background: "rgba(18,18,18,0.98)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "24px",
    padding: "36px 28px",
    textAlign: "center",
    width: "100%",
    maxWidth: "320px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    animation: "scaleIn 0.35s var(--spring-bounce) both",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
  };

  const shimmerStyle: CSSProperties = {
    fontSize: "48px",
    lineHeight: 1,
    animation: "levelUpPop 0.5s var(--spring-bounce) 0.15s both",
  };

  const headingStyle: CSSProperties = {
    fontSize: "22px",
    fontWeight: 900,
    color: "#fff",
    letterSpacing: "-0.5px",
    lineHeight: 1.1,
  };

  const subStyle: CSSProperties = {
    fontSize: "15px",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.4,
  };

  const btnStyle: CSSProperties = {
    marginTop: "8px",
    width: "100%",
    padding: "14px",
    borderRadius: "14px",
    border: "none",
    background: "var(--blue, #3b82f6)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "-0.2px",
  };

  return (
    <div style={backdropStyle} onClick={onDismiss}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {milestone ? (
          <div style={shimmerStyle}>{milestone.emoji}</div>
        ) : (
          <LevelBadge level={newLevel} size="lg" />
        )}

        <div>
          <div style={{ ...headingStyle, marginBottom: "4px" }}>Level {newLevel}!</div>
          <div style={headingStyle}>{title}</div>
        </div>

        {milestone && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "10px 16px",
              fontSize: "13px",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 600,
            }}
          >
            🏆 Badge unlocked: {milestone.label}
          </div>
        )}

        <div style={subStyle}>
          You leveled up from {prevLevel} → {newLevel}. Keep going!
        </div>

        <button style={btnStyle} onClick={onDismiss}>
          Let&apos;s go!
        </button>
      </div>
    </div>
  );
}
