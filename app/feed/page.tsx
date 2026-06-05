"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Zap, Calendar } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import { getGames } from "@/app/lib/gameCache";
import { venueDisplayName } from "@/app/data/venues";
import CommentSheet from "./CommentSheet";

type Game = {
  id: number;
  round: number;
  hteam?: string;
  ateam?: string;
  hteamid?: number;
  ateamid?: number;
  hscore?: number | null;
  ascore?: number | null;
  hgoals?: number | null;
  hbehinds?: number | null;
  agoals?: number | null;
  abehinds?: number | null;
  complete?: number;
  is_final?: number;
  date?: string;
  venue?: string;
  timestr?: string;
};

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

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function margin(g: Game) {
  const diff = Math.abs((g.hscore ?? 0) - (g.ascore ?? 0));
  if (diff === 0) return "Draw";
  return `${diff} pts`;
}

export default function FeedPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeComment, setActiveComment] = useState<{ gameId: number; label: string } | null>(null);

  useEffect(() => {
    getGames()
      .then((data) => {
        const all: Game[] = Array.isArray(data) ? data as Game[] : [];
        setGames(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentRound = useMemo(() => {
    const live = games.find(isLive);
    const next = games.find((g) => (g.complete ?? 0) < 100);
    const latest = [...games].reverse().find(isCompleted);
    return live?.round ?? next?.round ?? latest?.round ?? 1;
  }, [games]);

  const roundGames = useMemo(
    () => games.filter((g) => g.round === currentRound),
    [games, currentRound]
  );

  const liveGames = useMemo(() => roundGames.filter(isLive), [roundGames]);

  const completedGames = useMemo(
    () =>
      roundGames
        .filter(isCompleted)
        .sort(
          (a, b) =>
            new Date(b.date ?? "").getTime() - new Date(a.date ?? "").getTime()
        ),
    [roundGames]
  );

  const upcomingGames = useMemo(
    () => roundGames.filter((g) => !isCompleted(g) && !isLive(g)),
    [roundGames]
  );

  const roundBadge = (
    <span style={roundBadgeStyle}>Round {currentRound}</span>
  );

  return (
    <main style={pageStyle} className="page-enter">
      <PageHeader title="Feed" right={loading ? undefined : roundBadge} />
      {activeComment && (
        <CommentSheet
          gameId={activeComment.gameId}
          gameLabel={activeComment.label}
          onClose={() => setActiveComment(null)}
        />
      )}

      {loading ? (
        <div style={skeletonFeedStyle}>
          {[1,2,3].map(i => (
            <div key={i} style={skeletonSectionStyle}>
              <div className="skeleton-line" style={{ width: 80, height: 11, marginLeft: 16, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 130, borderRadius: 18, margin: "8px 16px 0" }} />
              <div className="skeleton" style={{ height: 130, borderRadius: 18, margin: "10px 16px 0" }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={feedStyle}>
          {/* ── LIVE ── */}
          {liveGames.length > 0 && (
            <FeedSection
              icon={<Zap size={13} color="#22c55e" fill="#22c55e" />}
              label="Live Now"
              labelColor="#22c55e"
            >
              {liveGames.map((g) => (
                <GameCard key={g.id} game={g} variant="live" onOpenComments={setActiveComment} />
              ))}
            </FeedSection>
          )}

          {/* ── RESULTS ── */}
          {completedGames.length > 0 && (
            <FeedSection
              icon={<TrendingUp size={13} color="#3b82f6" />}
              label="Results"
              labelColor="#60a5fa"
            >
              {completedGames.map((g) => (
                <GameCard key={g.id} game={g} variant="completed" onOpenComments={setActiveComment} />
              ))}
            </FeedSection>
          )}

          {/* ── UPCOMING ── */}
          {upcomingGames.length > 0 && (
            <FeedSection
              icon={<Calendar size={13} color="#94a3b8" />}
              label="Coming Up"
              labelColor="#94a3b8"
            >
              {upcomingGames.map((g) => (
                <GameCard key={g.id} game={g} variant="upcoming" onOpenComments={setActiveComment} />
              ))}
            </FeedSection>
          )}

          {roundGames.length === 0 && (
            <div style={emptyStyle}>No games found for Round {currentRound}.</div>
          )}
        </div>
      )}
    </main>
  );
}

/* ──────────────────────────────────────────────── */
/* Section wrapper                                   */
/* ──────────────────────────────────────────────── */

function FeedSection({
  icon,
  label,
  labelColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <div style={sectionHeadStyle}>
        {icon}
        <span style={{ ...sectionLabelStyle, color: labelColor }}>{label}</span>
      </div>
      {children}
    </section>
  );
}

/* ──────────────────────────────────────────────── */
/* Game card                                         */
/* ──────────────────────────────────────────────── */

function GameCard({
  game,
  variant,
  onOpenComments,
}: {
  game: Game;
  variant: "live" | "completed" | "upcoming";
  onOpenComments: (c: { gameId: number; label: string }) => void;
}) {
  const hid = game.hteamid;
  const aid = game.ateamid;
  if (!hid || !aid) return null;

  const hs = game.hscore ?? 0;
  const as = game.ascore ?? 0;
  const homeWon = variant === "completed" && hs > as;
  const awayWon = variant === "completed" && as > hs;
  const hName = game.hteam ?? TEAM_NAMES[hid];
  const aName = game.ateam ?? TEAM_NAMES[aid];
  const label = `${hName} vs ${aName}`;

  return (
    <div
      className="pressable"
      style={{ ...cardStyle, cursor: "pointer" }}
      onClick={() => onOpenComments({ gameId: game.id, label })}
    >
      {variant === "live" && <div style={liveAccentStyle} />}

      <div style={cardBodyStyle}>
        {/* Teams row */}
        <div style={teamsGridStyle}>
          {/* Home */}
          <TeamCell
            id={hid}
            name={game.hteam ?? TEAM_NAMES[hid]}
            faded={variant === "completed" && !homeWon}
            align="left"
          />

          {/* Middle: score or VS */}
          <div style={middleStyle}>
            {variant === "upcoming" ? (
              <span style={vsStyle}>VS</span>
            ) : (
              <div style={scoresRowStyle}>
                <span
                  style={{
                    ...scoreNumStyle,
                    color: homeWon ? "#3b82f6" : "white",
                    opacity: variant === "completed" && !homeWon ? 0.38 : 1,
                  }}
                >
                  {hs}
                </span>
                <span style={scoreDashStyle}>–</span>
                <span
                  style={{
                    ...scoreNumStyle,
                    color: awayWon ? "#3b82f6" : "white",
                    opacity: variant === "completed" && !awayWon ? 0.38 : 1,
                  }}
                >
                  {as}
                </span>
              </div>
            )}

            {variant === "live" && <div style={livePillStyle}>LIVE</div>}
            {variant === "completed" && (
              <div style={ftPillStyle}>{margin(game)}</div>
            )}
            {variant === "upcoming" && game.timestr && (
              <span style={timeLabelStyle}>{game.timestr}</span>
            )}
          </div>

          {/* Away */}
          <TeamCell
            id={aid}
            name={game.ateam ?? TEAM_NAMES[aid]}
            faded={variant === "completed" && !awayWon}
            align="right"
          />
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={footerTextStyle}>{game.venue ? venueDisplayName(game.venue) : "Venue TBA"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {game.date && <span style={footerTextStyle}>{formatDate(game.date)}</span>}
            <span style={commentHintStyle}>
              <CommentBubbleIcon />
              Comment
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentBubbleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TeamCell({
  id,
  name,
  faded,
  align,
}: {
  id: number;
  name: string;
  faded: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        ...teamCellStyle,
        alignItems: align === "left" ? "flex-start" : "flex-end",
        opacity: faded ? 0.4 : 1,
      }}
    >
      <img
        src={TEAM_LOGOS[id]}
        alt={name}
        style={{
          ...logoStyle,
          alignSelf: align === "left" ? "flex-start" : "flex-end",
        }}
      />
      <span style={teamNameStyle}>{name}</span>
    </div>
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

const roundBadgeStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(59,130,246,.14)",
  color: "#60a5fa",
  padding: "6px 13px",
  borderRadius: 999,
  border: "1px solid rgba(59,130,246,.22)",
};

const skeletonFeedStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
  padding: "20px 0",
};

const skeletonSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const feedStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
  padding: "20px 0 12px",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const sectionHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "0 16px",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const cardStyle: React.CSSProperties = {
  margin: "0 16px",
  borderRadius: 18,
  background: "var(--surface-1)",
  border: "1px solid var(--border-2)",
  overflow: "hidden",
  color: "var(--text-1)",
  position: "relative",
};

const liveAccentStyle: React.CSSProperties = {
  height: 3,
  background: "linear-gradient(90deg, #22c55e, #16a34a)",
};

const cardBodyStyle: React.CSSProperties = {
  padding: "16px 14px 12px",
};

const teamsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};

const teamCellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const logoStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  objectFit: "contain",
  filter: "drop-shadow(0 2px 10px rgba(0,0,0,.5))",
};

const teamNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1.2,
};

const middleStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  minWidth: 84,
};

const vsStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 950,
  color: "var(--text-4)",
  letterSpacing: "-0.04em",
};

const scoresRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const scoreNumStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 950,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.03em",
};

const scoreDashStyle: React.CSSProperties = {
  fontSize: 20,
  color: "var(--text-4)",
  fontWeight: 900,
};

const livePillStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  background: "#22c55e",
  color: "var(--text-1)",
  padding: "3px 8px",
  borderRadius: 999,
  letterSpacing: "0.06em",
};

const ftPillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--text-3)",
  background: "var(--surface-3)",
  padding: "3px 9px",
  borderRadius: 999,
};

const timeLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#60a5fa",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderTop: "1px solid var(--border-1)",
  paddingTop: 10,
};

const footerTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-3)",
  fontWeight: 700,
};

const commentHintStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-3)",
};

const emptyStyle: React.CSSProperties = {
  padding: "60px 20px",
  textAlign: "center",
  color: "var(--text-3)",
};
