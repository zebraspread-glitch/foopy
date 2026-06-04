import Link from "next/link";
import type { CSSProperties } from "react";
import { formatAura } from "@/app/lib/format";

export default function AuraBadge({ aura, href }: { aura: number; href?: string }) {
  const badge = (
    <div style={badgeStyle}>
      <span style={sparkStyle}>✦</span>
      <span style={labelStyle}>{formatAura(aura)} Aura</span>
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
  gap: 6,
};

const sparkStyle: CSSProperties = {
  fontSize: 22,
  background: "linear-gradient(135deg, #c084fc, #60a5fa, #fbbf24)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  lineHeight: 1,
};

const labelStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #fbbf24 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};
