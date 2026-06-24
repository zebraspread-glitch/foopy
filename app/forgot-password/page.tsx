"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill the email when arriving from the Sign In page's "Forgot password?"
  // link (which passes ?email=). Read from the URL directly so we don't need a
  // Suspense boundary around useSearchParams.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("email");
    if (fromUrl) setEmail(fromUrl);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setMessage(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main style={pageStyle} className="page-enter">
        <div style={containerStyle}>
          <div style={{ ...iconStyle, background: "#22c55e" }}>
            <Mail size={28} color="white" />
          </div>
          <h1 style={titleStyle}>Check your email</h1>
          <p style={bodyStyle}>
            We sent a password reset link to <strong style={{ color: "var(--text-2)" }}>{email}</strong>. Click it to set a new password.
          </p>
          <Link href="/login" style={backBtnStyle}>
            <ArrowLeft size={16} />
            Back to Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle} className="page-enter">
      <div style={containerStyle}>
        <div style={iconStyle}>
          <Mail size={28} color="white" />
        </div>
        <h1 style={titleStyle}>Reset password</h1>
        <p style={bodyStyle}>Enter your email and we'll send you a link to reset your password.</p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={fieldWrapStyle}>
            <div style={fieldIconStyle}><Mail size={15} color="#64748b" /></div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>

          {message && <p style={errorStyle}>{message}</p>}

          <button type="submit" disabled={loading} style={{ ...submitBtnStyle, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Sending…" : <><span>Send reset link</span><ArrowRight size={17} /></>}
          </button>
        </form>

        <Link href="/login" style={linkStyle}>
          <ArrowLeft size={14} />
          Back to Sign In
        </Link>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px calc(90px + env(safe-area-inset-bottom))",
};

const containerStyle: CSSProperties = {
  width: "100%",
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 20,
};

const iconStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 16,
  background: "#5865f2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  textAlign: "center",
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--text-3)",
  fontWeight: 500,
  textAlign: "center",
  lineHeight: 1.5,
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "100%",
};

const fieldWrapStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const fieldIconStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  display: "flex",
  alignItems: "center",
  pointerEvents: "none",
  zIndex: 1,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px 13px 40px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text-1)",
  fontSize: 15,
  fontWeight: 400,
  outline: "none",
};

const errorStyle: CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(239,68,68,.12)",
  border: "1px solid rgba(239,68,68,.25)",
  color: "#fca5a5",
  fontSize: 13,
  fontWeight: 700,
};

const submitBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "14px",
  borderRadius: 10,
  border: "none",
  background: "#5865f2",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  cursor: "pointer",
};

const linkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(255,255,255,0.45)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const backBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "13px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  width: "100%",
  justifyContent: "center",
};
