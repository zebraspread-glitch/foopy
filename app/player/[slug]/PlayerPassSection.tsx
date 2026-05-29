"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { PLAYER_PASS_COST } from "@/app/lib/passes";

interface Props {
  playerId: string;
  playerName: string;
  teamName: string;
  accentColor: string;
  imgSrc?: string;
}

export function PlayerPassSection({ playerId, accentColor }: Props) {
  const router = useRouter();
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const countRes = await fetch(
        `/api/passes/leaderboard?player_id=${encodeURIComponent(playerId)}`,
        { cache: "no-store" }
      );
      if (!cancelled && countRes.ok) {
        const data = await countRes.json();
        setHolderCount(Array.isArray(data) ? data.length : 0);
      }

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
    }

    load();
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <section style={{
      background: "var(--bg)",
      border: "1px solid var(--border-2)",
      borderRadius: 18,
      padding: "16px 16px 18px",
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
      }}>
        Player Pass
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        {/* Main button */}
        <button
          onClick={() => router.push(`/passes?player=${encodeURIComponent(playerId)}`)}
          style={{
            flex: 1,
            padding: "13px 16px",
            borderRadius: 14,
            border: alreadyOwned ? `1px solid ${accentColor}44` : "1px solid rgba(255,255,255,0.08)",
            background: alreadyOwned
              ? `${accentColor}18`
              : "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
            color: alreadyOwned ? accentColor : "var(--text-1)",
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {alreadyOwned ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Pass Owned
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Get Pass · 🪙 {PLAYER_PASS_COST.toLocaleString()}
            </>
          )}
        </button>

        {/* Holder count pill */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 1, minWidth: 52, padding: "10px 12px",
          background: "var(--surface-2)", border: "1px solid var(--border-1)",
          borderRadius: 14, flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", color: "var(--text-1)", lineHeight: 1 }}>
            {holderCount !== null ? holderCount : "—"}
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Holders
          </span>
        </div>
      </div>
    </section>
  );
}
