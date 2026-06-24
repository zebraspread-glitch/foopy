"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <main style={{
      minHeight: "100dvh",
      background: "var(--bg)",
      color: "var(--text-1)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      gap: 20,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>Something went wrong</h2>
        <p style={{ margin: "0 0 4px", color: "var(--text-3)", fontSize: 14 }}>
          We hit an unexpected error. Try again, or head back home.
        </p>
        {/* Support reference only — never surface the raw error message to users. */}
        {error?.digest && (
          <p style={{ margin: 0, color: "var(--text-4)", fontSize: 11, fontFamily: "monospace" }}>
            ref: {error.digest}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={reset}
          style={{
            padding: "12px 24px", borderRadius: 10, border: "none",
            background: "#5865f2", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "12px 24px", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
            color: "var(--text-2)", fontWeight: 700, fontSize: 15, textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}
        >
          Go home
        </a>
      </div>
    </main>
  );
}
