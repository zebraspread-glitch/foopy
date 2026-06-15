"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { foopyColor } from "@/app/lib/foopyRating";
import { playerImgUrl } from "@/app/lib/playerImage";
import PageHeader from "@/app/components/PageHeader";

/* ─── Types ───────────────────────────────────────────────── */

type Player = {
  id: string;
  name: string;
  team: string;
  apiSportsId?: number;
  games?: number;
  avgFoopy?: number | null;
};

/* ─── Helpers ─────────────────────────────────────────────── */

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamFolder(team: string): string {
  const map: Record<string, string> = {
    Adelaide: "crows", "Adelaide Crows": "crows",
    Brisbane: "lions", "Brisbane Lions": "lions",
    Carlton: "blues", Collingwood: "magpies", Essendon: "bombers",
    Fremantle: "dockers", Geelong: "cats", "Geelong Cats": "cats",
    "Gold Coast": "suns", GWS: "giants", "GWS Giants": "giants",
    "Greater Western Sydney": "giants", Hawthorn: "hawks",
    Melbourne: "demons", "North Melbourne": "kangaroos",
    "Port Adelaide": "power", Richmond: "tigers",
    "St Kilda": "saints", Sydney: "swans",
    "West Coast": "eagles", "Western Bulldogs": "bulldogs",
  };
  return map[team] ?? slugify(team);
}

/* ─── Styles ──────────────────────────────────────────────── */

const pageStyle = {
  minHeight: "100dvh",
  background: "var(--bg)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
} as const;

const cardStyle = {
  background: "var(--surface-1)",
  borderRadius: 16,
  overflow: "hidden",
  margin: "12px 12px 0",
  border: "1px solid var(--border-1)",
} as const;

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 16px",
  borderBottom: "1px solid var(--border-1)",
  cursor: "pointer",
  transition: "background 0.1s",
} as const;

/* ─── Avatar ──────────────────────────────────────────────── */

function PlayerAvatar({ name, team, size = 40 }: { name: string; team: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = playerImgUrl(name, team);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--surface-3)", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", fontSize: size * 0.35, fontWeight: 900,
      color: "var(--text-1)", letterSpacing: "-0.02em",
    }}>
      {!failed ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
      ) : initials}
    </span>
  );
}

/* ─── Rank badge ──────────────────────────────────────────── */

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : "var(--text-4)";
  return (
    <span style={{ fontWeight: 900, fontSize: 14, color, minWidth: 26, textAlign: "center", display: "inline-block" }}>
      {rank}
    </span>
  );
}

/* ─── Skeleton ────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div style={{ ...itemStyle, cursor: "default" }}>
      <div style={{ width: 26, height: 16, borderRadius: 4, background: "var(--surface-3)" }} />
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface-3)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ width: "55%", height: 13, borderRadius: 4, background: "var(--surface-3)" }} />
        <div style={{ width: "35%", height: 11, borderRadius: 4, background: "var(--surface-3)" }} />
      </div>
      <div style={{ width: 36, height: 24, borderRadius: 4, background: "var(--surface-3)" }} />
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────── */

export default function FoopyRatingsPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => {
    fetch("/api/player-season-stats")
      .then(r => r.json())
      .then((data: Player[]) => {
        // Only players who have a computed avgFoopy
        const ranked = data
          .filter(p => p.avgFoopy != null)
          .sort((a, b) => (b.avgFoopy ?? 0) - (a.avgFoopy ?? 0));
        setPlayers(ranked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p =>
      p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
    );
  }, [players, search]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <main style={pageStyle} className="page-enter">
      <style jsx global>{`
        @media (max-width: 700px) {
          .fr-item { padding: 11px 14px !important; }
          .fr-name { font-size: 14px !important; }
          .fr-score { font-size: 22px !important; }
        }
      `}</style>

      <PageHeader
        title="Season Foopy Ratings"
        onBack={() => router.back()}
        align="left"
        right={!loading ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>{players.length} players</span> : undefined}
      />

      {/* Search */}
      <div style={{ padding: "10px 12px 0" }}>
        <input
          type="text"
          placeholder="Search player or team…"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(60); }}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--border-1)",
            background: "var(--surface-1)", color: "var(--text-1)",
            fontSize: 14, fontWeight: 600, outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={cardStyle}>
        {loading ? (
          Array.from({ length: 20 }).map((_, i) => <Skeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontWeight: 700 }}>
            No players found
          </div>
        ) : (
          <>
            {visible.map((p, i) => {
              // Global rank is position in the unfiltered list (so search doesn't re-rank)
              const globalRank = players.indexOf(p) + 1;
              return (
                <div
                  key={p.id || `${p.name}-${p.team}`}
                  className="fr-item"
                  style={itemStyle}
                  onClick={() => p.id && router.push(`/player/${p.id}`)}
                >
                  <div style={{ width: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <RankBadge rank={globalRank} />
                  </div>
                  <PlayerAvatar name={p.name} team={p.team} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fr-name" style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 2 }}>
                      {p.team}{p.games ? ` · ${p.games} GP` : ""}
                    </div>
                  </div>
                  <div className="fr-score" style={{ fontWeight: 950, fontSize: 24, letterSpacing: "-0.04em", lineHeight: 1, color: foopyColor(p.avgFoopy!) }}>
                    {p.avgFoopy!.toFixed(1)}
                  </div>
                </div>
              );
            })}

            {visibleCount < filtered.length && (
              <button
                onClick={() => setVisibleCount(c => c + 60)}
                style={{
                  width: "100%", padding: 16, border: "none",
                  background: "transparent", color: "#3b82f6",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
