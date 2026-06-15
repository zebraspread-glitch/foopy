"use client";

import { useEffect, useState } from "react";
import {
  SettingsHeader, SettingsScreen, Body, Group, ControlRow, Toggle, Segmented,
  THEME_OPTIONS, FOOPY_THEME_KEY, applyThemeMode, savePref, type FoopyThemeMode,
} from "../shared";
import { normalizeThemeMode } from "@/app/lib/theme";

export default function AppearanceSettings() {
  const [themeMode, setThemeMode] = useState<FoopyThemeMode>("default");
  const [reactionAnim, setReactionAnim] = useState<"off" | "hover" | "ghostly">("hover");
  const [hapticsOn, setHapticsOn] = useState(true);

  useEffect(() => {
    const stored = normalizeThemeMode(localStorage.getItem(FOOPY_THEME_KEY));
    setThemeMode(stored);
    applyThemeMode(stored);
    const ra = localStorage.getItem("foopy_reaction_anim");
    setReactionAnim(ra === "off" || ra === "ghostly" ? ra : "hover");
    setHapticsOn(localStorage.getItem("foopy_haptics") !== "false");
  }, []);

  function chooseThemeMode(mode: FoopyThemeMode) {
    setThemeMode(mode);
    localStorage.setItem(FOOPY_THEME_KEY, mode);
    applyThemeMode(mode);
    window.dispatchEvent(new Event("foopy-settings-changed"));
  }

  return (
    <SettingsScreen>
      <SettingsHeader title="Appearance" backHref="/settings" />
      <Body>
        <Group>
          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3v18"/><path d="M12 8h7"/><path d="M12 16h7"/></svg>}
            label="Theme Mode"
            sub="Default grey, white, or black"
          >
            <Segmented ariaLabel="Theme mode" options={THEME_OPTIONS} value={themeMode} onChange={chooseThemeMode} />
          </ControlRow>

          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18.4l1.9-5.8 5.8-1.9-5.8-1.9z"/></svg>}
            label="Reaction Animation"
            sub="Top reactions on each event"
          >
            <Segmented
              ariaLabel="Reaction animation"
              options={[{ value: "off", label: "Off" }, { value: "hover", label: "Hover" }, { value: "ghostly", label: "Ghostly" }]}
              value={reactionAnim}
              onChange={(m) => { setReactionAnim(m); savePref("foopy_reaction_anim", m); }}
            />
          </ControlRow>

          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18h.01"/><path d="M8 6c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3-4 5-4 5"/><path d="M12 22v.01"/></svg>}
            label="Haptic Feedback"
            sub="Vibrate on taps (iPhone)"
          >
            <Toggle on={hapticsOn} onToggle={() => { const n = !hapticsOn; setHapticsOn(n); savePref("foopy_haptics", String(n)); }} />
          </ControlRow>
        </Group>
      </Body>
    </SettingsScreen>
  );
}
