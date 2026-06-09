"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TicketCheck, Check } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

interface Props {
  teamName: string;
  accentColor: string;
}

/* ── Team gradient helpers (same palette as PlayerPassSection) ── */

const TEAM_PASS_GRADIENTS: Record<string, string[]> = {
  adelaide:                       ["#002b5c", "#c8102e", "#ffd200"],
  adelaidecrows:                  ["#002b5c", "#c8102e", "#ffd200"],
  brisbane:                       ["#7a003c", "#fbbf24", "#1e3a8a"],
  brisbanelions:                  ["#7a003c", "#fbbf24", "#1e3a8a"],
  carlton:                        ["#031a35", "#0b3b75"],
  collingwood:                    ["#111111", "#ffffff", "#111111"],
  essendon:                       ["#111111", "#ed1b2f"],
  fremantle:                      ["#4b1979", "#ffffff", "#4b1979"],
  geelong:                        ["#003b73", "#ffffff", "#003b73"],
  geelongcats:                    ["#003b73", "#ffffff", "#003b73"],
  goldcoast:                      ["#ff1f2d", "#ffd200"],
  goldcoastsuns:                  ["#ff1f2d", "#ffd200"],
  gws:                            ["#f15a22", "#343434"],
  gwsgiants:                      ["#f15a22", "#343434"],
  greaterwesternsydney:           ["#f15a22", "#343434"],
  greaterwesternsydneygiants:     ["#f15a22", "#343434"],
  hawthorn:                       ["#8b4a24", "#fbbf24"],
  hawthornhawks:                  ["#8b4a24", "#fbbf24"],
  melbourne:                      ["#001f54", "#c8102e"],
  melbournedemons:                ["#001f54", "#c8102e"],
  northmelbourne:                 ["#0055a4", "#ffffff", "#0055a4"],
  northmelbournekangaroos:        ["#0055a4", "#ffffff", "#0055a4"],
  portadelaide:                   ["#00a9b7", "#111111", "#ffffff"],
  portadelaidepower:              ["#00a9b7", "#111111", "#ffffff"],
  richmond:                       ["#111111", "#ffd200"],
  richmondtigers:                 ["#111111", "#ffd200"],
  stkilda:                        ["#ed1b2f", "#ffffff", "#111111"],
  stkildasaints:                  ["#ed1b2f", "#ffffff", "#111111"],
  sydney:                         ["#ed171f", "#ffffff", "#ed171f"],
  sydneyswans:                    ["#ed171f", "#ffffff", "#ed171f"],
  westcoast:                      ["#003087", "#f2a900"],
  westcoasteagles:                ["#003087", "#f2a900"],
  westernbulldogs:                ["#2b6edc", "#ffffff", "#ed1b2f"],
};

function teamGradientColors(teamName: string, fallback: string) {
  const key = teamName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TEAM_PASS_GRADIENTS[key] ?? [fallback, "#0f172a"];
}

function teamGradient(teamName: string, fallback: string) {
  const colors = teamGradientColors(teamName, fallback);
  return `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.32)), linear-gradient(90deg, ${colors.join(", ")})`;
}

function teamBorderColor(teamName: string, fallback: string) {
  const colors = teamGradientColors(teamName, fallback);
  return (
    colors.find((c) => {
      const l = c.toLowerCase();
      return l !== "#ffffff" && l !== "#fff" && l !== "#111111";
    }) ??
    colors[0] ??
    fallback
  );
}

/* ── Component ── */

export function TeamPassSection({ teamName, accentColor }: Props) {
  const router = useRouter();
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const countRes = await fetch(
        `/api/passes/team-leaderboard?team_name=${encodeURIComponent(teamName)}`,
        { cache: "no-store" }
      );
      if (!cancelled && countRes.ok) {
        const data = await countRes.json();
        setHolderCount(Array.isArray(data) ? data.length : 0);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session) {
        const { data: existing } = await supabase
          .from("user_team_passes")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("team_name", teamName)
          .eq("active", true)
          .maybeSingle();
        if (!cancelled) setAlreadyOwned(!!existing);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [teamName]);

  const passBackground = teamGradient(teamName, accentColor);
  const ownedBorderColor = teamBorderColor(teamName, accentColor);
  const holderLabel =
    holderCount !== null
      ? `${holderCount.toLocaleString()} holder${holderCount === 1 ? "" : "s"}`
      : "holder count loading";

  function handleClick() {
    router.push(`/passes?team=${encodeURIComponent(teamName)}`);
  }

  return (
    <section aria-label="Team pass" style={{ width: "100%" }}>
      <style>{`
        @keyframes team-pass-shine {
          0%   { left: -52%; opacity: 0; }
          18%  { opacity: 0.72; }
          46%  { opacity: 0.22; }
          100% { left: 114%; opacity: 0; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        {/* Main pass button — navigates to /passes?team=... */}
        <button
          type="button"
          onClick={handleClick}
          aria-label={`${alreadyOwned ? "View" : "Get"} 2026 Team Pass, ${holderLabel}`}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            minHeight: 32,
            padding: "7px 12px",
            borderRadius: 999,
            border: alreadyOwned
              ? `1.5px solid ${ownedBorderColor}`
              : "1px solid rgba(255,255,255,0.16)",
            background: alreadyOwned
              ? "linear-gradient(180deg, var(--surface-1), var(--surface-3))"
              : passBackground,
            color: alreadyOwned ? "var(--text-1)" : "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: alreadyOwned
              ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 16px rgba(0,0,0,0.12)"
              : "inset 0 1px 0 rgba(255,255,255,0.26), 0 8px 20px rgba(0,0,0,0.22)",
            overflow: "hidden",
            position: "relative",
          } as React.CSSProperties}
        >
          {/* Shine sweep (not owned) */}
          {!alreadyOwned && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "-20%",
                bottom: "-20%",
                left: "-52%",
                width: "42%",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.76), transparent)",
                animation: "team-pass-shine 2.8s ease-in-out infinite",
                pointerEvents: "none",
                transform: "skewX(-20deg)",
              }}
            />
          )}

          <span
            style={{
              position: "relative",
              zIndex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minWidth: 0,
              maxWidth: "100%",
              textShadow: alreadyOwned ? "none" : "0 1px 2px rgba(0,0,0,0.48)",
            }}
          >
            <TicketCheck size={17} strokeWidth={2.7} aria-hidden="true" />
            <span
              style={{
                fontSize: 14,
                fontWeight: 900,
                lineHeight: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              2026 Team Pass
            </span>
            {alreadyOwned && (
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "var(--text-1)",
                  color: "var(--bg)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check size={11} strokeWidth={3.4} />
              </span>
            )}
          </span>
        </button>

        {/* Holder count pill */}
        <div
          aria-label={holderLabel}
          title={holderLabel}
          style={{
            minHeight: 32,
            minWidth: 58,
            padding: "7px 11px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "var(--text-1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <TicketCheck size={15} strokeWidth={2.6} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" }}>
            {holderCount !== null ? holderCount.toLocaleString() : "-"}
          </span>
        </div>
      </div>
    </section>
  );
}
