import type { CSSProperties } from "react";

/**
 * Loading skeleton block — pulsing background, no content.
 *
 * Props:
 *   width         — CSS width value (default "100%")
 *   height        — CSS height value (required)
 *   borderRadius  — CSS border-radius (default "8px")
 *   style         — additional inline styles
 */
export default function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = "8px",
  style,
}: {
  width?: CSSProperties["width"];
  height: CSSProperties["height"];
  borderRadius?: CSSProperties["borderRadius"];
  style?: CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
