"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  FOOPY_THEME_KEY,
  themeColorForMode,
  type FoopyThemeMode,
} from "@/app/lib/theme";

// ── Shared data ───────────────────────────────────────────────────────────────

export const AFL_TEAMS = [
  "Adelaide","Brisbane","Carlton","Collingwood","Essendon","Fremantle",
  "Geelong","Gold Coast","GWS","Hawthorn","Melbourne","North Melbourne",
  "Port Adelaide","Richmond","St Kilda","Sydney","West Coast","Western Bulldogs",
];

export const TEAM_LOGO: Record<string, string> = {
  Adelaide: "/team-logos/crows.png", Brisbane: "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png", Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png", Fremantle: "/team-logos/dockers.png",
  Geelong: "/team-logos/cats.png", "Gold Coast": "/team-logos/suns.png",
  GWS: "/team-logos/giants.png", Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png", "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png", Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png", Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png", "Western Bulldogs": "/team-logos/bulldogs.png",
};

export const TEAM_COLOR: Record<string, string> = {
  Adelaide: "#c8102e", Brisbane: "#7a003c", Carlton: "#0b3b75",
  Collingwood: "#777", Essendon: "#cc1020", Fremantle: "#4b1979",
  Geelong: "#003b73", "Gold Coast": "#e8281a", GWS: "#f15a22",
  Hawthorn: "#6b3310", Melbourne: "#031b4e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#007b8a", Richmond: "#c8a800",
  "St Kilda": "#cc1122", Sydney: "#cc1122", "West Coast": "#003087",
  "Western Bulldogs": "#1a5fd4",
};

export const STAT_OPTIONS = [
  { value: "disposals",   label: "Disposals" },
  { value: "goals",       label: "Goals" },
  { value: "kicks",       label: "Kicks" },
  { value: "marks",       label: "Marks" },
  { value: "tackles",     label: "Tackles" },
  { value: "clearances",  label: "Clearances" },
  { value: "hitouts",     label: "Hitouts" },
  { value: "handballs",   label: "Handballs" },
  { value: "goalAssists", label: "Assists" },
];

export const THEME_OPTIONS: { value: FoopyThemeMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function applyThemeMode(mode: FoopyThemeMode) {
  document.documentElement.dataset.foopyTheme = mode;
  document.documentElement.style.colorScheme = mode === "light" ? "light" : "dark";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorForMode(mode));
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    ?.setAttribute("content", mode === "light" ? "light" : "dark");
}

export function savePref(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event("foopy-settings-changed"));
}

export { FOOPY_THEME_KEY };
export type { FoopyThemeMode };

// ── Screen chrome ───────────────────────────────────────────────────────────

/** Centered title with a back arrow, matching the native settings look. */
export function SettingsHeader({ title, backHref }: { title: string; backHref?: string }) {
  const router = useRouter();
  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--bottom-nav-bg)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid var(--border-1)",
        paddingTop: "env(safe-area-inset-top)",
        height: "calc(52px + env(safe-area-inset-top))",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={() => (backHref ? router.push(backHref) : router.back())}
        aria-label="Back"
        style={{
          position: "absolute", left: 8, top: "env(safe-area-inset-top)",
          height: "52px", width: 44,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-1)", padding: 0,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
        {title}
      </span>
    </header>
  );
}

export function SettingsScreen({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .snav:active, .srow:active { background: var(--surface-1) !important; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
      <main style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
      }}>
        {children}
      </main>
    </>
  );
}

export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: label ? 26 : 8 }}>
      {label && (
        <div style={{
          fontSize: 13.5, fontWeight: 800, color: "var(--text-2)",
          letterSpacing: "0.01em", padding: "0 6px 8px",
        }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

const rowBase: CSSProperties = {
  display: "flex", alignItems: "center", gap: 16,
  padding: "15px 6px",
  WebkitTapHighlightColor: "transparent",
  borderRadius: 12,
  textDecoration: "none",
};

/** Navigable row — icon, bold label, optional value, right chevron. */
export function NavRow({
  icon, label, value, href, onClick, destructive = false,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? "#ef4444" : "var(--text-1)";
  const inner = (
    <>
      <span style={{ width: 26, display: "flex", justifyContent: "center", flexShrink: 0, color: destructive ? "#ef4444" : "var(--text-2)" }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color }}>
        {label}
      </span>
      {value && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>{value}</span>
      )}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </>
  );

  if (href) {
    return <Link className="snav" href={href} style={{ ...rowBase, color }}>{inner}</Link>;
  }
  return (
    <div className="snav" onClick={onClick} style={{ ...rowBase, color, cursor: "pointer" }}>
      {inner}
    </div>
  );
}

/** Control row — icon, bold label, optional sub, control on the right. */
export function ControlRow({
  icon, label, sub, children,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="srow" style={{ ...rowBase, alignItems: "center", cursor: "default" }}>
      <span style={{ width: 26, display: "flex", justifyContent: "center", flexShrink: 0, color: "var(--text-2)" }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-1)" }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>{sub}</div>}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 46, height: 26, borderRadius: 13, border: "none",
        background: on ? "#3b82f6" : "var(--surface-3)",
        cursor: "pointer", position: "relative", flexShrink: 0,
        transition: "background 0.2s ease",
        boxShadow: on ? "0 0 0 1px #3b82f666" : "none",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 23 : 3,
        width: 20, height: 20, borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        transition: "left 0.18s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </button>
  );
}

/** Segmented control used on the Appearance page. */
export function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{
      width: "min(208px, 48vw)",
      display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      gap: 3, padding: 3, borderRadius: 12,
      background: "var(--surface-3)", border: "1px solid var(--border-2)",
    }}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              border: "none", borderRadius: 9,
              background: active ? "var(--bg)" : "transparent",
              color: active ? "var(--text-1)" : "var(--text-2)",
              boxShadow: active ? "0 1px 8px rgba(0,0,0,0.18)" : "none",
              fontSize: 11, fontWeight: 800, lineHeight: 1, padding: "8px 4px", cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Inline swatch row for picking a colour, with a custom picker at the end. */
export function ColourPicker({
  value, onChange, swatches,
}: {
  value: string;
  onChange: (c: string) => void;
  swatches: string[];
}) {
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
      {swatches.map(color => (
        <button
          key={color}
          onClick={() => onChange(color)}
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: color, cursor: "pointer", padding: 0,
            border: value === color ? "2.5px solid var(--text-1)" : "2px solid rgba(255,255,255,0.1)",
            outline: "none", flexShrink: 0,
          }}
        />
      ))}
      <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}>
        <input
          type="color" value={value}
          onChange={e => onChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, width: 22, height: 22, top: 0, left: 0, cursor: "pointer", padding: 0, border: "none" }}
        />
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          background: "var(--surface-3)", border: "2px solid var(--border-2)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="3.5"/><path d="M20 14c0 3.31-4 6-8 6s-8-2.69-8-6"/><path d="M2 20h20"/>
          </svg>
        </div>
      </label>
    </div>
  );
}

/** Shared horizontal content padding wrapper. */
export function Body({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 14px" }}>
      {children}
    </div>
  );
}
