import { ProfileSkeleton } from "@/app/components/Skeleton";

/* Route-level shell shown the instant you tap into Profile, before the
   page chunk runs. Mirrors the page's own loading skeleton. */
export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
      }}
    >
      <ProfileSkeleton />
    </main>
  );
}
