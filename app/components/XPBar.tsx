"use client";

type Props = {
  xp: number;
  compact?: boolean;
};

export default function XPBar({ xp }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: "13px",
        fontWeight: 800,
        color: "#4ade80",
        background: "rgba(74,222,128,0.12)",
        border: "1px solid rgba(74,222,128,0.2)",
        borderRadius: "999px",
        padding: "4px 12px",
        letterSpacing: "-0.2px",
        fontVariantNumeric: "tabular-nums",
      }}>
        {xp.toLocaleString()} XP
      </span>
    </div>
  );
}
