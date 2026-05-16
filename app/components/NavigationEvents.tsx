"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PREFETCH_ROUTES = ["/", "/ladder", "/cards", "/feed", "/dms", "/profile", "/search", "/stats", "/team-stats"];

export default function NavigationEvents() {
  const router = useRouter();

  useEffect(() => {
    PREFETCH_ROUTES.forEach(r => router.prefetch(r));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
