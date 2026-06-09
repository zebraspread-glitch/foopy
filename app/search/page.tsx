"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { VerifiedBadge } from "@/app/components/VerifiedBadge";
import playersData from "@/app/data/players.json";
import { playerImgUrl } from "@/app/lib/playerImage";

// ── Types ─────────────────────────────────────────────────────────────────────

type Profile = { id: string; username: string | null; avatar_url: string | null; verified?: boolean };

type Player = { id: string; name: string; team: string };

// ── Team helpers ──────────────────────────────────────────────────────────────

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns", gwsgiants: "giants",
  gws: "giants", hawthorn: "hawks", melbourne: "demons",
  northmelbourne: "kangaroos", portadelaide: "power", richmond: "tigers",
  stkilda: "saints", sydney: "swans", westcoast: "eagles",
  westernbulldogs: "bulldogs",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Brisbane: "#a50034",
  Carlton: "#031a35", Collingwood: "#1e1e28", Essendon: "#cc0000",
  Fremantle: "#4b1979", "Geelong Cats": "#003b73", Geelong: "#003b73",
  "Gold Coast": "#c0392b", "GWS Giants": "#e05a1a", GWS: "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

function slugTeam(t: string) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function teamColor(t: string) { return TEAM_COLORS[t] ?? "#1e293b"; }
function playerImgSrc(name: string, team: string) { return playerImgUrl(name, team); }

// All players indexed once
const ALL_PLAYERS: Player[] = (playersData as Player[]).filter(p => p.name && p.team);

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_PALETTE: [string, string][] = [
  ["#1a3a5c","#60a5fa"],["#2d1b4e","#c084fc"],["#1a3d2e","#4ade80"],
  ["#3d2a10","#fb923c"],["#3d1a1a","#f87171"],["#1a3d3a","#2dd4bf"],
  ["#2a2a10","#facc15"],["#1a2a3d","#38bdf8"],
];
function avatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UserAvatar({ username, url }: { username: string; url?: string | null }) {
  const [bg, fg] = avatarColors(username || "?");
  if (url) return <img src={url} alt={username} style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: 46, height: 46, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 950, flexShrink: 0 }}>
      {getInitials(username || "?")}
    </div>
  );
}

function PlayerAvatar({ player }: { player: Player }) {
  const [err, setErr] = useState(false);
  const color  = teamColor(player.team);
  const imgSrc = playerImgSrc(player.name, player.team);
  return (
    <div style={{ width: 46, height: 46, borderRadius: "50%", background: color, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {!err
        ? <img src={imgSrc} alt={player.name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 16, fontWeight: 950, color: "var(--text-1)" }}>{getInitials(player.name)}</span>
      }
    </div>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.07em", paddingLeft: 4, marginBottom: 8 }}>
      {label} · {count}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter();
  const [query,        setQuery]        = useState("");
  const [users,        setUsers]        = useState<Profile[]>([]);
  const [players,      setPlayers]      = useState<Player[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [searched,     setSearched]     = useState(false);
  const [visibleUsers, setVisibleUsers] = useState(5);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setUsers([]); setPlayers([]); setSearched(false); setLoading(false); setVisibleUsers(5); return; }

    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Player search — client-side, instant
      const matchedPlayers = ALL_PLAYERS
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 20);
      setPlayers(matchedPlayers);

      // User search — Supabase
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, verified")
        .ilike("username", `%${q}%`)
        .limit(20);
      setUsers((data ?? []) as Profile[]);
      setVisibleUsers(5);
      setSearched(true);
      setLoading(false);
    }, 280);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const hasResults = users.length > 0 || players.length > 0;

  return (
    <main style={pageStyle} className="page-enter">
      <header style={headerStyle}>
        <span style={titleStyle}>Search</span>
      </header>

      <div style={contentStyle}>
        {/* Search bar */}
        <div style={searchBarWrapStyle}>
          <Search size={18} color="#475569" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search players or users…"
            autoComplete="off"
            spellCheck={false}
            style={searchInputStyle}
          />
          {query.length > 0 && (
            <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} style={clearBtnStyle}>×</button>
          )}
        </div>

        {/* Empty state */}
        {!query.trim() && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: 48, marginBottom: 4 }}>🔍</div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "var(--text-1)" }}>Search</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>Find players and users</div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <div className="spinner" />
          </div>
        )}

        {/* No results */}
        {!loading && searched && !hasResults && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: 48, marginBottom: 4 }}>😶</div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "var(--text-1)" }}>No results</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>Try a different name</div>
          </div>
        )}

        {/* Results */}
        {!loading && hasResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Users section */}
            {users.length > 0 && (
              <div>
                <SectionLabel label="Users" count={users.length} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {users.slice(0, visibleUsers).map(u => {
                    const uname = u.username || "unknown";
                    return (
                      <Link key={u.id} href={`/profile/${u.username}`} style={rowStyle} className="pressable">
                        <UserAvatar username={uname} url={u.avatar_url} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 5 }}>@{uname}{u.verified && <VerifiedBadge size={14} />}</div>
                        </div>
                        <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ opacity: 0.25, flexShrink: 0 }}>
                          <path d="M1 1.5l5 5-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </Link>
                    );
                  })}
                  {users.length > visibleUsers && (
                    <button
                      onClick={() => setVisibleUsers(v => v + 5)}
                      style={{ padding: "12px", borderRadius: 14, border: "1px solid var(--border-2)", background: "transparent", color: "#60a5fa", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Load more ({users.length - visibleUsers} remaining)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Players section */}
            {players.length > 0 && (
              <div>
                <SectionLabel label="Players" count={players.length} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {players.map(p => (
                    <Link
                      key={p.id}
                      href={`/player/${p.id}`}
                      style={{ ...rowStyle, textDecoration: "none" }}
                      className="pressable"
                    >
                      <PlayerAvatar player={p} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em" }}>{p.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginTop: 2 }}>{p.team}</div>
                      </div>
                      <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ opacity: 0.25, flexShrink: 0 }}>
                        <path d="M1 1.5l5 5-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  height: "calc(56px + env(safe-area-inset-top))",
  paddingTop: "env(safe-area-inset-top)",
  display: "flex",
  alignItems: "center",
  padding: "env(safe-area-inset-top) 20px 0 58px",
  background: "var(--bottom-nav-bg)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid var(--border-2)",
};

const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em" };

const contentStyle: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "20px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const searchBarWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 16px",
  height: 52,
  borderRadius: 16,
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--text-1)",
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  padding: 0,
  width: "100%",
};

const clearBtnStyle: CSSProperties = {
  background: "var(--border-2)",
  border: "none",
  color: "var(--text-2)",
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  flexShrink: 0,
  padding: 0,
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "60px 24px",
  textAlign: "center",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "12px 14px",
  borderRadius: 16,
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  color: "var(--text-1)",
  textDecoration: "none",
  width: "100%",
  fontFamily: "inherit",
  cursor: "pointer",
};
