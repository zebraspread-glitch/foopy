"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      style={{
        border: "none",
        background: "transparent",
        color: "#60a5fa",
        fontSize: 15,
        fontWeight: 900,
        cursor: "pointer",
        padding: 0,
      }}
    >
      Back
    </button>
  );
}

export function TeamLogoImage({ src, name, color }: { src: string; name: string; color: string }) {
  const [err, setErr] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        width: 82,
        height: 82,
        borderRadius: "50%",
        background: `${color}22`,
        border: "2px solid #080808",
        boxShadow: "0 0 0 1px rgba(255,255,255,.14)",
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!err ? (
        <img
          src={src}
          alt={name}
          onError={() => setErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span style={{ fontSize: 30, fontWeight: 950, color: "#fff" }}>{initials}</span>
      )}
    </div>
  );
}
