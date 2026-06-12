"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { STICKER_NAMES, stickerUrl, getRecentStickers, addRecentSticker } from "@/app/lib/stickers";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "2px 2px 8px",
};

const scrollRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  flex: 1,
  minWidth: 0,
  WebkitOverflowScrolling: "touch",
};

const btnStyle: CSSProperties = {
  flexShrink: 0,
  width: 46,
  height: 46,
  padding: 0,
  border: "none",
  borderRadius: 10,
  background: "none",
  cursor: "pointer",
  overflow: "hidden",
};

const imgStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

const moreBtnStyle: CSSProperties = {
  flexShrink: 0,
  width: 46,
  height: 46,
  padding: 0,
  border: "1px solid var(--border-2)",
  borderRadius: 10,
  background: "var(--surface-3)",
  color: "var(--text-2)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const emptyHintStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-3)",
  whiteSpace: "nowrap",
};

export default function StickerPicker({ onPick }: { onPick: (name: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    setRecent(getRecentStickers());
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  function pick(name: string) {
    onPick(name);
    setRecent(addRecentSticker(name));
    setShowAll(false);
  }

  const popup = (
    <div style={isMobile ? backdropStyleMobile : backdropStyleDesktop} onClick={() => setShowAll(false)}>
      <div style={isMobile ? sheetStyleMobile : sheetStyleDesktop} onClick={e => e.stopPropagation()}>
        {isMobile && <div style={handleStyle} />}
        <div style={headerStyle}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>Stickers</span>
          <button onClick={() => setShowAll(false)} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={gridStyle}>
          {STICKER_NAMES.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              style={gridBtnStyle}
              aria-label={`Insert sticker ${name}`}
            >
              <img src={stickerUrl(name)} alt="" style={imgStyle} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div style={rowStyle}>
        <div style={scrollRowStyle}>
          {recent.length === 0 ? (
            <span style={emptyHintStyle}>Tap to browse stickers →</span>
          ) : (
            recent.map(name => (
              <button key={name} type="button" onClick={() => pick(name)} style={btnStyle} aria-label={`Insert sticker ${name}`}>
                <img src={stickerUrl(name)} alt="" style={imgStyle} />
              </button>
            ))
          )}
        </div>
        <button type="button" onClick={() => setShowAll(true)} style={moreBtnStyle} aria-label="Show all stickers">
          <GridIcon />
        </button>
      </div>

      {showAll && portalTarget && createPortal(popup, portalTarget)}
    </>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

const backdropStyleMobile: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 300,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const backdropStyleDesktop: CSSProperties = {
  ...backdropStyleMobile,
  alignItems: "center",
};

const sheetStyleMobile: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  maxHeight: "70dvh",
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderBottom: "none",
  borderRadius: "20px 20px 0 0",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sheetStyleDesktop: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  maxHeight: "min(640px, 80vh)",
  background: "var(--bg)",
  border: "1px solid var(--border-2)",
  borderRadius: 20,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
};

const handleStyle: CSSProperties = {
  width: 36,
  height: 4,
  borderRadius: 999,
  background: "rgba(255,255,255,0.2)",
  margin: "12px auto 0",
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px 12px",
  borderBottom: "1px solid var(--border-1)",
  flexShrink: 0,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  fontSize: 16,
  cursor: "pointer",
  padding: "2px 4px",
  lineHeight: 1,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
  gap: 10,
  padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
  overflowY: "auto",
};

const gridBtnStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  padding: 0,
  border: "none",
  borderRadius: 12,
  background: "var(--surface-2)",
  cursor: "pointer",
  overflow: "hidden",
};
