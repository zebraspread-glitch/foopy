import type { CSSProperties } from "react";

/* Route-level shell shown the instant you tap into a user's profile,
   while the page chunk + RSC payload load. Mirrors the page's own
   in-component loading skeleton (floating back button + hero card with
   banner/avatar/name) so the handoff has no layout jump. Server
   component — zero client JS, renders immediately.

   Note: no interactive back button here (that needs the router); a
   static placeholder keeps the layout identical until the page mounts. */

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(95px + env(safe-area-inset-bottom))",
};

const wrapStyle: CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "0 12px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const backBtnPlaceholderStyle: CSSProperties = {
  position: "fixed",
  top: "calc(env(safe-area-inset-top) + 12px)",
  left: 12,
  zIndex: 100,
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.45)",
};

export default function Loading() {
  return (
    <main style={pageStyle}>
      <div style={backBtnPlaceholderStyle} aria-hidden="true" />
      <div style={wrapStyle}>
        <div style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 18, overflow: "hidden" }}>
          <div className="skeleton" style={{ height: 155 }} />
          <div style={{ padding: "0 20px 20px", marginTop: -44 }}>
            <div className="skeleton" style={{ width: 88, height: 88, borderRadius: "50%", marginBottom: 14 }} />
            <div className="skeleton skeleton-line" style={{ width: 160, marginBottom: 10 }} />
            <div className="skeleton skeleton-line" style={{ width: 80 }} />
          </div>
        </div>
      </div>
    </main>
  );
}
