"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button onClick={() => router.back()} style={{ border: "none", background: "transparent", color: "#60a5fa", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: 0 }}>
      ← Back
    </button>
  );
}

export function TeamLogoImage({ src, name, color }: { src: string; name: string; color: string }) {
  const [err, setErr] = useState(false);
  const initials = name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div style={{ width: 100, height: 100, borderRadius: "50%", background: color, border: "3px solid #080808", boxShadow: "0 0 0 2px rgba(255,255,255,.12)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {!err
        ? <img src={src} alt={name} onError={() => setErr(true)} style={{ width: "84%", height: "84%", objectFit: "contain" }} />
        : <span style={{ fontSize: 36, fontWeight: 950, color: "#fff" }}>{initials}</span>
      }
    </div>
  );
}
