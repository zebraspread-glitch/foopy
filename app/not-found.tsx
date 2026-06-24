import Link from "next/link";
import type { CSSProperties } from "react";

export const metadata = {
  title: "Page not found | Foopy",
};

export default function NotFound() {
  return (
    <main style={page}>
      <div style={badge}>404</div>
      <h1 style={title}>Page not found</h1>
      <p style={body}>The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" style={btn}>Back to scores</Link>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: "24px",
  textAlign: "center",
};

const badge: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.12em",
  color: "rgba(255,255,255,0.35)",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.03em",
};

const body: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--text-3)",
  lineHeight: 1.5,
  maxWidth: 320,
};

const btn: CSSProperties = {
  marginTop: 6,
  padding: "13px 24px",
  borderRadius: 10,
  background: "#5865f2",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  textDecoration: "none",
};
