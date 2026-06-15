"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  rightSlot?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  noBorder?: boolean;
  sidebarPad?: boolean;
  align?: "center" | "left";
};

/**
 * Canonical sticky page header for ordinary Foopy screens.
 * Keep bespoke immersive pages rare and intentional.
 */
export default function PageHeader({
  title,
  subtitle,
  right,
  rightSlot,
  backHref,
  onBack,
  noBorder = false,
  sidebarPad = false,
  align = "center",
}: PageHeaderProps) {
  const rightContent = right ?? rightSlot;
  const back = backHref ? (
    <Link href={backHref} style={backStyle} aria-label="Back">
      <ChevronLeftIcon />
    </Link>
  ) : onBack ? (
    <button onClick={onBack} style={backStyle} aria-label="Back" type="button">
      <ChevronLeftIcon />
    </button>
  ) : null;
  const isLeftAligned = align === "left" || !!back;

  return (
    <header
      style={{
        ...headerStyle,
        gridTemplateColumns: isLeftAligned ? "minmax(0, 1fr) auto" : "1fr auto 1fr",
        borderBottom: noBorder ? "none" : "0.5px solid var(--bottom-nav-border)",
      }}
    >
      {!isLeftAligned && <div aria-hidden style={spacerStyle} />}
      <div
        style={{
          ...titleWrapStyle,
          alignItems: isLeftAligned ? "flex-start" : "center",
          justifySelf: isLeftAligned ? "start" : "center",
          paddingLeft: back ? 48 : sidebarPad ? 42 : 0,
          textAlign: isLeftAligned ? "left" : "center",
        }}
      >
        {back && <span style={backSlotStyle}>{back}</span>}
        <span style={titleStyle}>{title}</span>
        {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
      </div>
      {rightContent ? <div style={rightStyle}>{rightContent}</div> : <div aria-hidden style={spacerStyle} />}
    </header>
  );
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "grid",
  alignItems: "center",
  gap: 12,
  height: "calc(56px + env(safe-area-inset-top))",
  marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
  padding: "env(safe-area-inset-top) 16px 0",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  willChange: "transform",
};

const titleWrapStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  minWidth: 0,
  height: 56,
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  color: "var(--text-1)",
  maxWidth: "min(52vw, 360px)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 750,
  color: "var(--text-3)",
  lineHeight: 1,
  maxWidth: "min(58vw, 400px)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rightStyle: CSSProperties = {
  justifySelf: "end",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  minWidth: 0,
  height: 56,
};

const spacerStyle: CSSProperties = {
  width: 1,
  height: 56,
};

const backSlotStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  height: 56,
  display: "flex",
  alignItems: "center",
};

const backStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "var(--text-1)",
  textDecoration: "none",
};

function ChevronLeftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
