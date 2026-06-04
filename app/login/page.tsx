"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

type Mode = "login" | "signup";

const AFL_TEAMS = [
  { name: "Adelaide Crows",   slug: "crows"     },
  { name: "Brisbane Lions",   slug: "lions"     },
  { name: "Carlton",          slug: "blues"     },
  { name: "Collingwood",      slug: "magpies"   },
  { name: "Essendon",         slug: "bombers"   },
  { name: "Fremantle",        slug: "dockers"   },
  { name: "Geelong",          slug: "cats"      },
  { name: "Gold Coast",       slug: "suns"      },
  { name: "GWS Giants",       slug: "giants"    },
  { name: "Hawthorn",         slug: "hawks"     },
  { name: "Melbourne",        slug: "demons"    },
  { name: "North Melbourne",  slug: "kangaroos" },
  { name: "Port Adelaide",    slug: "power"     },
  { name: "Richmond",         slug: "tigers"    },
  { name: "St Kilda",         slug: "saints"    },
  { name: "Sydney Swans",     slug: "swans"     },
  { name: "West Coast",       slug: "eagles"    },
  { name: "Western Bulldogs", slug: "bulldogs"  },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main style={page}>
      <div style={wrap}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 8 }}>
          <div style={appIcon}>
            <Activity size={24} color="white" strokeWidth={2.5} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={h1}>Foopy</div>
            <div style={sub}>AFL live scores, picks &amp; stats</div>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode]                 = useState<Mode>(() => searchParams.get("mode") === "signup" ? "signup" : "login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [username, setUsername]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [checkEmail, setCheckEmail]     = useState(false);
  const [favouriteTeam, setFavouriteTeam] = useState("");

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

    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanUsername.length < 3) {
      setError("Username needs at least 3 characters (a–z, 0–9, _)");
      setLoading(false); return;
    }
    if (!favouriteTeam) {
      setError("Please pick your team.");
      setLoading(false); return;
    }
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", cleanUsername).maybeSingle();
    if (existing) { setError("That username is already taken — try another."); setLoading(false); return; }

    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }

    // Guard 1: empty identities means email already registered (Supabase standard check)
    if (!data.user?.identities?.length) { setError("An account with this email already exists. Try signing in."); setLoading(false); return; }

    // Guard 2: if the account was created more than 30s ago it's an existing account
    // (catches cases where signUp silently returns the existing user's session)
    const accountAge = Date.now() - new Date(data.user?.created_at ?? 0).getTime();
    if (accountAge > 30_000) {
      await supabase.auth.signOut();
      setError("An account with this email already exists. Try signing in.");
      setLoading(false); return;
    }

    if (data.session && data.user) {
      const { error: upsertErr } = await supabase.from("profiles").upsert({
        id: data.user.id,
        username: cleanUsername,
        display_name: cleanUsername,
        username_updated_at: new Date().toISOString(),
        favourite_team: favouriteTeam,
      }, { onConflict: "id" });
      if (upsertErr) localStorage.setItem("foopy_pending_username", cleanUsername);
      router.push("/profile");
    } else {
      localStorage.setItem("foopy_pending_username", cleanUsername);
      if (favouriteTeam) localStorage.setItem("foopy_pending_team", favouriteTeam);
      setCheckEmail(true);
    }
    setLoading(false);
  }

  function switchMode(m: Mode) { setMode(m); setError(""); setUsername(""); setFavouriteTeam(""); }

  if (checkEmail) {
    return (
      <main style={page}>
        <div style={wrap}>
          <div style={{ ...appIcon, background: "#22c55e", boxShadow: "none" }}>
            <Activity size={24} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={h1}>Check your email</h1>
            <p style={sub}>We sent a link to <strong style={{ color: "var(--text-1)" }}>{email}</strong>. Click it to confirm your account, then sign in.</p>
          </div>
          <button onClick={() => { setCheckEmail(false); setMode("login"); }} style={secondaryBtn}>← Back to Sign In</button>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={wrap}>

        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 8 }}>
          <div style={appIcon}>
            <Activity size={24} color="white" strokeWidth={2.5} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={h1}>Foopy</div>
            <div style={sub}>AFL live scores, picks &amp; stats</div>
          </div>
        </div>

        {/* Tab toggle */}
        <div style={tabs}>
          <button onClick={() => switchMode("login")}  style={{ ...tab, ...(mode === "login"  ? tabActive : {}) }}>Sign In</button>
          <button onClick={() => switchMode("signup")} style={{ ...tab, ...(mode === "signup" ? tabActive : {}) }}>Create Account</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={fieldGroup}>
            <label style={label}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required style={input}
            />
          </div>

          <div style={fieldGroup}>
            <label style={label}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"}
                required style={{ ...input, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 0, display: "flex" }}>
                {showPassword ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
              </button>
            </div>
          </div>

          {mode === "signup" && (
            <div style={fieldGroup}>
              <label style={label}>Username</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="yourname" maxLength={20} autoComplete="off" required style={input}
              />
            </div>
          )}

          {mode === "signup" && (
            <div style={fieldGroup}>
              <label style={label}>
                My Team
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {AFL_TEAMS.map(team => {
                  const selected = favouriteTeam === team.name;
                  return (
                    <button
                      key={team.name}
                      type="button"
                      title={team.name}
                      onClick={() => setFavouriteTeam(selected ? "" : team.name)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                        padding: "7px 2px 5px",
                        border: selected ? "2px solid #5865f2" : "2px solid rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        background: selected ? "rgba(88,101,242,0.18)" : "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}
                    >
                      <img
                        src={`/team-logos/${team.slug}.png`}
                        alt={team.name}
                        style={{ width: 28, height: 28, objectFit: "contain" }}
                      />
                    </button>
                  );
                })}
              </div>
              {favouriteTeam && (
                <div style={{ fontSize: 12, color: "#5865f2", fontWeight: 600, marginTop: 2 }}>
                  {favouriteTeam}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: "#f87171", fontWeight: 500, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.15)" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.6 : 1 }}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  Please wait…
                </span>
              : mode === "login" ? "Sign In" : "Create Account"
            }
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.08em" }}>OR</span>
          <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
        </div>

        <a href="/" style={secondaryBtn}>Browse without an account</a>
      </div>
    </main>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const page: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px 80px",
};

const wrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const appIcon: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 16,
  background: "#5865f2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  color: "var(--text-1)",
  letterSpacing: "-0.03em",
  textAlign: "center",
};

const sub: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "var(--text-3)",
  fontWeight: 500,
  textAlign: "center",
  lineHeight: 1.5,
};

const tabs: React.CSSProperties = {
  display: "flex",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  padding: 3,
  gap: 2,
};

const tab: React.CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.35)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.15s",
  fontFamily: "inherit",
};

const tabActive: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  color: "var(--text-1)",
};

const fieldGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.45)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text-1)",
  fontSize: 15,
  fontWeight: 400,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 10,
  border: "none",
  background: "#5865f2",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
};

const secondaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "13px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "rgba(255,255,255,0.35)",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};
