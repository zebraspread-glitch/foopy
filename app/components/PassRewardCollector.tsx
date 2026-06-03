"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";

export default function PassRewardCollector() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      if (fired.current) return;
      fired.current = true;

      fetch("/api/passes/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((result) => {
          if (result.claimed > 0 && result.totalAura > 0) {
            auraToastEmitter.emit(result.totalAura, "pass rewards");
          }
        })
        .catch(() => {});
    });
  }, []);

  return null;
}
