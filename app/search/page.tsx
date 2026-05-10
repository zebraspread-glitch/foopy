"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabase } from "@/app/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

/* ── Avatar palette (matches profile page) ── */
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

function UserAvatar({ username, url }: { username: string; url?: string | null }) {
  const [bg, fg] = avatarColors(username || "?");
  if (url) return (
    <img src={url} alt={username} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  );
  return (
    <div style={{ width: 52, height: 52, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 950, flexShrink: 0 }}>
      {getInitials(username || "?")}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<Profile[]>([]);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Debounced search */
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearched(false); setLoading(false); return; }

    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .ilike("username", `%${q}%`)
        .limit(30);

      setResults((data ?? []) as Profile[]);
      setSearched(true);
      setLoading(false);
    }, 280);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return (
    <main style={pageStyle} className="page-enter">
      {/* Header */}
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
            placeholder="Search by username…"
            autoComplete="off"
            spellCheck={false}
            style={searchInputStyle}
          />
          {query.length > 0 && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              style={clearBtnStyle}
            >
              ×
            </button>
          )}
        </div>

        {/* States */}
        {!query.trim() && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>🔍</div>
            <div style={emptyTitleStyle}>Find people</div>
            <div style={emptySubStyle}>Search for a username to view their profile</div>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>😶</div>
            <div style={emptyTitleStyle}>No users found</div>
            <div style={emptySubStyle}>Try a different username</div>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div style={resultsStyle}>
            <div style={resultCountStyle}>
              {results.length} {results.length === 1 ? "result" : "results"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map(profile => {
                const uname = profile.username || "unknown";
                const [bg] = avatarColors(uname);
                return (
                  <Link
                    key={profile.id}
                    href={`/profile/${profile.username}`}
                    style={resultRowStyle}
                    className="pressable"
                  >
                    <UserAvatar username={uname} url={profile.avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={resultNameStyle}>@{uname}</div>
                    </div>
                    <svg width="7" height="13" viewBox="0 0 7 13" fill="none" style={{ opacity: 0.25, flexShrink: 0 }}>
                      <path d="M1 1.5l5 5-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Styles ── */
const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#000",
  color: "#fff",
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
  background: "rgba(0,0,0,0.92)",
  backdropFilter: "blur(28px) saturate(200%)",
  WebkitBackdropFilter: "blur(28px) saturate(200%)",
  borderBottom: "0.5px solid rgba(255,255,255,0.08)",
};

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: "-0.02em",
};

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
  background: "#0d0d0d",
  border: "1px solid rgba(255,255,255,0.1)",
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#fff",
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  padding: 0,
  width: "100%",
};

const clearBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "none",
  color: "#94a3b8",
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

const emptyIconStyle: CSSProperties = {
  fontSize: 48,
  marginBottom: 4,
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#f1f5f9",
};

const emptySubStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#475569",
};

const resultsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const resultCountStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  paddingLeft: 4,
};

const resultRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 16px",
  borderRadius: 18,
  background: "#0d0d0d",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fff",
  textDecoration: "none",
};

const resultNameStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: "-0.01em",
};

const resultBioStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#64748b",
  marginTop: 3,
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 1,
  WebkitBoxOrient: "vertical",
};
