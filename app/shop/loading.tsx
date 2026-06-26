import type { CSSProperties } from "react";

/* Route-level shell shown the instant you tap into the Pack Shop, while
   the page chunk loads. Mirrors the page's header + centered pack card so
   the handoff has no layout jump. Server component — zero client JS. */

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  paddingTop: "env(safe-area-inset-top)",
};

export default function Loading() {
  return (
    <main style={pageStyle}>
      {/* Title — matches the page's "FOOPY CARDS / Pack Shop" header */}
      <div style={{ textAlign: "center", padding: "32px 20px 0", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".18em", color: "rgba(255,255,255,.35)", marginBottom: 6 }}>FOOPY CARDS</div>
        <div style={{ fontSize: 26, fontWeight: 1000, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Pack Shop</div>
      </div>
      {/* Centered pack-shaped placeholder — mirrors the pack carousel item */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 40px 40px" }}>
        <div
          className="skeleton"
          style={{ width: "min(300px, 76vw)", aspectRatio: "3 / 4", borderRadius: 22 }}
          aria-hidden="true"
        />
      </div>
    </main>
  );
}
