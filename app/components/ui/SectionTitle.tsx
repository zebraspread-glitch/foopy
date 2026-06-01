import type { CSSProperties, ReactNode } from "react";

/**
 * Section label — uppercase, small, heavy.
 *
 * Props:
 *   children  — label text
 *   accent    — optional colour string (CSS value, e.g. team hex)
 */
export default function SectionTitle({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: accent ?? "var(--text-3)",
        lineHeight: 1,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
