import { PlayerProfileSkeleton } from "@/app/components/Skeleton";

// Shown instantly during navigation while the dynamic server component
// (player profile) fetches its data, so the page appears immediately.
export default function Loading() {
  return <PlayerProfileSkeleton />;
}
