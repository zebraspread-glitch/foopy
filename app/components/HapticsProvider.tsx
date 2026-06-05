"use client";

import { useEffect } from "react";
import { hapticLight } from "@/app/lib/haptics";

/**
 * Fires a light haptic on every touch of a button, link, or pressable element.
 * Mounted once in the root layout — no need to add haptics to individual components.
 */
export default function HapticsProvider() {
  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (localStorage.getItem("foopy_haptics") === "false") return;
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('button, a, [role="button"], .pressable, .pressable-row, .tab-item')) {
        hapticLight();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => document.removeEventListener("touchstart", onTouchStart);
  }, []);

  return null;
}
