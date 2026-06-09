"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { finalizePendingProfile } from "@/app/lib/finalizePendingProfile";

type Status = "verifying" | "success" | "error";

export default function WelcomePage() {
  const [status, setStatus] = useState<Status>("verifying");

  useEffect(() => {
    let done = false;

    async function finish(user: { id: string; user_metadata?: Record<string, unknown> | null }) {
      if (done) return;
      done = true;
      // Create/fill the profile from the username + team chosen at signup.
      try { await finalizePendingProfile(user); } catch { /* non-fatal */ }
      setStatus("success");
    }

    // The session arrives in the URL hash; supabase-js processes it on load.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) finish(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(session.user);
    });

    // If no session shows up, the link was expired or already used.
    const timeout = setTimeout(() => {
      if (!done) setStatus("error");
    }, 6000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  return (
    <main style={page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={wrap}>

        {status === "verifying" && (
          <>
            <div style={appIcon}>
              <Activity size={26} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{ width: 26, height: 26, border: "3px solid rgba(255,255,255,.15)", borderTopColor: "#5865f2", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <p style={sub}>Verifying your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ ...appIcon, background: "#22c55e" }}>
              <CheckCircle2 size={28} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={h1}>You're verified! 🎉</h1>
              <p style={sub}>Welcome to Foopy — your account is all set up and ready to go.</p>
            </div>
            <Link href="/profile" style={primaryBtn}>Continue to Foopy</Link>
            <p style={{ ...sub, fontSize: 12, marginTop: 0 }}>You can safely close this tab.</p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ ...appIcon, background: "#ef4444" }}>
              <AlertCircle size={28} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={h1}>Link expired</h1>
              <p style={sub}>This confirmation link has expired or has already been used. Try signing in — if it doesn't work, sign up again.</p>
            </div>
            <Link href="/login" style={primaryBtn}>Go to Sign In</Link>
          </>
        )}

      </div>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
};

const wrap: CSSProperties = {
  width: "100%",
  maxWidth: 340,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
};

const appIcon: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 16,
  background: "#5865f2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const h1: CSSProperties = {
  margin: 0,
  fontSize: 23,
  fontWeight: 900,
  color: "var(--text-1)",
  letterSpacing: "-0.03em",
};

const sub: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  color: "var(--text-3)",
  fontWeight: 500,
  textAlign: "center",
  lineHeight: 1.55,
};

const primaryBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "14px",
  borderRadius: 10,
  border: "none",
  background: "#5865f2",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};
