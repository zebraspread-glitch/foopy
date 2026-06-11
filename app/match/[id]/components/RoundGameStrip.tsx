import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getStatus, getAbbr, getLogo, scoreText } from "../utils";
import type { MatchGame } from "../types";

export function timeUntilStart(date?: string, now = Date.now()) {
  if (!date) return "Time TBA";
  const start = new Date(date).getTime();
  if (Number.isNaN(start)) return "Time TBA";
  const diff = start - now;
  if (diff <= 0) return "Starting soon";

  const totalMinutes = Math.ceil(diff / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `${days}d ${hours}h`;
  if (totalHours <= 0) return `${minutes}m`;
  return `${totalHours}h ${minutes}m`;
}

function roundStripStatus(game: MatchGame, now = Date.now()) {
  const status = getStatus(game);
  if (status === "FINAL") return "Final";
  if (status === "LIVE") return "Live";
  return timeUntilStart(game.date, now);
}

function miniScoreText(game: MatchGame) {
  if (getStatus(game) === "UPCOMING") return "vs";
  return `${scoreText(game.hscore)}-${scoreText(game.ascore)}`;
}

export default function RoundGameStrip({ games, activeId, now, opacity = 1 }: { games: MatchGame[]; activeId: string; now: number; opacity?: number }) {
  return (
    <div style={{ ...roundStripShellStyle, opacity, pointerEvents: opacity < 0.1 ? "none" : undefined }}>
      {/* Back to home — always visible, non-scrolling */}
      <Link
        href="/"
        aria-label="Back to Scores"
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          color: "var(--text-1)",
          textDecoration: "none",
        }}
      >
        <ChevronLeft size={28} strokeWidth={2.4} />
      </Link>

      {/* Scrollable game pills */}
      {games.length > 1 && (
        <div className="no-scrollbar" style={roundStripScrollStyle}>
          {games.map((game) => {
            const active = String(game.id) === activeId;
            const status = getStatus(game);
            const live = status === "LIVE";

            return (
              <Link
                key={String(game.id)}
                href={`/match/${game.id}`}
                style={{
                  ...roundMiniBoxStyle,
                  borderColor: active ? "#3b82f6" : live ? "rgba(34,197,94,.55)" : "var(--border-2)",
                  background: active ? "var(--surface-3)" : "var(--surface-1)",
                }}
              >
                <div style={{ ...roundMiniStatusStyle, color: live ? "#22c55e" : "#d1d5db" }}>{roundStripStatus(game, now)}</div>
                <div style={roundMiniScoreStyle}>
                  <img src={getLogo(game.hteam)} alt="" style={roundMiniLogoStyle} />
                  <span>{miniScoreText(game)}</span>
                  <img src={getLogo(game.ateam)} alt="" style={roundMiniLogoStyle} />
                </div>
                <div style={roundMiniTeamsStyle}>
                  {getAbbr(game.hteam)} v {getAbbr(game.ateam)}
                </div>
                {active && <div style={roundMiniActiveLineStyle} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const roundStripShellStyle: CSSProperties = {
  position: "relative",
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: 4,
  background: "var(--bg)",
  borderBottom: "1px solid var(--border-2)",
};

const roundStripScrollStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "10px 12px 10px 4px",
  scrollSnapType: "x mandatory",
};

const roundMiniBoxStyle: CSSProperties = {
  position: "relative",
  flex: "0 0 118px",
  minHeight: 62,
  padding: "7px 8px 8px",
  borderRadius: 8,
  border: "1px solid var(--border-2)",
  color: "var(--text-1)",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  scrollSnapAlign: "start",
};

const roundMiniStatusStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
};

const roundMiniScoreStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  fontSize: 13,
  fontWeight: 950,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const roundMiniLogoStyle: CSSProperties = {
  width: 15,
  height: 15,
  borderRadius: "50%",
  objectFit: "cover",
};

const roundMiniTeamsStyle: CSSProperties = {
  maxWidth: "100%",
  color: "var(--text-3)",
  fontSize: 9,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const roundMiniActiveLineStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 0,
  height: 2,
  borderRadius: 999,
  background: "#3b82f6",
};
