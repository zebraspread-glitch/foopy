"use client";

import Link from "next/link";
import AdminGate from "@/app/components/AdminGate";

export default function AdminPage() {
  return (
    <AdminGate title="Admin">
      <main className="page grid">
        <section className="card">
          <span className="pill">Admin</span>
          <h1>Foopy Admin Panel</h1>
          <p className="muted">Control matches, scores, live feed and users.</p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/admin/duels" style={{ display: "inline-block", padding: "9px 18px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              ⚔ Manage Duels →
            </Link>
            <Link href="/admin/reports" style={{ display: "inline-block", padding: "9px 18px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              ⚑ Review Reports →
            </Link>
          </div>
        </section>

        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {[
            "Edit matches",
            "Fix scores",
            "Add live event",
            "Delete comments",
            "Ban users",
            "Send announcement",
          ].map((item) => (
            <div className="card" key={item}>
              <h2>{item}</h2>
              <button className="button secondary" style={{ marginTop: 12 }} onClick={() => alert(`${item} coming soon`)}>
                Open
              </button>
            </div>
          ))}
        </section>
      </main>
    </AdminGate>
  );
}
