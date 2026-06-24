"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { auraToastEmitter } from "@/app/lib/auraToastEmitter";

// Awards the once-per-day "daily login" Aura the moment a signed-in user
// loads ANY page (not just their profile). Mounted globally in the root
// layout. The server (/api/aura/award) dedupes per calendar day, so firing
// on every load is safe — only the first qualifying load each day awards.
export default function DailyAuraCollector() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      if (fired.current) return;
      fired.current = true;

      const today = new Date().toISOString().split("T")[0];
      fetch("/api/aura/award", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_type: "daily_login", related_id: today }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.awarded) auraToastEmitter.emit(10, "daily login"); })
        .catch(() => {});
    });
  }, []);

  return null;
}
