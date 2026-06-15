"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  REPORT_REASONS, blockUser, unblockUser, submitReport, getMyBlockedIds,
  type ReportTargetType,
} from "@/app/lib/blocks";

export type ReportBlockTarget = {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  targetType?: ReportTargetType;   // defaults to "user"
  targetId?: string | null;        // id of the reported content, if any
  context?: string | null;         // game id / conversation id for admin lookup
};

/** Small "⋯" trigger button surfaces can reuse. */
export function MoreButton({ onClick, size = 28, label = "More options" }: { onClick: () => void; size?: number; label?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      style={{
        width: size, height: size, borderRadius: "50%", border: "none",
        background: "transparent", color: "var(--text-3)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
      </svg>
    </button>
  );
}

type View = "menu" | "report" | "block";

export function ReportBlockSheet({
  open, onClose, target, onChanged, extraActions = [],
}: {
  open: boolean;
  onClose: () => void;
  target: ReportBlockTarget;
  onChanged?: () => void;   // fired after a block/unblock so the parent can refresh
  extraActions?: { label: string; icon?: React.ReactNode; onClick: () => void }[];
}) {
  const [view, setView] = useState<View>("menu");
  const [iBlock, setIBlock] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const name = target.displayName || (target.username ? `@${target.username}` : "this user");

  // Reset + load block state each time it opens.
  useEffect(() => {
    if (!open) return;
    setView("menu"); setReason(""); setDetails(""); setError(null); setDone(null); setBusy(false);
    getMyBlockedIds().then(set => setIBlock(set.has(target.userId)));
  }, [open, target.userId]);

  if (!open || !mounted) return null;

  async function handleBlock() {
    setBusy(true); setError(null);
    const { error } = await blockUser(target.userId);
    setBusy(false);
    if (error) { setError(error); return; }
    setIBlock(true);
    onChanged?.();
    setDone(`${name} blocked`);
    setTimeout(onClose, 900);
  }

  async function handleUnblock() {
    setBusy(true); setError(null);
    const { error } = await unblockUser(target.userId);
    setBusy(false);
    if (error) { setError(error); return; }
    setIBlock(false);
    onChanged?.();
    onClose();
  }

  async function handleSubmitReport() {
    if (!reason) { setError("Pick a reason."); return; }
    setBusy(true); setError(null);
    const { error } = await submitReport({
      reportedUserId: target.userId,
      targetType: target.targetType ?? "user",
      targetId: target.targetId ?? null,
      context: target.context ?? null,
      reason,
      details: details.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error); return; }
    setDone("Report submitted. Thanks for keeping Foopy safe.");
    setTimeout(onClose, 1200);
  }

  return createPortal(
    <>
      <div onClick={() => !busy && onClose()} style={backdrop} />
      <div style={sheet} role="dialog" aria-modal="true">
        <div style={grabber} />

        {done ? (
          <div style={{ padding: "26px 22px 30px", textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{done}</div>
          </div>
        ) : view === "menu" ? (
          <div style={{ padding: "6px 14px calc(18px + env(safe-area-inset-bottom))" }}>
            <div style={titleRow}>{name}</div>
            {extraActions.map((a, i) => (
              <button key={i} style={item} onClick={() => { a.onClick(); onClose(); }}>
                {a.icon}{a.label}
              </button>
            ))}
            <button style={item} onClick={() => setView("report")}>
              <FlagIcon /> Report {target.targetType && target.targetType !== "user" ? "this " + label(target.targetType) : name}
            </button>
            {iBlock ? (
              <button style={item} onClick={handleUnblock} disabled={busy}>
                <UnblockIcon /> Unblock {name}
              </button>
            ) : (
              <button style={{ ...item, color: "#ef4444" }} onClick={() => setView("block")}>
                <BlockIcon /> Block {name}
              </button>
            )}
            {error && <div style={errStyle}>{error}</div>}
            <button style={cancel} onClick={onClose}>Cancel</button>
          </div>
        ) : view === "block" ? (
          <div style={{ padding: "8px 22px calc(20px + env(safe-area-inset-bottom))" }}>
            <h3 style={heading}>Block {name}?</h3>
            <p style={para}>
              They won't be able to message you, and you won't see each other's comments or activity.
              Any friendship between you will be removed.
            </p>
            {error && <div style={errStyle}>{error}</div>}
            <button style={{ ...primaryBtn, background: "#ef4444", color: "#fff" }} onClick={handleBlock} disabled={busy}>
              {busy ? "Blocking…" : `Block ${name}`}
            </button>
            <button style={secondaryBtn} onClick={() => setView("menu")} disabled={busy}>Back</button>
          </div>
        ) : (
          <div style={{ padding: "8px 22px calc(20px + env(safe-area-inset-bottom))" }}>
            <h3 style={heading}>Report {name}</h3>
            <p style={para}>Why are you reporting this? Your report is anonymous.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
              {REPORT_REASONS.map(r => {
                const active = reason === r;
                return (
                  <button key={r} onClick={() => { setReason(r); setError(null); }} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: active ? "var(--surface-3)" : "transparent",
                    border: `1px solid ${active ? "var(--border-3)" : "transparent"}`,
                    color: "var(--text-1)", fontSize: 14.5, fontWeight: 600, fontFamily: "inherit",
                  }}>
                    {r}
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </div>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Add details (optional)"
              maxLength={500}
              rows={3}
              style={textarea}
            />
            {error && <div style={errStyle}>{error}</div>}
            <button style={{ ...primaryBtn, background: reason ? "#ef4444" : "var(--surface-3)", color: reason ? "#fff" : "var(--text-3)" }} onClick={handleSubmitReport} disabled={busy || !reason}>
              {busy ? "Submitting…" : "Submit report"}
            </button>
            <button style={secondaryBtn} onClick={() => setView("menu")} disabled={busy}>Back</button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

function label(t: ReportTargetType) {
  return t === "comment" ? "comment" : t === "dm_message" ? "message" : t === "group_message" ? "message" : "user";
}

// ── Icons ──
const FlagIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
const BlockIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
const UnblockIcon = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>;
const CheckIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

// ── Styles ──
const backdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" };
const sheet: CSSProperties = {
  position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)", zIndex: 301,
  width: "min(480px, 100%)", background: "var(--surface-1)",
  borderRadius: "20px 20px 0 0", border: "1px solid var(--border-2)", borderBottom: "none",
  boxShadow: "0 -20px 60px rgba(0,0,0,0.5)", animation: "rb-up 0.24s cubic-bezier(0.22,1,0.36,1)",
};
const grabber: CSSProperties = { width: 38, height: 4, borderRadius: 2, background: "var(--border-3)", margin: "10px auto 4px" };
const titleRow: CSSProperties = { fontSize: 12, fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.04em", padding: "8px 8px 10px", textTransform: "uppercase" };
const item: CSSProperties = { display: "flex", alignItems: "center", gap: 13, width: "100%", padding: "15px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--text-1)", fontSize: 15.5, fontWeight: 650, textAlign: "left", fontFamily: "inherit" };
const cancel: CSSProperties = { width: "100%", marginTop: 8, padding: "14px", borderRadius: 12, border: "1px solid var(--border-2)", background: "transparent", color: "var(--text-2)", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" };
const heading: CSSProperties = { margin: "8px 0 8px", fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" };
const para: CSSProperties = { margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)", fontWeight: 500 };
const primaryBtn: CSSProperties = { width: "100%", padding: "14px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginTop: 4 };
const secondaryBtn: CSSProperties = { width: "100%", marginTop: 10, padding: "13px", borderRadius: 12, border: "1px solid var(--border-2)", background: "transparent", color: "var(--text-2)", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" };
const textarea: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "11px 13px", color: "var(--text-1)", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none" };
const errStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#f87171", padding: "8px 4px 0", textAlign: "center" };
