"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FOOPY_THEME_KEY,
  normalizeThemeMode,
  themeColorForMode,
  type FoopyThemeMode,
} from "@/app/lib/theme";

// ── Data ──────────────────────────────────────────────────────────────────────

const AFL_TEAMS = [
  "Adelaide","Brisbane","Carlton","Collingwood","Essendon","Fremantle",
  "Geelong","Gold Coast","GWS","Hawthorn","Melbourne","North Melbourne",
  "Port Adelaide","Richmond","St Kilda","Sydney","West Coast","Western Bulldogs",
];

const TEAM_LOGO: Record<string, string> = {
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

const TEAM_COLOR: Record<string, string> = {
  Adelaide: "#c8102e", Brisbane: "#7a003c", Carlton: "#0b3b75",
  Collingwood: "#777", Essendon: "#cc1020", Fremantle: "#4b1979",
  Geelong: "#003b73", "Gold Coast": "#e8281a", GWS: "#f15a22",
  Hawthorn: "#6b3310", Melbourne: "#031b4e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#007b8a", Richmond: "#c8a800",
  "St Kilda": "#cc1122", Sydney: "#cc1122", "West Coast": "#003087",
  "Western Bulldogs": "#1a5fd4",
};

const STAT_OPTIONS = [
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

const THEME_OPTIONS: { value: FoopyThemeMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function applyThemeMode(mode: FoopyThemeMode) {
  document.documentElement.dataset.foopyTheme = mode;
  document.documentElement.style.colorScheme = mode === "light" ? "light" : "dark";

  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorForMode(mode));

  document
    .querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    ?.setAttribute("content", mode === "light" ? "light" : "dark");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
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
        position: "absolute", top: 3,
        left: on ? 23 : 3,
        width: 20, height: 20, borderRadius: "50%",
        background: "var(--text-1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        transition: "left 0.18s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: "var(--text-3)",
        letterSpacing: "0.09em", textTransform: "uppercase", paddingLeft: 6,
      }}>
        {label}
      </div>
      <div style={{
        background: "var(--surface-1)", borderRadius: 16,
        border: "1px solid var(--border-1)",
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  icon, label, sub, children, onPress, destructive = false, last = false,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <div>
      <div
        onClick={onPress}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 16px",
          cursor: onPress ? "pointer" : "default",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: destructive ? "rgba(239,68,68,0.12)" : "var(--surface-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: destructive ? "#ef4444" : "var(--text-3)",
        }}>
          {icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 600,
            color: destructive ? "#ef4444" : "var(--text-1)",
            letterSpacing: "-0.01em",
          }}>
            {label}
          </div>
          {sub && (
            <div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 500, marginTop: 1 }}>
              {sub}
            </div>
          )}
        </div>

        {/* Right control */}
        {children && <div style={{ flexShrink: 0 }}>{children}</div>}

        {/* Chevron for pressable rows with no child control */}
        {onPress && !children && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        )}
      </div>
      {!last && <div style={{ height: 1, background: "var(--border-1)", marginLeft: 62 }} />}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  // Account state
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [username, setUsername]     = useState<string | null>(null);
  const [email, setEmail]           = useState<string | null>(null);
  const [initials, setInitials]     = useState("?");

  // Preferences (localStorage)
  const [favTeam, setFavTeam]           = useState("");
  const [defaultStat, setDefaultStat]   = useState("disposals");
  const [notifGames, setNotifGames]     = useState(true);
  const [notifPacks, setNotifPacks]     = useState(true);
  const [notifTrades, setNotifTrades]   = useState(false);
  const [notifNews, setNotifNews]       = useState(true);
  const [showJerseyNum, setShowJerseyNum] = useState(true);
  const [themeMode, setThemeMode]       = useState<FoopyThemeMode>("default");

  // UI
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut]         = useState(false);

  // Load profile
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setEmail(user.email ?? null);
      supabase.from("profiles").select("avatar_url, username").eq("id", user.id).single()
        .then(({ data }) => {
          if (!data) return;
          setAvatarUrl(data.avatar_url ?? null);
          setUsername(data.username ?? null);
          const label = data.username || user.email?.split("@")[0] || "?";
          setInitials(label[0].toUpperCase());
        });
    });

    // Load prefs
    setFavTeam(localStorage.getItem("foopy_fav_team") ?? "");
    setDefaultStat(localStorage.getItem("foopy_default_stat") ?? "disposals");
    setNotifGames(localStorage.getItem("foopy_notif_games") !== "false");
    setNotifPacks(localStorage.getItem("foopy_notif_packs") !== "false");
    setNotifTrades(localStorage.getItem("foopy_notif_trades") === "true");
    setNotifNews(localStorage.getItem("foopy_notif_news") !== "false");
    setShowJerseyNum(localStorage.getItem("foopy_show_jersey") !== "false");

    const storedThemeMode = normalizeThemeMode(localStorage.getItem(FOOPY_THEME_KEY));
    setThemeMode(storedThemeMode);
    applyThemeMode(storedThemeMode);
  }, []);

  function savePref(key: string, value: string) {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event("foopy-settings-changed"));
  }

  function toggle(key: string, current: boolean, setter: (v: boolean) => void) {
    const next = !current;
    setter(next);
    savePref(key, String(next));
  }

  function chooseThemeMode(mode: FoopyThemeMode) {
    setThemeMode(mode);
    localStorage.setItem(FOOPY_THEME_KEY, mode);
    applyThemeMode(mode);
    window.dispatchEvent(new Event("foopy-settings-changed"));
  }

  async function handleSignOut() {
    if (!signOutConfirm) { setSignOutConfirm(true); return; }
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/");
  }

  const favTeamColor = favTeam ? (TEAM_COLOR[favTeam] ?? "#3b82f6") : "#3b82f6";

  return (
    <>
      <style>{`
        .srow:active { background: var(--surface-2) !important; }
        .steambtn:active { opacity: 0.7; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <main style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--text-1)",
        paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
      }}>

        {/* ── Header ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "var(--bottom-nav-bg)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--border-1)",
          padding: "env(safe-area-inset-top) 16px 0 58px",
          height: "calc(52px + env(safe-area-inset-top))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-1)" }}>
            Settings
          </span>
        </header>

        {/* ── Content ── */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* ── Profile card ── */}
          <Link href="/profile" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-1)",
              borderRadius: 18,
              padding: "16px",
              display: "flex", alignItems: "center", gap: 14,
              WebkitTapHighlightColor: "transparent",
            }}>
              {/* Avatar */}
              <div style={{
                width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                overflow: "hidden",
                background: "linear-gradient(135deg, #1e3a5f, #0f172a)",
                border: "2px solid var(--border-2)",
              }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{
                      width: "100%", height: "100%", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      color: "var(--text-2)", fontSize: 22, fontWeight: 800,
                    }}>
                      {initials}
                    </div>
                }
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: "var(--text-1)",
                  letterSpacing: "-0.02em", marginBottom: 3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {username ? `@${username}` : "Set up your profile"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
                  {email ?? "Not signed in"}
                </div>
              </div>

              {/* Arrow */}
              <div style={{
                fontSize: 11, fontWeight: 600, color: "#3b82f6",
                display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
              }}>
                Edit
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </Link>

          {/* ── My Team ── */}
          <Section label="My Team">
            <Row
              icon={
                favTeam && TEAM_LOGO[favTeam]
                  ? <img src={TEAM_LOGO[favTeam]} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              }
              label="Favourite Team"
              sub={favTeam || "Not selected"}
              onPress={() => setShowTeamPicker(true)}
              last
            >
              {favTeam && (
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: favTeamColor, marginRight: 4,
                }} />
              )}
            </Row>
          </Section>

          {/* ── Stats Preferences ── */}
          <Section label="Stats">
            <Row
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              }
              label="Default Category"
              sub={STAT_OPTIONS.find(s => s.value === defaultStat)?.label ?? "Disposals"}
              last
            >
              <select
                value={defaultStat}
                onChange={e => { setDefaultStat(e.target.value); savePref("foopy_default_stat", e.target.value); }}
                style={{
                  background: "var(--surface-3)", border: "1px solid var(--border-2)",
                  borderRadius: 8, color: "var(--text-1)", fontSize: 12, fontWeight: 600,
                  padding: "6px 8px", cursor: "pointer", outline: "none",
                }}
              >
                {STAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Row>
          </Section>

          {/* ── Notifications ── */}
          <Section label="Notifications">
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              label="Game Day Alerts"
              sub="Notify me when a game starts"
            >
              <Toggle on={notifGames} onToggle={() => toggle("foopy_notif_games", notifGames, setNotifGames)} />
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
              label="Card Pack Drops"
              sub="New packs available"
            >
              <Toggle on={notifPacks} onToggle={() => toggle("foopy_notif_packs", notifPacks, setNotifPacks)} />
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>}
              label="Trade Alerts"
              sub="When someone offers a trade"
            >
              <Toggle on={notifTrades} onToggle={() => toggle("foopy_notif_trades", notifTrades, setNotifTrades)} />
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
              label="Foopy News"
              sub="App updates and announcements"
              last
            >
              <Toggle on={notifNews} onToggle={() => toggle("foopy_notif_news", notifNews, setNotifNews)} />
            </Row>
          </Section>

          {/* ── Display ── */}
          <Section label="Display">
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3v18"/><path d="M12 8h7"/><path d="M12 16h7"/></svg>}
              label="Theme Mode"
              sub="Default grey, white, or black"
            >
              <div
                role="radiogroup"
                aria-label="Theme mode"
                style={{
                  width: "min(208px, 48vw)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 3,
                  padding: 3,
                  borderRadius: 12,
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-2)",
                }}
              >
                {THEME_OPTIONS.map(option => {
                  const active = themeMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseThemeMode(option.value)}
                      style={{
                        border: "none",
                        borderRadius: 9,
                        background: active ? "var(--bg)" : "transparent",
                        color: active ? "var(--text-1)" : "var(--text-2)",
                        boxShadow: active ? "0 1px 8px rgba(0,0,0,0.18)" : "none",
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1,
                        padding: "8px 4px",
                        cursor: "pointer",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
              label="Show Jersey Numbers"
              sub="Display #number on player cards"
              last
            >
              <Toggle on={showJerseyNum} onToggle={() => toggle("foopy_show_jersey", showJerseyNum, setShowJerseyNum)} />
            </Row>
          </Section>

          {/* ── Data ── */}
          <Section label="Data">
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>}
              label="Player Stats"
              sub="Run fetch:stats to update"
              last
            >
              <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>2026 Season</span>
            </Row>
          </Section>

          {/* ── Account ── */}
          <Section label="Account">
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label={signOutConfirm ? "Tap again to confirm" : signingOut ? "Signing out…" : "Sign Out"}
              sub={email ?? undefined}
              onPress={handleSignOut}
              destructive
              last
            />
          </Section>

          {/* ── About ── */}
          <Section label="About">
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              label="Version"
              sub="Foopy"
            >
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>1.0.0</span>
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              label="Season"
            >
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>AFL 2026</span>
            </Row>
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              label="Privacy Policy"
              onPress={() => {}}
            />
            <Row
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
              label="Terms of Service"
              onPress={() => {}}
              last
            />
          </Section>

        </div>

        {/* ── Team Picker popup ── */}
        {showTeamPicker && (
          <>
            <div
              onClick={() => setShowTeamPicker(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 100,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              }}
            />
            <div style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 101,
              width: "min(340px, 88vw)", maxHeight: "78dvh",
              background: "var(--surface-1)",
              border: "1px solid var(--border-2)",
              borderRadius: 20, overflow: "hidden",
              display: "flex", flexDirection: "column",
              boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "15px 18px 13px",
                borderBottom: "1px solid var(--border-1)", flexShrink: 0,
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Choose Your Team</span>
                <button
                  onClick={() => setShowTeamPicker(false)}
                  style={{
                    background: "var(--surface-3)", border: "none",
                    borderRadius: "50%", width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "var(--text-2)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* List */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {/* None option */}
                <button
                  className="steambtn"
                  onClick={() => { setFavTeam(""); savePref("foopy_fav_team", ""); setShowTeamPicker(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "12px 18px", background: favTeam === "" ? "var(--surface-2)" : "none",
                    border: "none", borderBottom: "1px solid var(--border-1)",
                    color: favTeam === "" ? "var(--text-1)" : "var(--text-2)",
                    fontSize: 14, fontWeight: favTeam === "" ? 700 : 400, cursor: "pointer", textAlign: "left",
                  }}
                >
                  None
                  {favTeam === "" && (
                    <svg style={{ marginLeft: "auto" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>

                {AFL_TEAMS.map(t => {
                  const active = favTeam === t;
                  const tc = TEAM_COLOR[t];
                  return (
                    <button
                      key={t}
                      className="steambtn"
                      onClick={() => { setFavTeam(t); savePref("foopy_fav_team", t); setShowTeamPicker(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: "12px 18px",
                        background: active ? `${tc}15` : "none",
                        border: "none", borderBottom: "1px solid var(--border-1)",
                        color: active ? "var(--text-1)" : "var(--text-2)",
                        fontSize: 14, fontWeight: active ? 700 : 400, cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        overflow: "hidden", background: `${tc}18`,
                        border: `1px solid ${tc}33`,
                      }}>
                        {TEAM_LOGO[t] && <img src={TEAM_LOGO[t]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      {t}
                      {active && (
                        <svg style={{ marginLeft: "auto" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
