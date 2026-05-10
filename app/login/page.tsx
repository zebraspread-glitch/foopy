"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Eye, EyeOff, Mail, Lock, AtSign, ArrowRight } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode]               = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [username, setUsername]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [checkEmail, setCheckEmail]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }

    setLoading(true);

    if (mode === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      router.push("/profile");
      return;
    }

    // ── Signup ──
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanUsername.length < 3) {
      setError("Username needs at least 3 characters (a–z, 0–9, _)");
      setLoading(false); return;
    }

    // Check username availability before creating account
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existing) {
      setError("That username is already taken — try another.");
      setLoading(false); return;
    }

    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }

    if (!data.user?.identities?.length) {
      setError("An account with this email already exists. Try signing in.");
      setLoading(false); return;
    }

    // Save username — if we have a session do it now, otherwise store for after confirmation
    if (data.session && data.user) {
      // Use upsert so it works whether or not the trigger has created the row yet
      const { error: upsertErr } = await supabase.from("profiles").upsert({
        id: data.user.id,
        username: cleanUsername,
        display_name: cleanUsername,
        username_updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (upsertErr) {
        // Store as pending so profile page can retry on load
        localStorage.setItem("foopy_pending_username", cleanUsername);
      }
      router.push("/profile");
    } else {
      // Email confirmation required — store username so profile page can apply it on first login
      localStorage.setItem("foopy_pending_username", cleanUsername);
      setCheckEmail(true);
    }

    setLoading(false);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setUsername("");
  }

  if (checkEmail) {
    return (
      <main style={pageStyle} className="page-enter">
        <div style={containerStyle}>
          <div style={{ ...logoIconStyle, background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
            <Mail size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 950, textAlign: "center", margin: "8px 0 6px" }}>Check your email</h1>
          <p style={{ color: "#64748b", textAlign: "center", fontSize: 14, fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
            We sent a confirmation link to <strong style={{ color: "#94a3b8" }}>{email}</strong>.<br />
            Click it to activate your account, then sign in.
          </p>
          <button onClick={() => { setCheckEmail(false); setMode("login"); }} style={guestBtnStyle}>
            Back to Sign In
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle} className="page-enter">
      <div style={containerStyle}>

        {/* Logo */}
        <div style={logoAreaStyle}>
          <div style={logoIconStyle}>
            <Activity size={28} color="white" />
          </div>
          <span style={logoTextStyle}>Foopy</span>
          <p style={taglineStyle}>AFL live scores, picks &amp; stats</p>
        </div>

        {/* Mode toggle */}
        <div style={modeToggleStyle}>
          <button onClick={() => switchMode("login")}
            style={{ ...modeBtnStyle, ...(mode === "login" ? modeActiveBtnStyle : {}) }}>
            Sign In
          </button>
          <button onClick={() => switchMode("signup")}
            style={{ ...modeBtnStyle, ...(mode === "signup" ? modeActiveBtnStyle : {}) }}>
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={fieldWrapStyle}>
            <div style={fieldIconStyle}><Mail size={15} color="#64748b" /></div>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address" autoComplete="email" required style={inputStyle}
            />
          </div>

          <div style={fieldWrapStyle}>
            <div style={fieldIconStyle}><Lock size={15} color="#64748b" /></div>
            <input
              type={showPassword ? "text" : "password"}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required style={{ ...inputStyle, paddingRight: 48 }}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={eyeBtnStyle}>
              {showPassword ? <EyeOff size={16} color="#64748b" /> : <Eye size={16} color="#64748b" />}
            </button>
          </div>

          {/* Username field — signup only */}
          {mode === "signup" && (
            <div style={fieldWrapStyle}>
              <div style={fieldIconStyle}><AtSign size={15} color="#64748b" /></div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Choose a username"
                maxLength={20}
                autoComplete="off"
                required
                style={inputStyle}
              />
            </div>
          )}

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" disabled={loading} style={{ ...submitBtnStyle, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait…" : (
              <>{mode === "login" ? "Sign In" : "Create Account"}<ArrowRight size={17} /></>
            )}
          </button>
        </form>

        <div style={dividerStyle}>
          <span style={dividerLineStyle} />
          <span style={dividerTextStyle}>or</span>
          <span style={dividerLineStyle} />
        </div>

        <a href="/" style={guestBtnStyle}>Browse without an account</a>
      </div>
    </main>
  );
}

/* ── Styles ── */

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh", background: "#000", color: "white",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "calc(32px + env(safe-area-inset-top)) 20px calc(90px + env(safe-area-inset-bottom))",
};
const containerStyle: React.CSSProperties = {
  width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 20,
};
const logoAreaStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 8,
};
const logoIconStyle: React.CSSProperties = {
  width: 64, height: 64, borderRadius: 18,
  background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 8px 32px rgba(99,102,241,.45)", marginBottom: 4,
};
const logoTextStyle: React.CSSProperties = { fontSize: 28, fontWeight: 950, letterSpacing: "-0.05em" };
const taglineStyle:  React.CSSProperties = { margin: 0, fontSize: 13, color: "#475569", fontWeight: 700 };
const modeToggleStyle: React.CSSProperties = {
  display: "flex", padding: 4, borderRadius: 999,
  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
};
const modeBtnStyle: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 999, border: "none",
  background: "transparent", color: "#64748b", fontSize: 14, fontWeight: 800, cursor: "pointer",
};
const modeActiveBtnStyle: React.CSSProperties = {
  background: "white", color: "#000", boxShadow: "0 2px 8px rgba(0,0,0,.2)",
};
const formStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const fieldWrapStyle: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center" };
const fieldIconStyle: React.CSSProperties = {
  position: "absolute", left: 14, display: "flex", alignItems: "center", pointerEvents: "none", zIndex: 1,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "16px 14px 16px 44px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,.08)", background: "#111827",
  color: "white", fontSize: 16, fontWeight: 500, outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.2s ease",
};
const eyeBtnStyle: React.CSSProperties = {
  position: "absolute", right: 14, display: "flex", alignItems: "center",
  justifyContent: "center", background: "none", border: "none", padding: 4,
  color: "#64748b", cursor: "pointer",
};
const errorStyle: React.CSSProperties = {
  margin: 0, padding: "12px 14px", borderRadius: 12,
  background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)",
  color: "#fca5a5", fontSize: 13, fontWeight: 700,
};
const submitBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  width: "100%", padding: "17px 24px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "white",
  fontSize: 16, fontWeight: 900, boxShadow: "0 4px 20px rgba(59,130,246,.35)",
  marginTop: 4, cursor: "pointer",
};
const dividerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const dividerLineStyle: React.CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,.08)", display: "block" };
const dividerTextStyle: React.CSSProperties = { fontSize: 12, color: "#334155", fontWeight: 700 };
const guestBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "15px 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.04)", color: "#94a3b8", fontSize: 14, fontWeight: 800,
  textDecoration: "none", cursor: "pointer",
};
