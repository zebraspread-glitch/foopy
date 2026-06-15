"use client";

import { supabase } from "@/app/lib/supabase";
import { formatAura, formatCoins } from "@/app/lib/format";
import { nameColorStyle, avatarFrameStyle } from "@/app/lib/cosmetics";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { showsDrawerButton } from "@/app/lib/navRoutes";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: { label: string; href: string; icon: React.ReactNode }[];
};

const NAV_ITEMS: NavItem[] = [
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
    label: "Store",
    href: "/store",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l1.5-5h15L21 9" />
        <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" />
        <path d="M9 13h6" />
      </svg>
    ),
  },
  {
    label: "Aura",
    href: "/aura",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2 L13.8 8.2 L20 8.2 L14.9 11.8 L16.7 18 L12 14.4 L7.3 18 L9.1 11.8 L4 8.2 L10.2 8.2 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none"/>
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
    label: "Power Rankings",
    href: "/power-rankings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    label: "Stats",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6"  y1="20" x2="6"  y2="14" />
      </svg>
    ),
    children: [
      {
        label: "Player Stats",
        href: "/stats",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        ),
      },
      {
        label: "Team Stats",
        href: "/team-stats",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        label: "Records",
        href: "/records",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="6" />
            <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
          </svg>
        ),
      },
      {
        label: "Seasons",
        href: "/seasons",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Birthdays",
    href: "/birthdays",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="18" height="9" rx="2" />
        <rect x="6" y="8" width="12" height="4" rx="1.5" />
        <line x1="8" y1="8" x2="8" y2="5" />
        <line x1="12" y1="8" x2="12" y2="5" />
        <line x1="16" y1="8" x2="16" y2="5" />
        <circle cx="8"  cy="4.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="12" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="16" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
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

const navRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "16px 20px",
  fontSize: 15,
  fontWeight: 650,
  textDecoration: "none",
  letterSpacing: "-0.01em",
  transition: "background 0.12s ease",
};

export default function GlobalSideDrawer() {
  const pathname = usePathname();
  // Profile button (opens the drawer) lives on the root tab sections only.
  // Pushed/detail screens get a back arrow from PageHeader instead.
  const showAvatarButton = showsDrawerButton(pathname);
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [initials, setInitials] = useState("?");
  const [aura, setAura] = useState<number>(0);
  const [coins, setCoins] = useState<number>(0);
  const [nameColor, setNameColor] = useState<string | null>(null);
  const [frameAsset, setFrameAsset] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // Auto-expand a group when the current route is one of its children.
  useEffect(() => {
    const current = pathname?.replace(/\/$/, "") ?? "";
    for (const item of NAV_ITEMS) {
      if (item.children?.some((c) => current === c.href || current.startsWith(c.href + "/"))) {
        setOpenGroups((prev) => (prev.has(item.label) ? prev : new Set(prev).add(item.label)));
      }
    }
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const user = session.user;
      supabase
        .from("profiles")
        .select("avatar_url, username, aura, coins, name_color, avatar_frame")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          setAvatarUrl(data.avatar_url ?? null);
          setUsername(data.username ?? null);
          setAura(data.aura ?? 0);
          setCoins(data.coins ?? 0);
          setNameColor(data.name_color ?? null);
          setFrameAsset(data.avatar_frame ?? null);
          const label = data.username || user.email?.split("@")[0] || "?";
          setInitials(label[0].toUpperCase());
        });
    });
  }, []);

  useEffect(() => {
    if (!showAvatarButton) setOpen(false);
  }, [showAvatarButton]);

  return (
    <>
      {/* ── Fixed avatar button — only on primary app tabs ── */}
      {showAvatarButton && (
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
          background: "var(--surface-3)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.35), 0 0 0 1.5px var(--border-2)",
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
              background: "linear-gradient(135deg, var(--surface-3), var(--surface-1))",
              color: "var(--text-2)",
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
          background: "var(--surface-1)",
          borderRight: "1px solid var(--border-1)",
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
            borderBottom: "1px solid var(--border-1)",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <div style={avatarFrameStyle(frameAsset) ?? undefined}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: "linear-gradient(135deg, var(--surface-3), var(--surface-1))",
              border: "2px solid var(--border-2)",
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
                  color: "var(--text-2)",
                  fontSize: 20,
                  fontWeight: 800,
                }}
              >
                {initials}
              </div>
            )}
          </div>
          </div>
          <div style={{ minWidth: 0 }}>
            {username ? (
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...nameColorStyle(nameColor) }}>
                @{username}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 600 }}>Not signed in</div>
            )}
            {username && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, background: "linear-gradient(135deg, #c084fc, #60a5fa, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>✦</span>
                  <span style={{ fontSize: 13, fontWeight: 800, background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{formatAura(aura)} Aura</span>
                </div>
                <span style={{ color: "var(--border-2)" }}>·</span>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <img src="/coin/coin.png" alt="" style={{ width: 13, height: 13, objectFit: "contain" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>{formatCoins(coins)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nav rows */}
        <div style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) =>
            item.children ? (
              <div key={item.label}>
                {/* Group header — toggles the submenu */}
                <button
                  onClick={() => toggleGroup(item.label)}
                  style={{
                    ...navRowStyle,
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      marginLeft: "auto",
                      color: "var(--text-3)",
                      transform: openGroups.has(item.label) ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Submenu */}
                <div
                  style={{
                    overflow: "hidden",
                    maxHeight: openGroups.has(item.label) ? `${item.children.length * 56}px` : 0,
                    transition: "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setOpen(false)}
                      style={{
                        ...navRowStyle,
                        paddingLeft: 30,
                        fontSize: 14,
                        fontWeight: 600,
                        color: pathname === child.href ? "var(--text-1)" : "var(--text-2)",
                        background: pathname === child.href ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{child.icon}</span>
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => setOpen(false)}
                style={{ ...navRowStyle, color: "var(--text-1)" }}
              >
                <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid var(--border-1)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-3)" }}>
            <ellipse cx="12" cy="12" rx="10" ry="7" stroke="currentColor" strokeWidth="2.5" />
            <path d="M5 12 Q12 5 19 12 Q12 19 5 12Z" fill="currentColor" opacity="0.6" />
          </svg>
          <span style={{ color: "var(--text-3)", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>FOOPY</span>
        </div>
      </div>
    </>
  );
}
