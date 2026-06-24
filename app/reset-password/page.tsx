"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
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
            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, width: "100%", paddingRight: 44 }}
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} style={eyeBtn} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <input
                style={{ ...input, width: "100%", paddingRight: 44 }}
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} style={eyeBtn} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                {showConfirmPassword ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
              </button>
            </div>

            {confirmPassword.length > 0 && password !== confirmPassword && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>Passwords don&apos;t match</span>
            )}

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
  background: "var(--bg)",
  color: "var(--text-1)",
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
  background: "var(--bg)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 12,
};

const authCard: CSSProperties = {
  ...card,
  padding: "32px 28px",
  maxWidth: 420,
  margin: "60px auto 0",
};

const authTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.03em",
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
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontSize: 15,
  fontWeight: 650,
  outline: "none",
};

const eyeBtn: CSSProperties = {
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.3)",
  cursor: "pointer",
  padding: 0,
  display: "flex",
};

const primaryBtn: CSSProperties = {
  marginTop: 4,
  padding: "14px",
  borderRadius: 10,
  border: "none",
  background: "#5865f2",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: "-0.01em",
  cursor: "pointer",
};

const messageText: CSSProperties = {
  marginTop: 12,
  fontSize: 13,
  color: "#fbbf24",
  fontWeight: 700,
};