import { Skeleton, NotificationSkeleton } from "@/app/components/Skeleton";

/* Route-level shell shown the instant you tap into DMs, before the page
   chunk runs. Mirrors the page's own not-ready inbox skeleton. */
export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 700, borderInline: "0.5px solid var(--border-2)" }}>
        <div style={{ padding: "calc(env(safe-area-inset-top) + 14px) 16px 12px", borderBottom: "0.5px solid var(--border-2)" }}>
          <Skeleton width={140} height={26} radius={8} style={{ marginBottom: 12 }} />
          <Skeleton height={40} radius={12} style={{ marginBottom: 10 }} />
          <Skeleton height={38} radius={10} />
        </div>
        <NotificationSkeleton count={7} />
      </div>
    </main>
  );
}
