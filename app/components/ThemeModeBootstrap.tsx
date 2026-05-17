"use client";

import { useEffect } from "react";
import { FOOPY_THEME_KEY, normalizeThemeMode, themeColorForMode } from "@/app/lib/theme";

function applyThemeFromStorage() {
  const mode = normalizeThemeMode(localStorage.getItem(FOOPY_THEME_KEY));
  document.documentElement.dataset.foopyTheme = mode;
  document.documentElement.style.colorScheme = mode === "light" ? "light" : "dark";

  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorForMode(mode));

  document
    .querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    ?.setAttribute("content", mode === "light" ? "light" : "dark");
}

export default function ThemeModeBootstrap() {
  useEffect(() => {
    applyThemeFromStorage();

    const handleThemeChange = () => applyThemeFromStorage();
    window.addEventListener("storage", handleThemeChange);
    window.addEventListener("foopy-settings-changed", handleThemeChange);

    return () => {
      window.removeEventListener("storage", handleThemeChange);
      window.removeEventListener("foopy-settings-changed", handleThemeChange);
    };
  }, []);

  return null;
}
