"use client";

import { useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;
// Two consecutive failed checks before showing — one blip shouldn't flash a
// scary banner at everyone.
const FAILS_TO_SHOW = 2;

export default function ServiceOutageBanner() {
  const [down, setDown] = useState(false);
  const [visible, setVisible] = useState(false); // controls CSS fade
  // Device-offline is OfflineBanner's job — hide this one entirely while
  // offline so the two banners never stack on the same spot.
  const [offline, setOffline] = useState(false);
  const failCount = useRef(0);
  const checking = useRef(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      // Skip while offline (see above) or while a check is already inflight
      // (visibilitychange can fire mid-check).
      if (checking.current || (typeof navigator !== "undefined" && !navigator.onLine)) {
        schedule();
        return;
      }
      checking.current = true;
      let up = true;
      try {
        const res = await fetch("/api/health/supabase", { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { up?: boolean };
          up = j.up !== false;
        }
        // Non-OK from our own route = can't tell — treat as up, stay quiet.
      } catch {
        // Fetch to our own origin failed — likely connectivity, not Supabase.
      } finally {
        checking.current = false;
      }
      if (cancelled) return;

      if (up) {
        failCount.current = 0;
        setVisible(false);
        setTimeout(() => { if (!cancelled) setDown(false); }, 400);
      } else {
        failCount.current += 1;
        if (failCount.current >= FAILS_TO_SHOW) {
          setDown(true);
          setVisible(true);
        } else {
          // Re-check quickly rather than waiting a full poll interval.
          timer = setTimeout(check, 5_000);
          return;
        }
      }
      schedule();
    }

    function schedule() {
      timer = setTimeout(check, POLL_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void check();
      }
    }

    void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!down || offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9998, // just under OfflineBanner so device-offline wins
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: "calc(100vw - 24px)",
        padding: "9px 18px",
        borderRadius: "var(--r-full)",
        background: "rgba(20,20,28,0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        fontSize: 13,
        fontWeight: 700,
        color: "#f8fafc",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
        Our data provider is having an outage — live scores still work; picks &amp; profiles will be back soon.
      </span>
    </div>
  );
}
