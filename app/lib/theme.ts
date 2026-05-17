export type FoopyThemeMode = "default" | "light" | "dark";

export const FOOPY_THEME_KEY = "foopy_theme_mode";

export function normalizeThemeMode(value: string | null): FoopyThemeMode {
  return value === "light" || value === "dark" ? value : "default";
}

export function themeColorForMode(mode: FoopyThemeMode) {
  if (mode === "light") return "#ffffff";
  if (mode === "dark") return "#000000";
  return "#14141e";
}
