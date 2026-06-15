import { StoreItemSkeleton } from "@/app/components/Skeleton";

/* Route-level shell shown the instant you tap into the Store, before the
   page chunk runs. Mirrors the page's own loading skeleton grid. */
export default function Loading() {
  return (
    <main
      className="store-page"
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        paddingBottom: "calc(var(--nav-h) + 22px)",
        padding: "calc(env(safe-area-inset-top) + 20px) 16px 0",
      }}
    >
      <StoreItemSkeleton count={8} />
    </main>
  );
}
