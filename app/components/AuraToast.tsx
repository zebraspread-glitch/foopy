"use client";

import { useEffect, useState } from "react";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";

type Toast = { id: number; amount: number; reason: string };

export default function AuraToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return auraToastEmitter.subscribe((amount, reason) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, amount, reason }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 2800);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: "env(safe-area-inset-top, 16px)",
      left: 0,
      right: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      zIndex: 99999,
      pointerEvents: "none",
      paddingTop: 16,
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
            animation: "aura-toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
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
