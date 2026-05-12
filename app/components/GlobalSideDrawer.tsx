"use client";

import { supabase } from "@/app/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    label: "Stats",
    href: "/stats",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6"  y1="20" x2="6"  y2="14" />
      </svg>
    ),
  },
  {
    label: "Ladder",
    href: "/ladder",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6"  y1="2"  x2="6"  y2="22" />
        <line x1="18" y1="2"  x2="18" y2="22" />
        <line x1="6"  y1="7"  x2="18" y2="7"  />
        <line x1="6"  y1="12" x2="18" y2="12" />
        <line x1="6"  y1="17" x2="18" y2="17" />
      </svg>
    ),
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    label: "Power Rankings",
    href: "/power-rankings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function GlobalSideDrawer() {
  const pathname = usePathname();
  const hideAvatarButton = pathname?.startsWith("/match/");
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const user = session.user;
      supabase
        .from("profiles")
        .select("avatar_url, username")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          setAvatarUrl(data.avatar_url ?? null);
          setUsername(data.username ?? null);
          const label = data.username || user.email?.split("@")[0] || "?";
          setInitials(label[0].toUpperCase());
        });
    });
  }, []);

  useEffect(() => {
    if (hideAvatarButton) setOpen(false);
  }, [hideAvatarButton]);

  return (
    <>
      {/* ── Fixed avatar button — sits in every tab's top-left ── */}
      {!hideAvatarButton && (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: 14,
          zIndex: 60,
          width: 36,
          height: 36,
          borderRadius: "50%",
          padding: 0,
          border: "none",
          cursor: "pointer",
          overflow: "hidden",
          background: "#1e293b",
          boxShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="me"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #1e3a5f, #0f172a)",
              color: "#94a3b8",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {initials}
          </div>
        )}
      </button>
      )}

      {/* ── Backdrop ── */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* ── Drawer panel ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 80,
          width: 272,
          background: "#090909",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Profile section */}
        <div
          style={{
            padding: "22px 20px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: "linear-gradient(135deg,#1e3a5f,#0f172a)",
              border: "2px solid rgba(255,255,255,0.1)",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94a3b8",
                  fontSize: 20,
                  fontWeight: 800,
                }}
              >
                {initials}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            {username ? (
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                @{username}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>Not signed in</div>
            )}
            <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, marginTop: 2, letterSpacing: "0.04em" }}>MENU</div>
          </div>
        </div>

        {/* Nav rows */}
        <div style={{ flex: 1 }}>
          {NAV_ITEMS.map(({ label, href, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: "#d1d5db",
                fontSize: 15,
                fontWeight: 650,
                textDecoration: "none",
                letterSpacing: "-0.01em",
                transition: "background 0.12s ease",
              }}
            >
              <span style={{ color: "#6b7280", flexShrink: 0 }}>{icon}</span>
              {label}
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <ellipse cx="12" cy="12" rx="10" ry="7" stroke="#2a2a2a" strokeWidth="2.5" />
            <path d="M5 12 Q12 5 19 12 Q12 19 5 12Z" fill="#2a2a2a" opacity="0.6" />
          </svg>
          <span style={{ color: "#2a2a2a", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>FOOPY</span>
        </div>
      </div>
    </>
  );
}
