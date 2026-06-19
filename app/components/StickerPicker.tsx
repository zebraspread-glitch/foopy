"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useSession } from "@/app/context/SessionProvider";
import {
  FREE_STICKER_NAMES,
  PAID_STICKERS,
  stickerUrl,
  getRecentStickers,
  addRecentSticker,
  usableStickerNames,
} from "@/app/lib/stickers";

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
  const router = useRouter();
  const { user } = useSession();
  const [showAll, setShowAll] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [ownedPackKeys, setOwnedPackKeys] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();

  useEffect(() => {
    setRecent(getRecentStickers());
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Lock background (match page) scrolling while the sticker sheet is open —
  // only the sheet itself should scroll.
  useEffect(() => {
    if (!showAll) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showAll]);

  // Which paid packs the signed-in user owns (drives send-gating).
  useEffect(() => {
    if (!user) { setOwnedPackKeys(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_cosmetics")
        .select("cosmetics(key, category)")
        .eq("user_id", user.id);
      if (cancelled) return;
      const keys = new Set<string>();
      for (const row of (data ?? []) as { cosmetics: { key: string; category: string } | { key: string; category: string }[] | null }[]) {
        // Supabase types the joined relation as an array; it's really one row.
        const cos = Array.isArray(row.cosmetics) ? row.cosmetics[0] : row.cosmetics;
        if (cos?.category === "sticker") keys.add(cos.key);
      }
      setOwnedPackKeys(keys);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const usable = useMemo(() => usableStickerNames(ownedPackKeys), [ownedPackKeys]);

  const pick = useCallback((name: string) => {
    if (!usable.has(name)) {
      // Locked paid sticker — send the user to the store instead of inserting.
      setShowAll(false);
      router.push("/store");
      return;
    }
    onPick(name);
    setRecent(addRecentSticker(name));
    setShowAll(false);
  }, [usable, onPick, router]);

  const popup = (
    <div style={isMobile ? backdropStyleMobile : backdropStyleDesktop} onClick={() => setShowAll(false)}>
      <div style={isMobile ? sheetStyleMobile : sheetStyleDesktop} onClick={e => e.stopPropagation()}>
        {isMobile && <div style={handleStyle} />}
        <div style={headerStyle}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>Stickers</span>
          <button onClick={() => setShowAll(false)} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={scrollAreaStyle}>
          <div style={gridStyle}>
            {FREE_STICKER_NAMES.map(name => <StickerButton key={name} name={name} locked={false} onClick={pick} />)}
          </div>

          {PAID_STICKERS.length > 0 && (
            <div>
              <div style={packHeaderStyle}>
                <span>Premium</span>
                <button type="button" onClick={() => { setShowAll(false); router.push("/store"); }} style={packBuyBtnStyle}>
                  Get in store
                </button>
              </div>
              <div style={gridStyle}>
                {PAID_STICKERS.map(s => (
                  <StickerButton key={s.sticker} name={s.sticker} locked={!ownedPackKeys.has(s.key)} onClick={pick} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Only surface recents the user can actually send.
  const usableRecent = recent.filter(n => usable.has(n));

  return (
    <>
      <div style={rowStyle}>
        <div style={scrollRowStyle}>
          {usableRecent.length === 0 ? (
            <span style={emptyHintStyle}>Tap to browse stickers →</span>
          ) : (
            usableRecent.map(name => (
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

// Module-level + memoised so re-renders of the picker (e.g. a parent's live
// countdown ticking every second) don't remount the sticker images, which was
// causing them to reload and flicker.
const StickerButton = memo(function StickerButton({ name, locked, onClick }: { name: string; locked: boolean; onClick: (name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(name)}
      style={{ ...gridBtnStyle, position: "relative", opacity: locked ? 0.55 : 1 }}
      aria-label={locked ? `Buy to use sticker ${name}` : `Insert sticker ${name}`}
    >
      <img src={stickerUrl(name)} alt="" style={imgStyle} loading="lazy" decoding="async" draggable={false} />
      {locked && <span style={lockBadgeStyle}><LockIcon /></span>}
    </button>
  );
});

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

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
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

const scrollAreaStyle: CSSProperties = {
  overflowY: "auto",
  padding: "0 0 calc(8px + env(safe-area-inset-bottom))",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
  gap: 10,
  padding: "14px 16px",
};

const packHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 16px 0",
  fontSize: 13,
  fontWeight: 900,
  color: "var(--text-2)",
  borderTop: "1px solid var(--border-1)",
  marginTop: 6,
};

const packBuyBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "var(--blue)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  padding: "5px 12px",
  cursor: "pointer",
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

const lockBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 3,
  bottom: 3,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.72)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
