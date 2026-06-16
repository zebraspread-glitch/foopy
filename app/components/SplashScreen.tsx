"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// SplashScreen — full-screen black overlay shown only on the FIRST load of the
// app in a browsing session. It's rendered as part of the React tree (so it's
// in the server HTML and paints black before hydration) and is removed purely
// by React state — never by manual DOM removal, which would corrupt React's
// tree and crash navigation.
//
// "Loaded" = document `readyState === "complete"` AND a short minimum display
// time has elapsed (no flicker). A failsafe guarantees it always dismisses.

const MIN_VISIBLE_MS = 600;
const FADE_MS = 450;
const FAILSAFE_MS = 6000;
const SESSION_KEY = "foopy_splash_shown";

// useLayoutEffect runs before paint (lets us skip the splash with no flash on
// repeat loads); falls back to useEffect during SSR where it's a no-op.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  // Already shown this session? Hide before the browser paints — no flash.
  useIsomorphicLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) setVisible(false);
    } catch {
      /* sessionStorage may be unavailable (private mode) — just show it. */
    }
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      /* ignore */
    }

    const start = Date.now();
    let done = false;

    const dismiss = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
      window.setTimeout(() => {
        setFading(true); // CSS fades opacity to 0
        window.setTimeout(() => {
          try {
            sessionStorage.setItem(SESSION_KEY, "1");
          } catch {
            /* ignore */
          }
          setVisible(false); // React unmounts the node — no manual DOM removal
        }, FADE_MS);
      }, wait);
    };

    const failsafe = window.setTimeout(dismiss, FAILSAFE_MS);

    if (document.readyState === "complete") {
      dismiss();
    } else {
      window.addEventListener("load", dismiss, { once: true });
    }

    return () => {
      window.removeEventListener("load", dismiss);
      window.clearTimeout(failsafe);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      id="foopy-splash"
      aria-hidden="true"
      className={fading ? "splash-hidden" : undefined}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning on every node: some iOS webviews / extensions
          inject a class onto the served HTML before React hydrates, which
          otherwise mismatches and makes React regenerate the tree (throwing the
          dev error overlay that blocks taps). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/footy-icon.png" alt="" className="splash-logo" suppressHydrationWarning />
      <div className="splash-spinner" suppressHydrationWarning />
    </div>
  );
}
