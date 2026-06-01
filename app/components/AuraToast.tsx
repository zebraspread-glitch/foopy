"use client";

import { useEffect, useState } from "react";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";
import { supabase } from "@/app/lib/supabase";

type Toast = { id: number; amount: number; reason: string; exiting: boolean };

export default function AuraToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Emitter-driven toasts (comments, likes, live game, daily login, etc.)
  useEffect(() => {
    return auraToastEmitter.subscribe((amount, reason) => {
      const id = Date.now() + Math.random();
      // Cap visible toasts at 3 — drop the oldest when a new one arrives
      setToasts(prev => [...prev.slice(-2), { id, amount, reason, exiting: false }]);
      // Begin exit animation
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      }, 2400);
      // Remove from DOM
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 2800);
    });
  }, []);

  // Poll-win notifications from Supabase realtime
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const userId = data.session?.user.id;
      if (!userId) return;

      channel = supabase
        .channel(`aura-poll-win-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            if (cancelled) return;
            if (payload.new?.type === "poll_win") {
              const aura = (payload.new?.data as any)?.aura ?? 0;
              if (aura > 0) auraToastEmitter.emit(aura, "winning a poll 🎯");
            }
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      zIndex: 99999,
      pointerEvents: "none",
      paddingTop: "calc(env(safe-area-inset-top) + 16px)",
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            background: "linear-gradient(135deg, #6d28d9 0%, #9333ea 100%)",
            border: "1px solid rgba(167,139,250,0.35)",
            borderRadius: 999,
            padding: "11px 22px",
            display: "flex",
            alignItems: "center",
            gap: 9,
            boxShadow: "0 8px 32px rgba(109,40,217,0.45), 0 2px 8px rgba(0,0,0,0.4)",
            animation: t.exiting
              ? "aura-toast-out 0.4s ease-in forwards"
              : "aura-toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>✨</span>
          <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>
            +{t.amount} Aura
          </span>
          {t.reason && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>
              {t.reason}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
