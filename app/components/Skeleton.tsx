/* ============================================================
   Reusable skeleton loaders
   ------------------------------------------------------------
   All built on the global `.skeleton` shimmer class (see
   globals.css) so they automatically follow the dark/light
   theme. Use these inside a page's content area while data
   loads — never block the whole page on a full-screen spinner.
   ============================================================ */

import type { CSSProperties } from "react";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
};

/** Generic shimmer block. The atom every other skeleton is built from. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--r-md)",
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** Single match/score card — mirrors the home & scores card footprint. */
export function MatchCardSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "16px 18px",
        background: "var(--surface-1)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--r-xl)",
        ...style,
      }}
      aria-hidden="true"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <Skeleton width={38} height={38} radius="50%" />
        <Skeleton width="45%" height={15} />
      </div>
      <Skeleton width={52} height={26} radius="var(--r-sm)" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
        <Skeleton width="45%" height={15} />
        <Skeleton width={38} height={38} radius="50%" />
      </div>
    </div>
  );
}

/** A list of match cards. */
export function MatchListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Feed section + a couple of event cards — matches the feed layout. */
export function FeedEventSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingTop: 8 }}>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i}>
          <Skeleton width={80} height={11} radius={6} style={{ marginLeft: 16 }} />
          <Skeleton height={130} radius={18} style={{ margin: "10px 16px 0" }} />
          <Skeleton height={130} radius={18} style={{ margin: "10px 16px 0" }} />
        </div>
      ))}
    </div>
  );
}

/** Player stat rows — for stats tables / leaderboards. */
export function StatsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px" }}
          aria-hidden="true"
        >
          <Skeleton width={18} height={14} radius={5} />
          <Skeleton width={32} height={32} radius="50%" />
          <Skeleton width="40%" height={13} />
          <Skeleton width={40} height={13} radius={5} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

/** Comment rows — avatar + two text lines. */
export function CommentSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "8px 16px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 10 }} aria-hidden="true">
          <Skeleton width={34} height={34} radius="50%" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <Skeleton width="30%" height={11} radius={5} />
            <Skeleton width="85%" height={12} radius={5} />
            <Skeleton width="55%" height={12} radius={5} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Store cosmetic tile grid — mirrors `.store-product` tiles. Uses a
    self-contained auto-fill grid so it renders correctly both inside the
    store page and in store/loading.tsx (where `.store-grid` isn't loaded). */
export function StoreItemSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 14,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            minHeight: 190,
            borderRadius: 12,
            border: "1px solid var(--border-2)",
            background: "var(--surface-1)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
          aria-hidden="true"
        >
          <Skeleton height={96} radius={10} />
          <Skeleton width="70%" height={12} radius={5} />
          <Skeleton width="40%" height={11} radius={5} />
          <Skeleton height={30} radius={8} style={{ marginTop: "auto" }} />
        </div>
      ))}
    </div>
  );
}

/** Notification rows — icon + two text lines. */
export function NotificationSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}
          aria-hidden="true"
        >
          <Skeleton width={40} height={40} radius="50%" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <Skeleton width="70%" height={12} radius={5} />
            <Skeleton width="40%" height={11} radius={5} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Profile header + tabs + content — for the signed-in profile load. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden="true">
      {/* Banner */}
      <Skeleton height={140} radius={0} />
      {/* Avatar + name */}
      <div style={{ padding: "0 20px", marginTop: -36, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton width={88} height={88} radius="50%" style={{ border: "4px solid var(--bg)" }} />
        <Skeleton width="45%" height={20} radius={6} />
        <Skeleton width="30%" height={13} radius={5} />
      </div>
      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 12, padding: "20px 20px 0" }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={64} radius="var(--r-lg)" style={{ flex: 1 }} />
        ))}
      </div>
      {/* Content cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
        <Skeleton height={110} radius="var(--r-lg)" />
        <Skeleton height={110} radius="var(--r-lg)" />
      </div>
    </div>
  );
}

/** Card collection grid — matches `.cards-grid` tiles. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 14,
        padding: "4px 16px",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} radius={18} style={{ aspectRatio: "3 / 4" }} />
      ))}
    </div>
  );
}
