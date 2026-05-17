"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import birthdaysData from "@/app/data/playerBirthdays.json";
import playersData from "@/app/data/players.json";

type BirthdayEntry = { name: string; month: number; day: number };
type PlayerData = { id: string; name: string; team: string };

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TEAM_LOGOS: Record<string, string> = {
  Adelaide: "/team-logos/crows.png",
  "Brisbane Lions": "/team-logos/lions.png",
  Brisbane: "/team-logos/lions.png",
  Carlton: "/team-logos/blues.png",
  Collingwood: "/team-logos/magpies.png",
  Essendon: "/team-logos/bombers.png",
  Fremantle: "/team-logos/dockers.png",
  "Geelong Cats": "/team-logos/cats.png",
  Geelong: "/team-logos/cats.png",
  "Gold Coast": "/team-logos/suns.png",
  "GWS Giants": "/team-logos/giants.png",
  GWS: "/team-logos/giants.png",
  Hawthorn: "/team-logos/hawks.png",
  Melbourne: "/team-logos/demons.png",
  "North Melbourne": "/team-logos/kangaroos.png",
  "Port Adelaide": "/team-logos/power.png",
  Richmond: "/team-logos/tigers.png",
  "St Kilda": "/team-logos/saints.png",
  Sydney: "/team-logos/swans.png",
  "West Coast": "/team-logos/eagles.png",
  "Western Bulldogs": "/team-logos/bulldogs.png",
};

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c",
  "Brisbane Lions": "#7a003c",
  Brisbane: "#7a003c",
  Carlton: "#031a35",
  Collingwood: "#272731",
  Essendon: "#cc0000",
  Fremantle: "#4b1979",
  "Geelong Cats": "#003b73",
  Geelong: "#003b73",
  "Gold Coast": "#c0392b",
  "GWS Giants": "#e05a1a",
  GWS: "#e05a1a",
  Hawthorn: "#6b3a1f",
  Melbourne: "#c8102e",
  "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999",
  Richmond: "#272731",
  "St Kilda": "#c8102e",
  Sydney: "#c0392b",
  "West Coast": "#003087",
  "Western Bulldogs": "#1a4abf",
};

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns",
  gwsgiants: "giants", gws: "giants",
  hawthorn: "hawks", melbourne: "demons", northmelbourne: "kangaroos",
  portadelaide: "power", richmond: "tigers", stkilda: "saints",
  sydney: "swans", westcoast: "eagles", westernbulldogs: "bulldogs",
};

function playerImagePath(name: string, team: string) {
  const folderKey = slug(team);
  const folder = CLUB_FOLDER[folderKey] ?? folderKey;
  return `/players/${folder}/${slug(name)}.png`;
}

const playerLookup = new Map<string, PlayerData>();
for (const p of playersData as PlayerData[]) {
  playerLookup.set(slug(p.name), p);
}

function getPlayer(name: string): PlayerData | undefined {
  return playerLookup.get(slug(name));
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function PlayerCard({ entry, isToday }: { entry: BirthdayEntry; isToday?: boolean }) {
  const player = getPlayer(entry.name);
  const team = player?.team;
  const color = team ? (TEAM_COLORS[team] ?? "#1e293b") : "#1e293b";
  const teamLogo = team ? TEAM_LOGOS[team] : null;
  const imgSrc = team ? playerImagePath(entry.name, team) : null;
  const [imgErr, setImgErr] = useState(false);
  const playerSlug = player?.id ?? entry.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  return (
    <Link
      href={`/player/${playerSlug}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 16,
        background: isToday ? `linear-gradient(135deg, ${color}44, var(--border-1))` : "var(--border-1)",
        border: isToday ? `1px solid ${color}88` : "1px solid var(--border-2)",
        position: "relative",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {isToday && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(ellipse at 0% 50%, ${color}22 0%, transparent 60%)`,
          pointerEvents: "none",
        }} />
      )}

      {/* Player avatar */}
      {imgSrc && !imgErr ? (
        <img
          src={imgSrc}
          alt={entry.name}
          onError={() => setImgErr(true)}
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", flexShrink: 0, background: `${color}44`, border: "1px solid var(--border-2)" }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0, background: `${color}44`, border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 20 }}>🏉</span>
        </div>
      )}

      {/* Name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.name}
        </div>
        {team && (
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>
            {team}
          </div>
        )}
      </div>

      {teamLogo && (
        <div style={teamLogoWrapStyle}>
          <img src={teamLogo} alt={team ?? ""} style={teamLogoStyle} loading="lazy" />
        </div>
      )}

      {/* Birthday emoji or date */}
      {isToday ? (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="12" width="18" height="9" rx="2" />
          <rect x="6" y="8" width="12" height="4" rx="1.5" />
          <line x1="8" y1="8" x2="8" y2="5" />
          <line x1="12" y1="8" x2="12" y2="5" />
          <line x1="16" y1="8" x2="16" y2="5" />
          <circle cx="8"  cy="4.5" r="0.9" fill="rgba(255,255,255,.7)" stroke="none" />
          <circle cx="12" cy="4.5" r="0.9" fill="rgba(255,255,255,.7)" stroke="none" />
          <circle cx="16" cy="4.5" r="0.9" fill="rgba(255,255,255,.7)" stroke="none" />
        </svg>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.3)", flexShrink: 0, textAlign: "right" }}>
          {ordinal(entry.day)}<br />{MONTH_NAMES[entry.month]}
        </div>
      )}
    </Link>
  );
}

export default function BirthdaysPage() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  const todayMonth = now ? now.getMonth() + 1 : 0;
  const todayDay = now ? now.getDate() : 0;

  const { todayPlayers, upcomingGroups } = useMemo(() => {
    if (!now) return { todayPlayers: [], upcomingGroups: [] };
    const entries = birthdaysData as BirthdayEntry[];

    const todayPlayers = entries.filter(
      (e) => e.month === todayMonth && e.day === todayDay
    );

    const upcoming: { daysAway: number; date: Date; players: BirthdayEntry[] }[] = [];
    for (let d = 1; d <= 14; d++) {
      const target = new Date(now);
      target.setDate(now.getDate() + d);
      const m = target.getMonth() + 1;
      const day = target.getDate();
      const players = entries.filter((e) => e.month === m && e.day === day);
      if (players.length > 0) {
        upcoming.push({ daysAway: d, date: target, players });
      }
    }

    return { todayPlayers, upcomingGroups: upcoming };
  }, [now, todayMonth, todayDay]);

  const todayLabel = now
    ? now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <main style={pageStyle} className="page-enter">
      <PageHeader title="Birthdays" subtitle={todayLabel} />

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Today */}
        <section>
          <div style={sectionHeaderStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="18" height="9" rx="2" />
              <rect x="6" y="8" width="12" height="4" rx="1.5" />
              <line x1="8" y1="8" x2="8" y2="5" />
              <line x1="12" y1="8" x2="12" y2="5" />
              <line x1="16" y1="8" x2="16" y2="5" />
              <circle cx="8"  cy="4.5" r="0.9" fill="currentColor" stroke="none" />
              <circle cx="12" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
              <circle cx="16" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
            </svg>
            <span>Today</span>
            {todayPlayers.length > 0 && (
              <span style={countBadgeStyle}>{todayPlayers.length}</span>
            )}
          </div>

          {todayPlayers.length === 0 ? (
            <div style={emptyStyle}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
                <rect x="3" y="12" width="18" height="9" rx="2" />
                <rect x="6" y="8" width="12" height="4" rx="1.5" />
                <line x1="8" y1="8" x2="8" y2="5" />
                <line x1="12" y1="8" x2="12" y2="5" />
                <line x1="16" y1="8" x2="16" y2="5" />
                <circle cx="8"  cy="4.5" r="0.9" fill="#334155" stroke="none" />
                <circle cx="12" cy="4.5" r="0.9" fill="#334155" stroke="none" />
                <circle cx="16" cy="4.5" r="0.9" fill="#334155" stroke="none" />
              </svg>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-3)" }}>No AFL birthdays today</div>
              <div style={{ fontSize: 13, color: "var(--text-4)", marginTop: 4 }}>Check the upcoming section below</div>
            </div>
          ) : (
            <div style={cardListStyle}>
              {todayPlayers.map((p) => (
                <PlayerCard key={p.name} entry={p} isToday />
              ))}
            </div>
          )}
        </section>

        {/* Coming up */}
        {upcomingGroups.length > 0 && (
          <section style={{ paddingBottom: 8 }}>
            <div style={sectionHeaderStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
              <span>Coming Up</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {upcomingGroups.map(({ daysAway, date, players }) => {
                const dayLabel = daysAway === 1
                  ? "Tomorrow"
                  : date.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
                return (
                  <div key={`${date.getMonth()}-${date.getDate()}`}>
                    <div style={dayLabelStyle}>
                      <span>{dayLabel}</span>
                      {daysAway === 1 && <span style={countBadgeStyle}>{players.length}</span>}
                    </div>
                    <div style={cardListStyle}>
                      {players.map((p) => (
                        <PlayerCard key={p.name} entry={p} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg)",
  color: "var(--text-1)",
  paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 16,
  fontWeight: 900,
  color: "var(--text-1)",
  marginBottom: 12,
  letterSpacing: "-0.02em",
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  background: "var(--border-2)",
  border: "1px solid var(--border-3)",
  borderRadius: 999,
  padding: "2px 8px",
  color: "var(--text-2)",
};

const cardListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const dayLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 800,
  color: "var(--text-3)",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const emptyStyle: React.CSSProperties = {
  padding: "32px 20px",
  textAlign: "center",
  background: "var(--surface-2)",
  border: "1px solid var(--border-1)",
  borderRadius: 18,
};

const teamLogoWrapStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "rgba(0,0,0,.24)",
  border: "1px solid var(--border-2)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const teamLogoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  objectFit: "cover",
};
