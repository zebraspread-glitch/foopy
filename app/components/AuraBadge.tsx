import Link from "next/link";
import type { CSSProperties } from "react";

export default function AuraBadge({ aura, href }: { aura: number; href?: string }) {
  const badge = (
    <div style={badgeStyle}>
      <span style={sparkStyle}>✦</span>
      <span style={labelStyle}>{aura.toLocaleString()} Aura</span>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: "none" }}>{badge}</Link>;
  }
  return badge;
}

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 999,
  background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.12), rgba(245,158,11,0.08))",
  border: "1px solid rgba(139,92,246,0.35)",
  boxShadow: "0 0 14px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const sparkStyle: CSSProperties = {
  fontSize: 11,
  background: "linear-gradient(135deg, #c084fc, #60a5fa, #fbbf24)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  lineHeight: 1,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};
