"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Standard sticky page header — used on every page except Home
 * (Home has its own branded header with the logo + round scroll).
 *
 * Props:
 *   title       — main heading text
 *   subtitle    — smaller muted text below title (optional)
 *   right       — arbitrary element in the top-right slot (optional)
 *   noBorder    — remove the bottom border (e.g. when a RoundStrip follows directly)
 */
export default function PageHeader({
  title,
  subtitle,
  right,
  noBorder = false,
  sidebarPad = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  noBorder?: boolean;
  /** Add 58px left padding to clear the fixed sidebar avatar button */
  sidebarPad?: boolean;
}) {
  return (
    <header style={{ ...headerStyle, paddingLeft: sidebarPad ? 58 : 16, borderBottom: noBorder ? "none" : "1px solid var(--border-1)" }}>
      <div style={leftStyle}>
        <span style={titleStyle}>{title}</span>
        {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
      </div>
      {right && <div style={rightStyle}>{right}</div>}
    </header>
  );
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  height: "calc(56px + env(safe-area-inset-top))",
  padding: "env(safe-area-inset-top) 16px 0",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
  willChange: "transform",
};

const leftStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1,
  color: "var(--text-1)",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-3)",
  lineHeight: 1,
};

const rightStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
};
