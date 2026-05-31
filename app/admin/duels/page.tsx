"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ADMIN_SECRET = "foopy123";
const MARGIN_RANGES = ["1-12", "13-24", "25-36", "37-48", "49+"];

type Game = {
  id: number;
  round: number;
  hteam: string;
  ateam: string;
  date: string;
  complete: number;
};

type DuelQuestion = {
  question_order: number;
  is_tiebreaker: boolean;
  question_text: string;
  option_a: string;
  option_b: string;
};

type DuelGame = {
  id: string;
  game_id: number;
  round: number;
  season: number;
  home_team: string;
  away_team: string;
  game_date: string;
  status: "open" | "locked" | "complete";
  duel_questions?: any[];
};

function emptyQuestions(homeTeam: string, awayTeam: string): DuelQuestion[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => ({
      question_order: i + 1,
      is_tiebreaker: false,
      question_text: "",
      option_a: "",
      option_b: "",
    })),
    {
      question_order: 11,
      is_tiebreaker: true,
      question_text: "Which team wins, and by what margin?",
      option_a: homeTeam,
      option_b: awayTeam,
    },
  ];
}

export default function AdminDuelsPage() {
  const [unlocked, setUnlocked]     = useState(false);
  const [password, setPassword]     = useState("");
  const [games, setGames]           = useState<Game[]>([]);
  const [duelGames, setDuelGames]   = useState<DuelGame[]>([]);
  const [loading, setLoading]       = useState(false);
  const [view, setView]             = useState<"list" | "create">("list");

  // Create form state
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [questions, setQuestions]       = useState<DuelQuestion[]>([]);
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState("");

  function handleLogin() {
    if (password === ADMIN_SECRET) setUnlocked(true);
    else alert("Wrong password");
  }

  async function loadDuelGames() {
    const res = await fetch("/api/duels/admin/games", {
      headers: { "x-admin-secret": ADMIN_SECRET },
    });
    const json = await res.json();
    setDuelGames(json.games ?? []);
  }

  async function loadSquiggleGames() {
    setLoading(true);
    const res = await fetch("/api/squiggle/games");
    const json = await res.json();
    const all: Game[] = Array.isArray(json) ? json : json.games ?? [];
    // Show upcoming and recent games
    setGames(all.filter((g) => (g.complete ?? 0) < 100).slice(0, 30));
    setLoading(false);
  }

  useEffect(() => {
    if (unlocked) {
      loadDuelGames();
      loadSquiggleGames();
    }
  }, [unlocked]);

  function pickGame(game: Game) {
    setSelectedGame(game);
    setQuestions(emptyQuestions(game.hteam, game.ateam));
    setView("create");
  }

  function updateQuestion(index: number, field: keyof DuelQuestion, value: string | boolean) {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function saveNewDuel() {
    if (!selectedGame) return;
    // Validate regular questions
    for (let i = 0; i < 10; i++) {
      const q = questions[i];
      if (!q.question_text || !q.option_a || !q.option_b) {
        alert(`Question ${i + 1} is incomplete`);
        return;
      }
    }
    setSaving(true);
    setSaveMsg("");

    try {
      // Create the duel game
      const gameRes = await fetch("/api/duels/admin/games", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({
          game_id:   selectedGame.id,
          round:     selectedGame.round,
          season:    new Date(selectedGame.date).getFullYear(),
          home_team: selectedGame.hteam,
          away_team: selectedGame.ateam,
          game_date: selectedGame.date,
        }),
      });
      const gameJson = await gameRes.json();
      if (!gameRes.ok) throw new Error(gameJson.error ?? "Failed to create duel game");

      // Save questions
      const qRes = await fetch("/api/duels/admin/questions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({
          duel_game_id: gameJson.game.id,
          questions,
        }),
      });
      if (!qRes.ok) {
        const qJson = await qRes.json();
        throw new Error(qJson.error ?? "Failed to save questions");
      }

      setSaveMsg("Duel created successfully!");
      await loadDuelGames();
      setTimeout(() => { setView("list"); setSaveMsg(""); }, 1500);
    } catch (err: any) {
      setSaveMsg(err.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/duels/admin/games", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ id, status }),
    });
    loadDuelGames();
  }

  async function deleteGame(id: string) {
    if (!confirm("Delete this duel game and all its questions/matchups?")) return;
    await fetch(`/api/duels/admin/games?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-secret": ADMIN_SECRET },
    });
    loadDuelGames();
  }

  if (!unlocked) {
    return (
      <main className="page grid">
        <section className="card" style={{ maxWidth: 420, margin: "80px auto" }}>
          <span className="pill">Admin only</span>
          <h1>Duels Admin</h1>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{ marginTop: 16 }}
          />
          <button className="button" onClick={handleLogin} style={{ marginTop: 12, width: "100%" }}>
            Unlock
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page grid">
      <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="pill">Admin</span>
          <h1 style={{ marginTop: 8 }}>Duels Manager</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/admin" style={{ ...btnStyle, background: "var(--surface-3)" }}>← Back to Admin</Link>
          {view === "list"
            ? <button className="button" onClick={() => setView("create")}>+ New Duel</button>
            : <button style={{ ...btnStyle, background: "var(--surface-3)" }} onClick={() => setView("list")}>← Back</button>
          }
        </div>
      </section>

      {/* ── List view ── */}
      {view === "list" && (
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Active Duel Games</h2>
          {duelGames.length === 0 && (
            <p className="muted">No duel games yet. Click "+ New Duel" to create one.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {duelGames.map((dg) => (
              <div key={dg.id} style={duelRowStyle}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {dg.home_team} vs {dg.away_team}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    Round {dg.round} · {new Date(dg.game_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...statusPillStyle, background: statusColor(dg.status) }}>
                      {dg.status}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {dg.duel_questions?.length ?? 0} questions
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {dg.status === "open" && (
                    <button style={smallBtnStyle} onClick={() => updateStatus(dg.id, "locked")}>Lock</button>
                  )}
                  {dg.status === "locked" && (
                    <button style={smallBtnStyle} onClick={() => updateStatus(dg.id, "complete")}>Mark Complete</button>
                  )}
                  {dg.status === "complete" && (
                    <span style={{ ...statusPillStyle, background: "#16a34a", fontSize: 12 }}>Done</span>
                  )}
                  <button style={{ ...smallBtnStyle, background: "#dc2626" }} onClick={() => deleteGame(dg.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Create view ── */}
      {view === "create" && (
        <>
          {/* Game picker */}
          {!selectedGame && (
            <section className="card">
              <h2 style={{ marginBottom: 16 }}>Pick a Game</h2>
              {loading && <p className="muted">Loading games...</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {games.map((g) => (
                  <button key={g.id} onClick={() => pickGame(g)} style={gamePickRowStyle}>
                    <span style={{ fontWeight: 700 }}>{g.hteam} vs {g.ateam}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Round {g.round} · {new Date(g.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Questions form */}
          {selectedGame && (
            <section className="card">
              <h2>
                {selectedGame.hteam} vs {selectedGame.ateam}
                <span className="muted" style={{ fontWeight: 400, fontSize: 14, marginLeft: 10 }}>
                  Round {selectedGame.round}
                </span>
              </h2>
              <button
                style={{ ...smallBtnStyle, marginTop: 8, marginBottom: 20 }}
                onClick={() => setSelectedGame(null)}
              >
                Change game
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Regular questions 1-10 */}
                {questions.slice(0, 10).map((q, i) => (
                  <div key={i} style={questionBlockStyle}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: "#94a3b8" }}>
                      Question {i + 1}
                    </div>
                    <input
                      placeholder="Question text (e.g. Who kicks more goals?)"
                      value={q.question_text}
                      onChange={(e) => updateQuestion(i, "question_text", e.target.value)}
                      style={inputStyle}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      <input
                        placeholder="Option A"
                        value={q.option_a}
                        onChange={(e) => updateQuestion(i, "option_a", e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="Option B"
                        value={q.option_b}
                        onChange={(e) => updateQuestion(i, "option_b", e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                ))}

                {/* Tiebreaker (question 11) */}
                {questions[10] && (
                  <div style={{ ...questionBlockStyle, borderColor: "#f59e0b" }}>
                    <div style={{ fontWeight: 700, marginBottom: 10, color: "#f59e0b" }}>
                      Tiebreaker (Q11)
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 8 }}>
                      Which team wins, and by what margin?
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={inputStyle}>{selectedGame.hteam} (Option A)</div>
                      <div style={inputStyle}>{selectedGame.ateam} (Option B)</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                      Margin ranges: {MARGIN_RANGES.join(", ")} — users pick the team + a margin range
                    </div>
                  </div>
                )}
              </div>

              {saveMsg && (
                <div style={{
                  marginTop: 16, padding: "10px 14px", borderRadius: 10,
                  background: saveMsg.includes("success") ? "#16a34a22" : "#dc262622",
                  color: saveMsg.includes("success") ? "#4ade80" : "#f87171",
                  fontSize: 14,
                }}>
                  {saveMsg}
                </div>
              )}

              <button
                className="button"
                style={{ marginTop: 20, width: "100%" }}
                onClick={saveNewDuel}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Duel"}
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function statusColor(status: string) {
  if (status === "open")     return "#16a34a22";
  if (status === "locked")   return "#f59e0b22";
  if (status === "complete") return "#64748b22";
  return "var(--surface-3)";
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border-2)",
  cursor: "pointer", fontWeight: 600, fontSize: 14, color: "var(--text-1)",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "none",
  background: "var(--surface-3)", color: "var(--text-1)",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

const statusPillStyle: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 999,
  fontSize: 12, fontWeight: 700, textTransform: "capitalize",
  border: "1px solid rgba(255,255,255,0.08)",
};

const duelRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  flexWrap: "wrap", gap: 12,
  padding: 16, borderRadius: 12,
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
};

const gamePickRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexWrap: "wrap", gap: 8,
  padding: "12px 14px", borderRadius: 10,
  background: "var(--surface-2)", border: "1px solid var(--border-2)",
  cursor: "pointer", textAlign: "left",
  color: "var(--text-1)",
};

const questionBlockStyle: React.CSSProperties = {
  padding: 16, borderRadius: 12,
  background: "var(--surface-2)",
  border: "1px solid var(--border-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "var(--surface-1)", border: "1px solid var(--border-2)",
  color: "var(--text-1)", fontSize: 14, boxSizing: "border-box",
};
