"use client";

import { useEffect } from "react";

// SplashScreen — keeps the initial black splash overlay (rendered statically in
// layout.tsx, so it paints instantly before hydration) on screen until the app
// has finished loading, then fades it out and removes it from the DOM.
//
// "Loaded" = the document has reached `readyState === "complete"` (all initial
// resources fetched) AND a short minimum display time has elapsed so the splash
// never flickers on fast loads. A failsafe guarantees it always dismisses.

const MIN_VISIBLE_MS = 600;   // never flash; show at least this long
const FADE_MS = 450;          // matches the CSS opacity transition
const FAILSAFE_MS = 6000;     // hard cap — never trap the user behind the splash

export default function SplashScreen() {
  useEffect(() => {
    const splash = document.getElementById("foopy-splash");
    if (!splash) return;

    const start = Date.now();
    let dismissed = false;

    const remove = () => {
      // Fully detach once the fade-out finishes so it can't intercept taps.
      splash.parentNode?.removeChild(splash);
    };

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
      window.setTimeout(() => {
        splash.classList.add("splash-hidden");
        window.setTimeout(remove, FADE_MS);
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

  return null;
}
