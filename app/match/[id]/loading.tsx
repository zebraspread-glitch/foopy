import type { CSSProperties } from "react";

/* Route-level shell shown the instant you tap into a match, while the
   (large) match page chunk + RSC payload load. Mirrors the page's own
   in-component loading skeleton (scoreboard + tabs + feed rows) so the
   handoff to the real page has no layout jump. Server component — zero
   client JS, renders immediately. */

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

export default function Loading() {
  return (
    <main style={pageStyle}>
      {/* Scoreboard skeleton — mirrors the real centered match header */}
      <div style={{ padding: "18px 20px 20px", borderBottom: "1px solid var(--border-2)", background: "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 60%, var(--bg) 100%)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14, maxWidth: 520, margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <div className="skeleton" style={{ width: 50, height: 50, borderRadius: "50%" }} />
            <div className="skeleton skeleton-line" style={{ width: 70, height: 11 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div className="skeleton" style={{ width: 104, height: 30, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 82, height: 24, borderRadius: 999 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <div className="skeleton" style={{ width: 50, height: 50, borderRadius: "50%" }} />
            <div className="skeleton skeleton-line" style={{ width: 70, height: 11 }} />
          </div>
        </div>
      </div>
      {/* Tab bar skeleton */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-2)", padding: "0 8px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, padding: "14px 4px", display: "flex", justifyContent: "center" }}>
            <div className="skeleton skeleton-line" style={{ width: 48 }} />
          </div>
        ))}
      </div>
      {/* Feed skeleton rows */}
      <div style={{ padding: "16px 16px 0" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 18, alignItems: "flex-start" }}>
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton skeleton-line" style={{ width: "40%" }} />
              <div className="skeleton skeleton-line" style={{ width: "80%" }} />
              <div className="skeleton skeleton-line" style={{ width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
