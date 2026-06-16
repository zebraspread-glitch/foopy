"use client";

import { useEffect } from "react";

// SplashScreen renders NOTHING into the DOM — the splash itself is pure CSS
// (body::before/::after in globals.css), so there's no element to hydrate and
// nothing an injected widget can break. This component just decides when the
// splash should fade out: it sets data-foopy-loaded on <html>, which the CSS
// reacts to. Shown only on the first load of a browsing session.

const SESSION_KEY = "foopy_splash_shown";
const MIN_VISIBLE_MS = 600;
const FAILSAFE_MS = 6000;

export default function SplashScreen() {
  useEffect(() => {
    const reveal = () => {
      document.documentElement.setAttribute("data-foopy-loaded", "1");
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
    };

    // Already shown this session (the inline <head> script in layout.tsx will
    // have set the attribute pre-paint to avoid a flash) — nothing to do.
    let alreadyShown = false;
    try { alreadyShown = !!sessionStorage.getItem(SESSION_KEY); } catch { /* ignore */ }
    if (alreadyShown) { reveal(); return; }

    const start = Date.now();
    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
      window.setTimeout(reveal, wait);
    };

    const failsafe = window.setTimeout(dismiss, FAILSAFE_MS);
    if (document.readyState === "complete") dismiss();
    else window.addEventListener("load", dismiss, { once: true });

    return () => {
      window.removeEventListener("load", dismiss);
      window.clearTimeout(failsafe);
    };
  }, []);

  return null;
}
