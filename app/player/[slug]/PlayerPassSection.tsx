"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { PLAYER_PASS_COST } from "@/app/lib/passes";

interface Props {
  playerId: string;
  playerName: string;
  teamName: string;
  accentColor: string;
}

export function PlayerPassSection({ playerId, playerName, teamName, accentColor }: Props) {
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      // Fetch holder count (public — no auth needed)
      const countRes = await fetch(
        `/api/passes/leaderboard?player_id=${encodeURIComponent(playerId)}`,
        { cache: "no-store" }
      );
      if (!cancelled && countRes.ok) {
        const data = await countRes.json();
        setHolderCount(Array.isArray(data) ? data.length : 0);
      }

      // Check if the current user already owns this pass
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session) {
        const { data: existing } = await supabase
          .from("user_player_passes")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("player_id", playerId)
          .eq("active", true)
          .maybeSingle();
        if (!cancelled) setAlreadyOwned(!!existing);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [playerId]);

  async function handleBuy() {
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Sign in to buy a pass"); return; }

    setBuying(true);
    try {
      const res = await fetch("/api/passes/player", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ player_id: playerId }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Purchase failed"); return; }

      setAlreadyOwned(true);
      setSuccess(true);
      setHolderCount((c) => (c ?? 0) + 1);
    } finally {
      setBuying(false);
    }
  }

  return (
    <section style={{
      background: "var(--bg)",
      border: "1px solid var(--border-2)",
      borderRadius: 18,
      padding: "16px 16px 18px",
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
      }}>
        Player Pass
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Buy / owned button */}
        <button
          onClick={alreadyOwned || loading ? undefined : handleBuy}
          disabled={buying || loading}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 14,
            border: alreadyOwned ? `1px solid ${accentColor}44` : "none",
            background: alreadyOwned
              ? `${accentColor}22`
              : success
              ? "#22c55e"
              : `linear-gradient(135deg, ${accentColor}cc, ${accentColor}88)`,
            color: alreadyOwned ? accentColor : "#fff",
            fontWeight: 900,
            fontSize: 14,
            cursor: alreadyOwned || loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "opacity 0.15s",
            opacity: buying ? 0.6 : 1,
          } as React.CSSProperties}
        >
          {loading ? (
            <span style={{ opacity: 0.5 }}>Loading…</span>
          ) : alreadyOwned ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Pass Owned
            </>
          ) : buying ? (
            "Buying…"
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Get Pass · 🪙 {PLAYER_PASS_COST.toLocaleString()}
            </>
          )}
        </button>

        {/* Holder count */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          minWidth: 56,
          padding: "10px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-1)",
          borderRadius: 14,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", color: "var(--text-1)", lineHeight: 1 }}>
            {holderCount !== null ? holderCount.toLocaleString() : "—"}
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            holders
          </span>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{error}</div>
      )}
      {success && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#22c55e" }}>
          Pass activated! You'll earn rewards after {playerName}'s next game.
        </div>
      )}
    </section>
  );
}
