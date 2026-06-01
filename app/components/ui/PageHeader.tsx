"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

/**
 * Standard sticky page header used by all sub-pages.
 *
 * Props:
 *   title      — main heading (required)
 *   subtitle   — smaller muted text below title (optional)
 *   backHref   — show a back-chevron linking to this href (optional)
 *   rightSlot  — arbitrary content in the top-right slot (optional)
 *   noBorder   — suppress the bottom border (optional)
 */
export default function PageHeader({
  title,
  subtitle,
  backHref,
  rightSlot,
  noBorder = false,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
  noBorder?: boolean;
}) {
  return (
    <header
      style={{
        ...headerStyle,
        borderBottom: noBorder ? "none" : "0.5px solid var(--border-1)",
      }}
    >
      <div style={leftStyle}>
        {backHref && (
          <Link href={backHref} style={backStyle} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={titleStyle}>{title}</span>
          {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
        </div>
      </div>
      {rightSlot && <div style={rightStyle}>{rightSlot}</div>}
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
  willChange: "transform",
};

const leftStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flex: 1,
};

const backStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 10,
  background: "var(--surface-2)",
  border: "1px solid var(--border-1)",
  color: "var(--text-1)",
  flexShrink: 0,
  textDecoration: "none",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: "-0.03em",
  lineHeight: 1,
  color: "var(--text-1)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-3)",
  lineHeight: 1,
};

const rightStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
};
