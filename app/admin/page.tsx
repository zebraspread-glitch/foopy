"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");

  const ADMIN_PASSWORD = "foopy123"; // change this

  function handleLogin() {
    if (password === ADMIN_PASSWORD) {
      setUnlocked(true);
    } else {
      alert("Wrong password");
    }
  }

  if (!unlocked) {
    return (
      <main className="page grid">
        <section className="card" style={{ maxWidth: 420, margin: "80px auto" }}>
          <span className="pill">Admin only</span>
          <h1>Admin Login</h1>

          <input
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginTop: 16 }}
          />

          <button
            className="button"
            onClick={handleLogin}
            style={{ marginTop: 16, width: "100%" }}
          >
            Unlock
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page grid">
      <section className="card">
        <span className="pill">Admin</span>
        <h1>Foopy Admin Panel</h1>
        <p className="muted">
          Control matches, scores, live feed and users.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/admin/duels" style={{ display: "inline-block", padding: "9px 18px", borderRadius: 10, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            ⚔ Manage Duels →
          </Link>
        </div>
      </section>

      <section
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}
      >
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

            <button
              className="button secondary"
              style={{ marginTop: 12 }}
              onClick={() => alert(`${item} coming soon`)}
            >
              Open
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}