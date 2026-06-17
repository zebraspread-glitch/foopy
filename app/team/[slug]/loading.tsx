import { TeamProfileSkeleton } from "@/app/components/Skeleton";

// Shown instantly during navigation while the team profile server component
// renders, so the page appears immediately instead of waiting on data.
export default function Loading() {
  return <TeamProfileSkeleton />;
}
