"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";
import { supabase } from "@/app/lib/supabase";

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  target_type: "user" | "comment" | "dm_message" | "group_message";
  target_id: string | null;
  context: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reporter: { username: string | null; display_name: string | null } | null;
  reported: { username: string | null; display_name: string | null } | null;
};

const FILTERS = ["open", "reviewed", "actioned", "dismissed", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_COLOR: Record<Report["status"], string> = {
  open: "#f59e0b", reviewed: "#60a5fa", actioned: "#22c55e", dismissed: "#94a3b8",
};

const TYPE_LABEL: Record<Report["target_type"], string> = {
  user: "User", comment: "Comment", dm_message: "DM", group_message: "Group msg",
};

function ReportsAdmin() {
  const [filter, setFilter] = useState<Filter>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setLoading(false); return; }
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/reports${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => null);
    setReports(json?.reports ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: Report["status"]) {
    setBusyId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    setBusyId(null);
    load();
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", paddingBottom: 60 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bottom-nav-bg)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--border-1)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/admin" style={{ color: "var(--text-2)", textDecoration: "none", fontSize: 22, lineHeight: 1 }}>‹</Link>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Reports</h1>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px" }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, textTransform: "capitalize", flexShrink: 0,
              background: filter === f ? "var(--text-1)" : "var(--surface-2)",
              color: filter === f ? "var(--bg)" : "var(--text-2)",
            }}>{f}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>Loading…</div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--text-3)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>No {filter === "all" ? "" : filter} reports</div>
            <div style={{ fontSize: 13 }}>Nothing to review here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reports.map(r => (
              <div key={r.id} style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: `${STATUS_COLOR[r.status]}22`, color: STATUS_COLOR[r.status], textTransform: "uppercase", letterSpacing: "0.04em" }}>{r.status}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--surface-3)", color: "var(--text-2)" }}>{TYPE_LABEL[r.target_type]}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>{new Date(r.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{r.reason}</div>
                {r.details && <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>{r.details}</div>}

                <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.7 }}>
                  <div>Reported user:{" "}
                    {r.reported?.username
                      ? <Link href={`/profile/${r.reported.username}`} style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "none" }}>@{r.reported.username}</Link>
                      : <span style={{ color: "var(--text-2)" }}>{r.reported_user_id ?? "—"}</span>}
                  </div>
                  <div>Reporter: {r.reporter?.username ? `@${r.reporter.username}` : (r.reporter_id.slice(0, 8) + "…")}</div>
                  {r.target_id && <div>Target id: <code style={{ fontSize: 11 }}>{r.target_id}</code></div>}
                  {r.context && <div>Context: <code style={{ fontSize: 11 }}>{r.context}</code></div>}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {(["reviewed", "actioned", "dismissed", "open"] as const)
                    .filter(s => s !== r.status)
                    .map(s => (
                      <button key={s} disabled={busyId === r.id} onClick={() => setStatus(r.id, s)} style={{
                        padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                        border: `1px solid ${STATUS_COLOR[s]}55`, background: `${STATUS_COLOR[s]}18`, color: STATUS_COLOR[s],
                        textTransform: "capitalize", fontFamily: "inherit",
                      }}>
                        {s === "open" ? "Reopen" : `Mark ${s}`}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGate title="Reports">
      <ReportsAdmin />
    </AdminGate>
  );
}
