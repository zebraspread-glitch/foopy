"use client";

import { SettingsHeader, SettingsScreen, Body, Group, ControlRow } from "../shared";

export default function AboutSettings() {
  return (
    <SettingsScreen>
      <SettingsHeader title="About" backHref="/settings" />
      <Body>
        <Group>
          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            label="Version"
            sub="Foopy"
          >
            <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600 }}>1.0.0</span>
          </ControlRow>
          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            label="Season"
          >
            <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600 }}>AFL 2026</span>
          </ControlRow>
        </Group>

        <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--text-3)", fontWeight: 500, textAlign: "center", padding: "24px 14px 0", margin: 0 }}>
          Foopy is an unofficial fan-made app. It is not affiliated with,
          endorsed by, or associated with the Australian Football League (AFL),
          the AFL Players' Association, or any AFL club. All team names, logos,
          player names and related marks are the property of their respective owners.
        </p>
      </Body>
    </SettingsScreen>
  );
}
