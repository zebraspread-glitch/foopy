"use client";

import { useEffect, useState } from "react";
import {
  SettingsHeader, SettingsScreen, Body, Group, ControlRow, STAT_OPTIONS, savePref,
} from "../shared";
import {
  QUARTER_SCORE_DISPLAY_KEY,
  QUARTER_SCORE_DISPLAY_OPTIONS,
  normalizeQuarterScoreDisplay,
  type QuarterScoreDisplayMode,
} from "@/app/lib/quarterScoreDisplay";

export default function StatsSettings() {
  const [defaultStat, setDefaultStat] = useState("disposals");
  const [quarterScoreDisplay, setQuarterScoreDisplay] = useState<QuarterScoreDisplayMode>("total");

  useEffect(() => {
    setDefaultStat(localStorage.getItem("foopy_default_stat") ?? "disposals");
    setQuarterScoreDisplay(normalizeQuarterScoreDisplay(localStorage.getItem(QUARTER_SCORE_DISPLAY_KEY)));
  }, []);

  const selectedQuarterScoreDisplay =
    QUARTER_SCORE_DISPLAY_OPTIONS.find((option) => option.value === quarterScoreDisplay) ??
    QUARTER_SCORE_DISPLAY_OPTIONS[0];

  return (
    <SettingsScreen>
      <SettingsHeader title="Stats" backHref="/settings" />
      <Body>
        <Group>
          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
            label="Default Category"
            sub={STAT_OPTIONS.find(s => s.value === defaultStat)?.label ?? "Disposals"}
          >
            <select
              value={defaultStat}
              onChange={e => { setDefaultStat(e.target.value); savePref("foopy_default_stat", e.target.value); }}
              style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, fontWeight: 600, padding: "7px 9px", cursor: "pointer", outline: "none" }}
            >
              {STAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </ControlRow>
          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>}
            label="Quarter Scores"
            sub={selectedQuarterScoreDisplay.summary}
          >
            <select
              value={quarterScoreDisplay}
              onChange={e => {
                const next = normalizeQuarterScoreDisplay(e.target.value);
                setQuarterScoreDisplay(next);
                savePref(QUARTER_SCORE_DISPLAY_KEY, next);
              }}
              style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, fontWeight: 600, padding: "7px 9px", cursor: "pointer", outline: "none" }}
            >
              {QUARTER_SCORE_DISPLAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </ControlRow>
        </Group>
      </Body>
    </SettingsScreen>
  );
}
