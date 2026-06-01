"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

export const NOTIF_LAST_SEEN_KEY = "foopy_notif_last_seen";

export default function TopBar() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  // Keep ref in sync so the realtime handler always sees the current route
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Clear badge whenever the user navigates to the notifications page
  useEffect(() => {
    if (pathname === "/notifications") {
      localStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString());
      setUnread(0);
    }
  }, [pathname]);

  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function countNew(uid: string) {
      // If the user is currently viewing notifications, keep the badge at 0
      if (pathnameRef.current === "/notifications") {
        localStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString());
        setUnread(0);
        return;
      }
      const lastSeen = localStorage.getItem(NOTIF_LAST_SEEN_KEY) ?? new Date(0).toISOString();
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gt("created_at", lastSeen);
      setUnread(count ?? 0);
    }

    async function init() {
      const { data } = await supabase.auth.getSession();
      userId = data?.session?.user?.id ?? null;
      if (!userId) return;

      await countNew(userId);

      // Only re-count when new notifications are inserted
      channel = supabase
        .channel("notif-badge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => countNew(userId!)
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  function handleBellClick() {
    // Instantly clear the badge and record when the user last checked
    localStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString());
    setUnread(0);
  }

  return (
    <header className="app-header">
      <Link href="/" className="app-logo-link">
        <span className="app-logo-icon">
          <Activity size={17} />
        </span>
        <span className="app-logo-text">Foopy</span>
      </Link>

      <Link
        href="/notifications"
        onClick={handleBellClick}
        style={{ position: "relative", color: "inherit", display: "flex", alignItems: "center", padding: "4px 6px" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)" }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 0,
            minWidth: 16, height: 16,
            background: "#ef4444",
            borderRadius: 999,
            fontSize: 10, fontWeight: 800,
            color: "var(--text-1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </header>
  );
}
