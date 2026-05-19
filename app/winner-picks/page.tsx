"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Lock } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";

type Game = {
  id: number;
  round: number;
  hteam?: string;
  ateam?: string;
  hteamid?: number;
  ateamid?: number;
  hscore?: number | null;
  ascore?: number | null;
  complete?: number;
  is_final?: number;
  date?: string;
  timestr?: string;
  venue?: string;
};

type Picks = Record<number, "home" | "away">;

const TEAM_LOGOS: Record<number, string> = {
  1: "/team-logos/crows.png",
  2: "/team-logos/lions.png",
  3: "/team-logos/blues.png",
  4: "/team-logos/magpies.png",
  5: "/team-logos/bombers.png",
  6: "/team-logos/dockers.png",
  7: "/team-logos/cats.png",
  8: "/team-logos/suns.png",
  9: "/team-logos/giants.png",
  10: "/team-logos/hawks.png",
  11: "/team-logos/demons.png",
  12: "/team-logos/kangaroos.png",
  13: "/team-logos/power.png",
  14: "/team-logos/tigers.png",
  15: "/team-logos/saints.png",
  16: "/team-logos/swans.png",
  17: "/team-logos/eagles.png",
  18: "/team-logos/bulldogs.png",
};

const TEAM_NAMES: Record<number, string> = {
  1: "Adelaide",
  2: "Brisbane Lions",
  3: "Carlton",
  4: "Collingwood",
  5: "Essendon",
  6: "Fremantle",
  7: "Geelong Cats",
  8: "Gold Coast",
  9: "GWS Giants",
  10: "Hawthorn",
  11: "Melbourne",
  12: "North Melbourne",
  13: "Port Adelaide",
  14: "Richmond",
  15: "St Kilda",
  16: "Sydney",
  17: "West Coast",
  18: "Western Bulldogs",
};

function isCompleted(g: Game) {
  return (g.complete ?? 0) >= 100 || g.is_final === 1;
}

function isLive(g: Game) {
  const c = g.complete ?? 0;
  return c > 0 && c < 100;
}

function getWinner(g: Game): "home" | "away" | "draw" | null {
  if (!isCompleted(g)) return null;
  const hs = g.hscore ?? 0;
  const as = g.ascore ?? 0;
  if (hs > as) return "home";
  if (as > hs) return "away";
  return "draw";
}

export default function WinnerPicksPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<Picks>({});
  const [justSaved, setJustSaved] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  // Load games
  useEffect(() => {
    fetch("/api/games", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const all: Game[] = Array.isArray(data) ? data : (data.games ?? []);
        setGames(all);
        const live = all.find(isLive);
        const next = all.find((g) => (g.complete ?? 0) < 100);
        const latest = [...all].reverse().find(isCompleted);
        setSelectedRound(live?.round ?? next?.round ?? latest?.round ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load saved picks from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("foopy_picks");
      if (raw) setPicks(JSON.parse(raw));
    } catch {}
  }, []);

  const availableRounds = useMemo(() => {
    const rounds = Array.from(new Set(games.map((g) => g.round)))
      .filter((r) => r >= 1 && r <= 24)
      .sort((a, b) => a - b);
    return rounds;
  }, [games]);

  const roundGames = useMemo(
    () => (selectedRound ? games.filter((g) => g.round === selectedRound) : []),
    [games, selectedRound]
  );

  const { correct, total } = useMemo(() => {
    let correct = 0;
    let total = 0;
    roundGames.forEach((g) => {
      const pick = picks[g.id];
      const winner = getWinner(g);
      if (pick && winner && winner !== "draw") {
        total++;
        if (pick === winner) correct++;
      }
    });
    return { correct, total };
  }, [roundGames, picks]);

  const openGames = roundGames.filter((g) => !isCompleted(g) && !isLive(g));
  const pickedOpen = openGames.filter((g) => picks[g.id]).length;

  function makePick(gameId: number, side: "home" | "away") {
    const game = games.find((g) => g.id === gameId);
    if (!game || isCompleted(game) || isLive(game)) return;
    setPicks((prev) => ({ ...prev, [gameId]: side }));
    setJustSaved(false);
  }

  function savePicks() {
    try {
      localStorage.setItem("foopy_picks", JSON.stringify(picks));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    } catch {}
  }

  const scoreRight = total > 0 ? (
    <div style={scoreBubbleStyle}>
      <span style={scoreBigStyle}>{correct}/{total}</span>
      <span style={scoreSmallStyle}>correct</span>
    </div>
  ) : undefined;

  return (
    <main style={pageStyle} className="page-enter">
      <PageHeader title="Winner Picks" subtitle="Pick the winner for each game" right={scoreRight} />

      {/* Round selector */}
      <div style={roundRowStyle}>
        {availableRounds.map((r) => {
          const active = r === selectedRound;
          return (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              style={{
                ...roundBtnStyle,
                background: active ? "var(--text-1)" : "var(--border-1)",
                color: active ? "var(--bg)" : "var(--text-2)",
                border: `1px solid ${active ? "var(--text-1)" : "var(--border-3)"}`,
              }}
            >
              {r}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 120, borderRadius: 18 }} className="skeleton" />
          ))}
        </div>
      ) : (
        <>
          <div style={gamesListStyle}>
            {roundGames.map((g) => {
              const hid = g.hteamid;
              const aid = g.ateamid;
              if (!hid || !aid) return null;

              const pick = picks[g.id];
              const locked = isCompleted(g) || isLive(g);
              const winner = getWinner(g);
              const correct = pick && winner && pick === winner;
              const wrong = pick && winner && winner !== "draw" && pick !== winner;

              return (
                <div key={g.id} style={gameCardStyle}>
                  {/* Lock bar */}
                  {locked && (
                    <div style={lockBarStyle}>
                      <Lock size={10} />
                      <span>{isLive(g) ? "LIVE — locked" : "Full Time"}</span>
                      {pick && winner && winner !== "draw" && (
                        <span
                          style={{
                            marginLeft: "auto",
                            color: correct ? "#22c55e" : "#ef4444",
                            fontWeight: 900,
                          }}
                        >
                          {correct ? "✓ Correct" : "✗ Wrong"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Pick row */}
                  <div style={pickRowStyle}>
                    {/* Home */}
                    <PickButton
                      id={hid}
                      name={g.hteam ?? TEAM_NAMES[hid]}
                      score={isCompleted(g) ? (g.hscore ?? 0) : undefined}
                      isWinner={winner === "home"}
                      selected={pick === "home"}
                      wrong={!!wrong && pick === "home"}
                      locked={locked}
                      onPress={() => makePick(g.id, "home")}
                    />

                    <div style={vsDivStyle}>
                      <span style={vsTextStyle}>VS</span>
                      {!locked && g.timestr && (
                        <span style={gameTimeStyle}>{g.timestr}</span>
                      )}
                    </div>

                    {/* Away */}
                    <PickButton
                      id={aid}
                      name={g.ateam ?? TEAM_NAMES[aid]}
                      score={isCompleted(g) ? (g.ascore ?? 0) : undefined}
                      isWinner={winner === "away"}
                      selected={pick === "away"}
                      wrong={!!wrong && pick === "away"}
                      locked={locked}
                      onPress={() => makePick(g.id, "away")}
                    />
                  </div>
                </div>
              );
            })}

            {roundGames.length === 0 && (
              <div style={emptyStyle}>No games for Round {selectedRound}.</div>
            )}
          </div>

          {/* Save button */}
          {openGames.length > 0 && (
            <div style={saveAreaStyle}>
              <p style={progressStyle}>
                {pickedOpen} / {openGames.length} picks made
              </p>
              <button
                onClick={savePicks}
                style={{
                  ...saveButtonStyle,
                  background: justSaved
                    ? "linear-gradient(135deg,#22c55e,#16a34a)"
                    : "linear-gradient(135deg,#3b82f6,#6366f1)",
                  boxShadow: justSaved
                    ? "0 4px 18px rgba(34,197,94,.4)"
                    : "0 4px 18px rgba(59,130,246,.4)",
                }}
              >
                {justSaved ? "✓  Picks Locked In!" : "Lock In Picks"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/* ──────────────────────────────────────────────── */
/* Pick button                                       */
/* ──────────────────────────────────────────────── */

function PickButton({
  id,
  name,
  score,
  isWinner,
  selected,
  wrong,
  locked,
  onPress,
}: {
  id: number;
  name: string;
  score?: number;
  isWinner: boolean;
  selected: boolean;
  wrong: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const dimmed = locked && !isWinner && !selected;

  return (
    <button
      onClick={onPress}
      disabled={locked}
      style={{
        ...pickBtnBase,
        background: selected
          ? wrong
            ? "rgba(239,68,68,.15)"
            : "rgba(59,130,246,.16)"
          : "var(--border-1)",
        border: `2px solid ${
          selected
            ? wrong
              ? "#ef4444"
              : "#3b82f6"
            : "var(--border-2)"
        }`,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      <img
        src={TEAM_LOGOS[id]}
        alt={name}
        style={{
          width: 46,
          height: 46,
          objectFit: "contain",
          filter: "drop-shadow(0 2px 8px rgba(0,0,0,.5))",
        }}
      />
      <span style={pickNameStyle}>{name}</span>
      {score !== undefined && (
        <span
          style={{
            fontSize: 20,
            fontWeight: 950,
            color: isWinner ? "#3b82f6" : "white",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
        </span>
      )}
      {isWinner && locked && (
        <CheckCircle size={14} color="#22c55e" style={{ marginTop: 2 }} />
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────── */
/* Styles                                            */
/* ──────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const scoreBubbleStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  background: "rgba(34,197,94,.12)",
  border: "1px solid rgba(34,197,94,.22)",
  borderRadius: 14,
  padding: "10px 16px",
  minWidth: 68,
};

const scoreBigStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  color: "#22c55e",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const scoreSmallStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#4ade80",
  fontWeight: 700,
  marginTop: 3,
};

const roundRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  padding: "12px 16px 16px",
  overflowX: "auto",
  scrollbarWidth: "none",
};

const roundBtnStyle: React.CSSProperties = {
  minWidth: 38,
  height: 38,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  flexShrink: 0,
};

const gamesListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "0 16px",
};

const gameCardStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  overflow: "hidden",
};

const lockBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  background: "var(--surface-2)",
  borderBottom: "1px solid var(--border-1)",
  fontSize: 11,
  fontWeight: 800,
  color: "var(--text-3)",
};

const pickRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 8,
  padding: "12px",
  alignItems: "center",
};

const pickBtnBase: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 7,
  padding: "14px 8px",
  borderRadius: 16,
  color: "var(--text-1)",
  width: "100%",
  transition:
    "transform 0.12s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s ease, background 0.15s ease, border-color 0.15s ease",
};

const pickNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
  lineHeight: 1.2,
  maxWidth: 90,
};

const vsDivStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  minWidth: 40,
};

const vsTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#1e293b",
  letterSpacing: "0.02em",
};

const gameTimeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#60a5fa",
  fontWeight: 700,
  textAlign: "center",
};

const saveAreaStyle: React.CSSProperties = {
  padding: "20px 16px 10px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const progressStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--text-3)",
  fontWeight: 700,
};

const saveButtonStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 340,
  padding: "17px 24px",
  borderRadius: 16,
  border: "none",
  color: "var(--text-1)",
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  transition:
    "transform 0.12s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease, box-shadow 0.3s ease",
};

const emptyStyle: React.CSSProperties = {
  padding: "60px 20px",
  textAlign: "center",
  color: "var(--text-3)",
};
