"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import playersJson from "@/app/data/players.json";

const ADMIN_SECRET = "foopy123";
const MARGIN_RANGES = ["1-12", "13-24", "25-36", "37-48", "49+"];

// Same categories as polls — only team + player (not player_all, as duels are 50/50)
const DUEL_CATEGORIES: Record<string, { label: string; stat: string; type: "team" | "player" }> = {
  team_winner:       { label: "Which team wins?",                       stat: "winner",     type: "team" },
  team_goals:        { label: "Which team kicks more goals?",           stat: "goals",      type: "team" },
  team_disposals:    { label: "Which team gets more disposals?",        stat: "disposals",  type: "team" },
  team_marks:        { label: "Which team takes more marks?",           stat: "marks",      type: "team" },
  team_clearances:   { label: "Which team gets more clearances?",       stat: "clearances", type: "team" },
  player_goals:      { label: "Who kicks more goals?",                  stat: "goals",      type: "player" },
  player_disposals:  { label: "Who gets more disposals?",               stat: "disposals",  type: "player" },
  player_marks:      { label: "Who takes more marks?",                  stat: "marks",      type: "player" },
  player_tackles:    { label: "Who makes more tackles?",                stat: "tackles",    type: "player" },
  player_kicks:      { label: "Who kicks more?",                        stat: "kicks",      type: "player" },
  player_handballs:  { label: "Who handballs more?",                    stat: "handballs",  type: "player" },
  player_clearances: { label: "Who wins more clearances?",              stat: "clearances", type: "player" },
  player_hitouts:    { label: "Who gets more hitouts?",                 stat: "hitouts",    type: "player" },
  player_foopy:      { label: "Who has the higher Foopy Rating?",       stat: "foopy",      type: "player" },
};

const TEAM_LOGOS: Record<string, string> = {
  adelaide: "/team-logos/crows.png", "adelaide crows": "/team-logos/crows.png",
  brisbane: "/team-logos/lions.png", "brisbane lions": "/team-logos/lions.png",
  carlton: "/team-logos/blues.png",
  collingwood: "/team-logos/magpies.png",
  essendon: "/team-logos/bombers.png",
  fremantle: "/team-logos/dockers.png",
  geelong: "/team-logos/cats.png", "geelong cats": "/team-logos/cats.png",
  "gold coast": "/team-logos/suns.png", "gold coast suns": "/team-logos/suns.png",
  gws: "/team-logos/giants.png", "gws giants": "/team-logos/giants.png", "greater western sydney": "/team-logos/giants.png",
  hawthorn: "/team-logos/hawks.png", "hawthorn hawks": "/team-logos/hawks.png",
  melbourne: "/team-logos/demons.png", "melbourne demons": "/team-logos/demons.png",
  "north melbourne": "/team-logos/kangaroos.png", "north melbourne kangaroos": "/team-logos/kangaroos.png",
  "port adelaide": "/team-logos/power.png", "port adelaide power": "/team-logos/power.png",
  richmond: "/team-logos/tigers.png", "richmond tigers": "/team-logos/tigers.png",
  "st kilda": "/team-logos/saints.png", "st kilda saints": "/team-logos/saints.png",
  sydney: "/team-logos/swans.png", "sydney swans": "/team-logos/swans.png",
  "west coast": "/team-logos/eagles.png", "west coast eagles": "/team-logos/eagles.png",
  "western bulldogs": "/team-logos/bulldogs.png",
};

const CLUB_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows",
  Brisbane: "lions", "Brisbane Lions": "lions",
  Carlton: "blues",
  Collingwood: "magpies",
  Essendon: "bombers",
  Fremantle: "dockers",
  Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns",
  GWS: "giants", "GWS Giants": "giants", "Greater Western Sydney": "giants",
  Hawthorn: "hawks", "Hawthorn Hawks": "hawks",
  Melbourne: "demons", "Melbourne Demons": "demons",
  "North Melbourne": "kangaroos", "North Melbourne Kangaroos": "kangaroos",
  "Port Adelaide": "power", "Port Adelaide Power": "power",
  Richmond: "tigers", "Richmond Tigers": "tigers",
  "St Kilda": "saints", "St Kilda Saints": "saints",
  Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
};

function getTeamLogo(team: string) {
  return TEAM_LOGOS[team.toLowerCase()] ?? TEAM_LOGOS[team] ?? "";
}

function playerImage(p: any): string {
  const folder = CLUB_FOLDER[p.club ?? p.team ?? ""] ?? (p.club ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const img = p.image ?? p.imagePath ?? `${(p.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}.png`;
  if (!folder) return "";
  return `/players/${folder}/${img}`;
}

type SquiggleGame = { id: number; round: number; hteam: string; ateam: string; date: string; complete: number };

type QuestionDraft = {
  category_key: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_a_image: string;
  option_b_image: string;
  option_a_team: string;
  option_b_team: string;
};

type DuelGame = {
  id: string;
  game_id: number;
  round: number;
  season: number;
  home_team: string;
  away_team: string;
  game_date: string;
  status: string;
  duel_questions?: any[];
};

function emptyQuestion(): QuestionDraft {
  return { category_key: "", question_text: "", option_a: "", option_b: "", option_a_image: "", option_b_image: "", option_a_team: "", option_b_team: "" };
}

function tiebreakerQuestion(homeTeam: string, awayTeam: string): QuestionDraft {
  return {
    category_key: "team_winner",
    question_text: "Which team wins, and by what margin?",
    option_a: homeTeam,
    option_b: awayTeam,
    option_a_image: getTeamLogo(homeTeam),
    option_b_image: getTeamLogo(awayTeam),
    option_a_team: homeTeam,
    option_b_team: awayTeam,
  };
}

export default function AdminDuelsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [games, setGames] = useState<SquiggleGame[]>([]);
  const [duelGames, setDuelGames] = useState<DuelGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "create">("list");

  const [selectedGame, setSelectedGame] = useState<SquiggleGame | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Player picker state
  const [pickerOpen, setPickerOpen] = useState<number | null>(null); // question index
  const [pickerSlot, setPickerSlot] = useState<"a" | "b">("a");
  const [playerSearch, setPlayerSearch] = useState("");

  function handleLogin() {
    if (password === ADMIN_SECRET) setUnlocked(true);
    else alert("Wrong password");
  }

  async function loadDuelGames() {
    const res = await fetch("/api/duels/admin/games", { headers: { "x-admin-secret": ADMIN_SECRET } });
    const json = await res.json();
    setDuelGames(json.games ?? []);
  }

  async function loadSquiggleGames() {
    setLoading(true);
    const res = await fetch("/api/squiggle/games");
    const json = await res.json();
    const all: SquiggleGame[] = Array.isArray(json) ? json : json.games ?? [];
    setGames(all.filter((g) => (g.complete ?? 0) < 100).slice(0, 30));
    setLoading(false);
  }

  useEffect(() => {
    if (unlocked) { loadDuelGames(); loadSquiggleGames(); }
  }, [unlocked]);

  function pickGame(game: SquiggleGame) {
    setSelectedGame(game);
    setQuestions([
      ...Array.from({ length: 10 }, () => emptyQuestion()),
      tiebreakerQuestion(game.hteam, game.ateam),
    ]);
    setView("create");
  }

  // Players for this match, grouped
  const matchPlayers = useMemo(() => {
    if (!selectedGame) return [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const match = (team: string) => (p: any) => {
      const club = String(p.club || p.team || "");
      const a = norm(club), b = norm(team);
      return a === b || a.includes(b) || b.includes(a);
    };
    const homePlayers = (playersJson as any[]).filter(match(selectedGame.hteam))
      .map(p => ({ name: String(p.name ?? p.player ?? ""), team: selectedGame!.hteam, image: playerImage(p) }));
    const awayPlayers = (playersJson as any[]).filter(match(selectedGame.ateam))
      .map(p => ({ name: String(p.name ?? p.player ?? ""), team: selectedGame!.ateam, image: playerImage(p) }));
    return [...homePlayers, ...awayPlayers];
  }, [selectedGame]);

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return matchPlayers;
    const q = playerSearch.toLowerCase();
    return matchPlayers.filter(p => p.name.toLowerCase().includes(q));
  }, [matchPlayers, playerSearch]);

  function setCategoryForQuestion(idx: number, categoryKey: string) {
    if (!selectedGame) return;
    const cat = DUEL_CATEGORIES[categoryKey];
    if (!cat) return;
    setQuestions(prev => {
      const next = [...prev];
      if (cat.type === "team") {
        next[idx] = {
          category_key: categoryKey,
          question_text: cat.label,
          option_a: selectedGame.hteam,
          option_b: selectedGame.ateam,
          option_a_image: getTeamLogo(selectedGame.hteam),
          option_b_image: getTeamLogo(selectedGame.ateam),
          option_a_team: selectedGame.hteam,
          option_b_team: selectedGame.ateam,
        };
      } else {
        next[idx] = { ...next[idx], category_key: categoryKey, question_text: cat.label };
      }
      return next;
    });
  }

  function pickPlayer(player: { name: string; team: string; image: string }) {
    if (pickerOpen === null) return;
    setQuestions(prev => {
      const next = [...prev];
      if (pickerSlot === "a") {
        next[pickerOpen] = { ...next[pickerOpen], option_a: player.name, option_a_image: player.image, option_a_team: player.team };
      } else {
        next[pickerOpen] = { ...next[pickerOpen], option_b: player.name, option_b_image: player.image, option_b_team: player.team };
      }
      return next;
    });
    setPickerOpen(null);
    setPlayerSearch("");
  }

  async function saveNewDuel() {
    if (!selectedGame) return;
    // Validate
    for (let i = 0; i < 10; i++) {
      const q = questions[i];
      if (!q.category_key) { alert(`Question ${i + 1}: please select a category`); return; }
      const cat = DUEL_CATEGORIES[q.category_key];
      if (cat?.type === "player" && (!q.option_a || !q.option_b)) {
        alert(`Question ${i + 1}: please select both players`); return;
      }
    }

    setSaving(true); setSaveMsg("");
    try {
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

      const qRes = await fetch("/api/duels/admin/questions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({
          duel_game_id: gameJson.game.id,
          questions: questions.map((q, i) => ({
            question_order: i + 1,
            is_tiebreaker:  i === 10,
            question_text:  q.question_text,
            option_a:       q.option_a,
            option_b:       q.option_b,
            category_key:   q.category_key,
            option_a_image: q.option_a_image,
            option_a_team:  q.option_a_team,
            option_b_image: q.option_b_image,
            option_b_team:  q.option_b_team,
          })),
        }),
      });
      if (!qRes.ok) { const j = await qRes.json(); throw new Error(j.error ?? "Failed to save questions"); }

      setSaveMsg("Duel created!");
      await loadDuelGames();
      setTimeout(() => { setView("list"); setSaveMsg(""); setSelectedGame(null); }, 1200);
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
    if (!confirm("Delete this duel game?")) return;
    await fetch(`/api/duels/admin/games?id=${id}`, { method: "DELETE", headers: { "x-admin-secret": ADMIN_SECRET } });
    loadDuelGames();
  }

  if (!unlocked) {
    return (
      <main className="page grid">
        <section className="card" style={{ maxWidth: 420, margin: "80px auto" }}>
          <span className="pill">Admin only</span>
          <h1>Duels Admin</h1>
          <input type="password" placeholder="Admin password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ marginTop: 16 }} />
          <button className="button" onClick={handleLogin} style={{ marginTop: 12, width: "100%" }}>Unlock</button>
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
          <Link href="/admin" style={btnStyle}>← Admin</Link>
          {view === "list"
            ? <button className="button" onClick={() => { setSelectedGame(null); setView("create"); }}>+ New Duel</button>
            : <button style={btnStyle} onClick={() => setView("list")}>← Back</button>}
        </div>
      </section>

      {/* ── List ── */}
      {view === "list" && (
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Active Duel Games</h2>
          {duelGames.length === 0 && <p className="muted">No duels yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {duelGames.map(dg => (
              <div key={dg.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 700 }}>{dg.home_team} vs {dg.away_team}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Round {dg.round} · {new Date(dg.game_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <span style={{ ...pillStyle, background: statusColor(dg.status) }}>{dg.status}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{dg.duel_questions?.length ?? 0} questions</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {dg.status === "open"   && <button style={smBtn} onClick={() => updateStatus(dg.id, "locked")}>Lock</button>}
                  {dg.status === "locked" && <button style={smBtn} onClick={() => updateStatus(dg.id, "complete")}>Mark Complete</button>}
                  <button style={{ ...smBtn, background: "#dc2626" }} onClick={() => deleteGame(dg.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Create ── */}
      {view === "create" && !selectedGame && (
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Pick a Game</h2>
          {loading && <p className="muted">Loading…</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {games.map(g => (
              <button key={g.id} onClick={() => pickGame(g)} style={gameRowBtn}>
                <span style={{ fontWeight: 700 }}>{g.hteam} vs {g.ateam}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  Round {g.round} · {new Date(g.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "create" && selectedGame && (
        <section className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <img src={getTeamLogo(selectedGame.hteam)} alt="" style={teamLogoStyle} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedGame.hteam} vs {selectedGame.ateam}</div>
              <div className="muted" style={{ fontSize: 13 }}>Round {selectedGame.round}</div>
            </div>
            <img src={getTeamLogo(selectedGame.ateam)} alt="" style={teamLogoStyle} />
            <button style={{ ...smBtn, marginLeft: "auto" }} onClick={() => setSelectedGame(null)}>Change</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {questions.slice(0, 10).map((q, i) => (
              <QuestionBuilder
                key={i}
                idx={i}
                q={q}
                homeTeam={selectedGame.hteam}
                awayTeam={selectedGame.ateam}
                onCategoryChange={key => setCategoryForQuestion(i, key)}
                onPickPlayer={(slot) => { setPickerOpen(i); setPickerSlot(slot); setPlayerSearch(""); }}
              />
            ))}

            {/* Tiebreaker */}
            <div style={{ ...qBlock, border: "2px solid #f59e0b" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}>Q11 — TIEBREAKER (auto)</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Which team wins, and by what margin?</div>
              <div style={{ display: "flex", gap: 10 }}>
                <TeamOption logo={getTeamLogo(selectedGame.hteam)} name={selectedGame.hteam} />
                <TeamOption logo={getTeamLogo(selectedGame.ateam)} name={selectedGame.ateam} />
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                Margin ranges: {MARGIN_RANGES.join(", ")} · auto-scored from final score
              </div>
            </div>
          </div>

          {saveMsg && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: saveMsg.includes("!") ? "#16a34a22" : "#dc262622", color: saveMsg.includes("!") ? "#4ade80" : "#f87171", fontSize: 14 }}>
              {saveMsg}
            </div>
          )}
          <button className="button" style={{ marginTop: 20, width: "100%" }} onClick={saveNewDuel} disabled={saving}>
            {saving ? "Saving…" : "Save Duel"}
          </button>
        </section>
      )}

      {/* Player picker modal */}
      {pickerOpen !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setPickerOpen(null)}>
          <div style={{ width: "min(92vw,420px)", maxHeight: "80vh", background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border-2)", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Pick {pickerSlot === "a" ? "Option A" : "Option B"} · Q{(pickerOpen ?? 0) + 1}
              </div>
              <input
                placeholder="Search player…"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                autoFocus
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-2)", color: "var(--text-1)", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredPlayers.map((p, i) => (
                <button key={i} onClick={() => pickPlayer(p)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "none", border: "none", borderBottom: "1px solid var(--border-2)", cursor: "pointer", color: "var(--text-1)", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface-3)" }}>
                    {p.image && <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{p.team}</div>
                  </div>
                </button>
              ))}
              {filteredPlayers.length === 0 && <p style={{ padding: 20, color: "#64748b", textAlign: "center" }}>No players found</p>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function QuestionBuilder({
  idx, q, homeTeam, awayTeam, onCategoryChange, onPickPlayer,
}: {
  idx: number;
  q: QuestionDraft;
  homeTeam: string;
  awayTeam: string;
  onCategoryChange: (key: string) => void;
  onPickPlayer: (slot: "a" | "b") => void;
}) {
  const cat = q.category_key ? DUEL_CATEGORIES[q.category_key] : null;
  const isTeam   = cat?.type === "team";
  const isPlayer = cat?.type === "player";

  return (
    <div style={qBlock}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>Q{idx + 1}</div>

      {/* Category picker */}
      <select
        value={q.category_key}
        onChange={e => onCategoryChange(e.target.value)}
        style={{ ...selectStyle, marginBottom: 12 }}
      >
        <option value="">Select a category…</option>
        <optgroup label="Team">
          {Object.entries(DUEL_CATEGORIES).filter(([, v]) => v.type === "team").map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </optgroup>
        <optgroup label="Player (pick 2)">
          {Object.entries(DUEL_CATEGORIES).filter(([, v]) => v.type === "player").map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </optgroup>
      </select>

      {/* Options preview */}
      {isTeam && (
        <div style={{ display: "flex", gap: 8 }}>
          <TeamOption logo={getTeamLogo(homeTeam)} name={homeTeam} />
          <TeamOption logo={getTeamLogo(awayTeam)} name={awayTeam} />
        </div>
      )}

      {isPlayer && (
        <div style={{ display: "flex", gap: 8 }}>
          <PlayerOptionBtn
            name={q.option_a}
            image={q.option_a_image}
            team={q.option_a_team}
            label="Option A"
            onClick={() => onPickPlayer("a")}
          />
          <PlayerOptionBtn
            name={q.option_b}
            image={q.option_b_image}
            team={q.option_b_team}
            label="Option B"
            onClick={() => onPickPlayer("b")}
          />
        </div>
      )}

      {!q.category_key && (
        <div style={{ fontSize: 13, color: "#475569", fontStyle: "italic" }}>Select a category above</div>
      )}
    </div>
  );
}

function TeamOption({ logo, name }: { logo: string; name: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "var(--surface-1)", border: "1px solid var(--border-2)" }}>
      {logo && <img src={logo} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />}
      <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
    </div>
  );
}

function PlayerOptionBtn({ name, image, team, label, onClick }: {
  name: string; image: string; team: string; label: string; onClick: () => void;
}) {
  const picked = !!name;
  return (
    <button onClick={onClick} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left", background: picked ? "rgba(59,130,246,0.1)" : "var(--surface-1)", border: picked ? "1px solid rgba(59,130,246,0.4)" : "1px dashed var(--border-2)", color: "var(--text-1)" }}>
      {picked ? (
        <>
          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--surface-3)" }}>
            {image && <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{team}</div>
          </div>
        </>
      ) : (
        <span style={{ fontSize: 13, color: "#475569" }}>+ {label}</span>
      )}
    </button>
  );
}

function statusColor(s: string) {
  if (s === "open")     return "#16a34a22";
  if (s === "locked")   return "#f59e0b22";
  if (s === "complete") return "#64748b22";
  return "var(--surface-3)";
}

const btnStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border-2)", cursor: "pointer", fontWeight: 600, fontSize: 14, color: "var(--text-1)", background: "var(--surface-3)", textDecoration: "none", display: "inline-block" };
const smBtn:   React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--surface-3)", color: "var(--text-1)", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const pillStyle: React.CSSProperties = { padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: "capitalize", border: "1px solid rgba(255,255,255,0.08)" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, padding: 16, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-2)" };
const gameRowBtn: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)", cursor: "pointer", textAlign: "left", color: "var(--text-1)", width: "100%" };
const qBlock: React.CSSProperties = { padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-2)" };
const selectStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--surface-1)", border: "1px solid var(--border-2)", color: "var(--text-1)", fontSize: 14, boxSizing: "border-box" };
const teamLogoStyle: React.CSSProperties = { width: 40, height: 40, borderRadius: "50%", objectFit: "cover" };
