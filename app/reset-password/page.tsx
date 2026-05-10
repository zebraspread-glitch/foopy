"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setMessage("Password updated. Redirecting...");

    setTimeout(() => {
      router.push("/profile"); // back to login page
    }, 1500);
  }

  return (
    <main style={page} className="page-enter">
      <div style={wrap}>
        <div style={authCard}>
          <h1 style={authTitle}>Choose new password</h1>

          <p style={muted}>
            Enter a new password for your Foopy account.
          </p>

          <form onSubmit={updatePassword} style={form}>
            <input
              style={input}
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button style={primaryBtn} disabled={busy}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>

          {message && <p style={messageText}>{message}</p>}
        </div>
      </div>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#000000",
  color: "white",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const wrap: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "28px 16px 0",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const card: CSSProperties = {
  background: "#050505",
  border: "1px solid rgba(255,255,255,.13)",
  borderRadius: 15,
  boxShadow: "0 18px 45px rgba(0,0,0,.22)",
};

const authCard: CSSProperties = {
  ...card,
  padding: "32px 28px",
  maxWidth: 420,
  margin: "60px auto 0",
};

const authTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 950,
  margin: "0 0 6px",
};

const muted: CSSProperties = {
  fontSize: 14,
  color: "#9aa7b8",
  fontWeight: 650,
  margin: "4px 0",
};

const form: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 24,
};

const input: CSSProperties = {
  padding: "13px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.13)",
  background: "rgba(255,255,255,.04)",
  color: "white",
  fontSize: 15,
  fontWeight: 650,
  outline: "none",
};

const primaryBtn: CSSProperties = {
  marginTop: 4,
  padding: "13px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#3b82f6,#6366f1)",
  color: "white",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

const messageText: CSSProperties = {
  marginTop: 12,
  fontSize: 13,
  color: "#fbbf24",
  fontWeight: 700,
};