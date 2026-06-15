"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { isRootRoute } from "@/app/lib/navRoutes";

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
}: PageHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const rightContent = right ?? rightSlot;

  // On pushed (non-root) screens, show a back arrow by default so every
  // detail page feels stacked on top of its root tab. Explicit backHref/onBack
  // always win; root tab sections show no back (they get the drawer button).
  const back = backHref ? (
    <Link href={backHref} style={backStyle} aria-label="Back">
      <ChevronLeftIcon />
    </Link>
  ) : onBack ? (
    <button onClick={onBack} style={backStyle} aria-label="Back" type="button">
      <ChevronLeftIcon />
    </button>
  ) : !isRootRoute(pathname) ? (
    <button onClick={() => router.back()} style={backStyle} aria-label="Back" type="button">
      <ChevronLeftIcon />
    </button>
  ) : null;

  // Title is always centred; the back button sits in the left cell and the
  // right slot in the right cell, so neither shifts the centre. (A fixed
  // sidebar avatar button, when present, overlaps the empty left cell.)
  return (
    <header
      style={{
        ...headerStyle,
        borderBottom: noBorder ? "none" : "0.5px solid var(--bottom-nav-border)",
      }}
    >
      <div style={leftCellStyle}>{back}</div>
      <div style={titleWrapStyle}>
        <span style={titleStyle}>{title}</span>
        {subtitle && <span style={subtitleStyle}>{subtitle}</span>}
      </div>
      <div style={rightCellStyle}>{rightContent}</div>
    </header>
  );
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 8,
  height: "calc(56px + env(safe-area-inset-top))",
  marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
  padding: "env(safe-area-inset-top) 12px 0",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  willChange: "transform",
};

const leftCellStyle: CSSProperties = {
  justifySelf: "start",
  display: "flex",
  alignItems: "center",
  height: 56,
  minWidth: 0,
};

const rightCellStyle: CSSProperties = {
  justifySelf: "end",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  height: 56,
  minWidth: 0,
};

const titleWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
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
