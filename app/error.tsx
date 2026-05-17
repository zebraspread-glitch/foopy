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
      background: "#14141e",
      color: "#fff",
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
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 950 }}>Something went wrong</h2>
        <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 14 }}>
          {error?.message || "An unexpected error occurred."}
        </p>
        {error?.digest && (
          <p style={{ margin: 0, color: "#334155", fontSize: 11, fontFamily: "monospace" }}>
            {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        style={{
          padding: "13px 28px", borderRadius: 14, border: "none",
          background: "linear-gradient(135deg,#3b82f6,#6366f1)",
          color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
