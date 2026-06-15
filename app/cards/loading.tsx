import { CardGridSkeleton } from "@/app/components/Skeleton";

/* Route-level shell shown the instant you tap into Cards, before the
   page chunk runs. Mirrors the page's own auth-loading skeleton so the
   transition is seamless. */
export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          padding: "calc(env(safe-area-inset-top) + 12px) 18px 12px 58px",
          background: "var(--bottom-nav-bg)",
          backdropFilter: "blur(28px) saturate(200%)",
          WebkitBackdropFilter: "blur(28px) saturate(200%)",
          borderBottom: "0.5px solid var(--border-2)",
        }}
      >
        <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 18, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.01em" }}>Cards</span>
      </header>
      <CardGridSkeleton count={6} />
    </main>
  );
}
