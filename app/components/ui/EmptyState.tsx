import type { CSSProperties, ReactNode } from "react";

/**
 * Empty / no-data state — centred, muted, clean.
 *
 * Props:
 *   icon      — emoji string or JSX element
 *   title     — primary message
 *   subtitle  — secondary muted message (optional)
 *   style     — additional container styles
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  style,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "48px 24px",
        textAlign: "center",
        ...style,
      }}
    >
      <span style={{ fontSize: 40, lineHeight: 1 }}>{icon}</span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-2)",
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
        }}
      >
        {title}
      </span>
      {subtitle && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-3)",
            lineHeight: 1.4,
            maxWidth: 280,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
