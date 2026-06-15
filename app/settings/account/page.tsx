"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useRouter } from "next/navigation";
import { SettingsHeader, SettingsScreen, Body, Group, NavRow } from "../shared";

export default function AccountSettings() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Delete-account flow
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    if (!signOutConfirm) { setSignOutConfirm(true); return; }
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/");
  }

  function openDeleteModal() {
    setPassword("");
    setConfirmText("");
    setDeleteError(null);
    setShowDelete(true);
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleteError(null);

    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteError('Type DELETE to confirm.');
      return;
    }
    if (!password) {
      setDeleteError("Enter your password to continue.");
      return;
    }
    if (!email) {
      setDeleteError("Could not find your account email. Please sign in again.");
      return;
    }

    setDeleting(true);

    // Step 1 — re-authenticate by verifying the password.
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setDeleting(false);
      setDeleteError("Incorrect password. Please try again.");
      return;
    }

    // Step 2 — call the delete endpoint with a fresh token.
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setDeleting(false); setDeleteError("Session expired. Please sign in again."); return; }
      const res = await fetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDeleteError(j?.error ?? "Failed to delete account. Please try again.");
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setDeleteError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  const canDelete = !deleting && password.length > 0 && confirmText.trim().toUpperCase() === "DELETE";

  return (
    <SettingsScreen>
      <SettingsHeader title="Account" backHref="/settings" />
      <Body>
        <Group>
          <NavRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            label={signOutConfirm ? "Tap again to confirm" : signingOut ? "Signing out…" : "Sign Out"}
            value={email ?? undefined}
            onClick={handleSignOut}
            destructive
          />
          {userId && (
            <NavRow
              icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>}
              label="Delete Account"
              onClick={openDeleteModal}
              destructive
            />
          )}
        </Group>
      </Body>

      {/* ── Delete-account confirmation ── */}
      {showDelete && (
        <>
          <div
            onClick={() => !deleting && setShowDelete(false)}
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 201,
            width: "min(380px, 90vw)", background: "var(--surface-1)",
            border: "1px solid var(--border-2)", borderRadius: 22, overflow: "hidden",
            display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
          }}>
            <div style={{ padding: "26px 22px 22px" }}>
              {/* Warning icon */}
              <div style={{
                width: 52, height: 52, borderRadius: "50%", margin: "0 auto 16px",
                background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>

              <h2 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)", textAlign: "center" }}>
                Delete your account?
              </h2>
              <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)", fontWeight: 500, textAlign: "center" }}>
                This permanently removes your profile, cards, coins, passes and posts.
                <br /><strong style={{ color: "var(--text-1)" }}>This cannot be undone.</strong>
              </p>

              {/* Type DELETE */}
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>
                Type <span style={{ color: "#ef4444", fontWeight: 800 }}>DELETE</span> to confirm
              </label>
              <input
                value={confirmText}
                onChange={e => { setConfirmText(e.target.value); setDeleteError(null); }}
                placeholder="DELETE"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={inputStyle}
              />

              {/* Password */}
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-3)", margin: "14px 0 6px" }}>
                Enter your password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setDeleteError(null); }}
                placeholder="••••••••"
                autoComplete="current-password"
                onKeyDown={e => { if (e.key === "Enter" && canDelete) confirmDelete(); }}
                style={inputStyle}
              />

              {deleteError && (
                <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#f87171", textAlign: "center" }}>
                  {deleteError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 22px 22px" }}>
              <button
                onClick={confirmDelete}
                disabled={!canDelete}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: canDelete ? "#ef4444" : "var(--surface-3)",
                  color: canDelete ? "#fff" : "var(--text-3)",
                  fontWeight: 800, fontSize: 15, cursor: canDelete ? "pointer" : "not-allowed",
                  fontFamily: "inherit", transition: "background 0.15s ease",
                }}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
              <button
                onClick={() => !deleting && setShowDelete(false)}
                disabled={deleting}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12,
                  border: "1px solid var(--border-2)", background: "transparent",
                  color: "var(--text-2)", fontWeight: 700, fontSize: 15,
                  cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsScreen>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "var(--surface-3)", border: "1px solid var(--border-2)",
  borderRadius: 10, padding: "12px 14px",
  color: "var(--text-1)", fontSize: 15, fontWeight: 600,
  outline: "none", fontFamily: "inherit",
};
