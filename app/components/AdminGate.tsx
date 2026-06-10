"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";

/**
 * Gates admin pages: only renders children if the signed-in user is verified
 * server-side as an admin (via /api/admin/verify). Replaces the old hardcoded
 * client-side password.
 */
export default function AdminGate({ children, title = "Admin" }: { children: React.ReactNode; title?: string }) {
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { if (active) setState("denied"); return; }
      try {
        const res = await fetch("/api/admin/verify", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => null);
        if (active) setState(json?.admin ? "ok" : "denied");
      } catch {
        if (active) setState("denied");
      }
    })();
    return () => { active = false; };
  }, []);

  if (state === "ok") return <>{children}</>;

  return (
    <main className="page grid">
      <section className="card" style={{ maxWidth: 420, margin: "80px auto", textAlign: "center" }}>
        <span className="pill">{title}</span>
        {state === "checking" ? (
          <p className="muted" style={{ marginTop: 16 }}>Checking access…</p>
        ) : (
          <>
            <h1 style={{ marginTop: 8 }}>Not authorised</h1>
            <p className="muted">You must be signed in as an admin to view this page.</p>
          </>
        )}
      </section>
    </main>
  );
}
