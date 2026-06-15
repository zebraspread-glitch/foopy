"use client";

import { useEffect, useState } from "react";
import {
  SettingsHeader, SettingsScreen, Body, Group, ControlRow, ColourPicker, savePref,
} from "../shared";

export default function MessagingSettings() {
  const [chatBubbleColor, setChatBubbleColor] = useState("#22c55e");

  useEffect(() => {
    setChatBubbleColor(localStorage.getItem("foopy_dm_bubble_color") ?? "#22c55e");
  }, []);

  return (
    <SettingsScreen>
      <SettingsHeader title="Messaging" backHref="/settings" />
      <Body>
        <Group>
          <ControlRow
            icon={<div style={{ width: 19, height: 19, borderRadius: 5, background: chatBubbleColor, border: "2px solid rgba(255,255,255,0.15)" }} />}
            label="Chat Bubble Colour"
            sub="Your sent message colour in DMs"
          >
            <ColourPicker
              value={chatBubbleColor}
              swatches={["#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b", "#ec4899"]}
              onChange={(c) => { setChatBubbleColor(c); savePref("foopy_dm_bubble_color", c); }}
            />
          </ControlRow>
        </Group>
      </Body>
    </SettingsScreen>
  );
}
