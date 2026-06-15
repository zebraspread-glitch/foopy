"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import Link from "next/link";
import { SettingsHeader, SettingsScreen, Body, Group, NavRow } from "./shared";

// Icons kept inline so each row stays self-contained.
const Icon = {
  team: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  stats: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  messaging: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  appearance: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3z"/><path d="M9 8c-2 2-3 4-3 6l-3 3 3 3 3-3c2 0 4-1 6-3"/></svg>,
  account: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  about: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
};

export default function SettingsPage() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername]   = useState<string | null>(null);
  const [email, setEmail]         = useState<string | null>(null);
  const [initials, setInitials]   = useState("?");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setEmail(user.email ?? null);
      supabase.from("profiles").select("avatar_url, username").eq("id", user.id).single()
        .then(({ data }) => {
          if (!data) return;
          setAvatarUrl(data.avatar_url ?? null);
          setUsername(data.username ?? null);
          const label = data.username || user.email?.split("@")[0] || "?";
          setInitials(label[0].toUpperCase());
        });
    });
  }, []);

  return (
    <SettingsScreen>
      <SettingsHeader title="Settings" backHref="/" />
      <Body>
        {/* Profile card */}
        <Link href="/profile" className="snav" style={{ textDecoration: "none" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 6px", borderRadius: 14, marginBottom: 6,
            WebkitTapHighlightColor: "transparent",
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
              background: "linear-gradient(135deg, #1e3a5f, #0f172a)",
              border: "2px solid var(--border-2)",
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", fontSize: 21, fontWeight: 800 }}>{initials}</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {username ? `@${username}` : "Set up your profile"}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>
                {email ?? "Not signed in"}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </Link>

        <Group label="Options">
          <NavRow icon={Icon.team}       label="My Team"   href="/settings/my-team" />
          <NavRow icon={Icon.stats}      label="Stats"     href="/settings/stats" />
          <NavRow icon={Icon.messaging}  label="Messaging" href="/settings/messaging" />
          <NavRow icon={Icon.appearance} label="Appearance" href="/settings/appearance" />
        </Group>

        <Group label="General">
          <NavRow icon={Icon.account} label="Account" href="/settings/account" />
          <NavRow icon={Icon.about}   label="About"   href="/settings/about" />
        </Group>
      </Body>
    </SettingsScreen>
  );
}
