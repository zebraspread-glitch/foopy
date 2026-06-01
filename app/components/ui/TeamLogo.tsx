"use client";

import { useState } from "react";

/**
 * Team logo with graceful initials fallback.
 *
 * Tries to load /team-logos/{slug}.png where slug is the lowercased,
 * space-replaced-with-dash team name (e.g. "Brisbane Lions" → "brisbane-lions").
 *
 * Props:
 *   team       — full team name string (e.g. "Geelong Cats")
 *   size       — width/height in px
 *   className  — optional extra className
 */

function toSlug(team: string) {
  return team.toLowerCase().replace(/\s+/g, "-");
}

function initials(team: string) {
  return team
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export default function TeamLogo({
  team,
  size,
  className,
}: {
  team: string;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const slug = toSlug(team);
  const abbr = initials(team);

  if (failed) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.25,
          background: "var(--surface-3)",
          border: "1px solid var(--border-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.32,
          fontWeight: 900,
          color: "var(--text-2)",
          letterSpacing: "-0.03em",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {abbr}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/team-logos/${slug}.png`}
      alt={team}
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}
