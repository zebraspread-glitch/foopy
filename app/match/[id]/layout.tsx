"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import RoundGameStrip from "./components/RoundGameStrip";
import type { MatchGame } from "./types";

// Module-level cache so this persistent layout has games to show instantly
// even if it briefly remounts (e.g. fast refresh / first paint).
let cachedGames: MatchGame[] = [];

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = String(params?.id ?? "");
  // Only show the round strip on the match page itself, not nested
  // routes like the event-comments page (/match/[id]/[event]).
  const showStrip = pathname === `/match/${id}`;

  const [games, setGames] = useState<MatchGame[]>(() => cachedGames);
  const [now, setNow] = useState(Date.now());
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/games?fresh=1&t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const list: MatchGame[] = Array.isArray(data) ? data : (data?.games ?? []);
        if (!cancelled) {
          cachedGames = list;
          setGames(list);
        }
      } catch {
        // keep showing whatever we already have
      }
    }

    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Keep the page's sticky header positioned just below this strip,
  // regardless of its actual rendered height (safe-area inset, etc).
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty("--round-strip-h", `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [games.length, id]);

  const current = games.find((g) => String(g.id) === id);
  const roundGames = current
    ? games
        .filter((g) => String(g.round) === String(current.round))
        .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime())
    : [];

  if (!showStrip) return <>{children}</>;

  return (
    <>
      <div ref={stripRef} style={{ position: "sticky", top: 0, zIndex: 80 }}>
        <RoundGameStrip games={roundGames} activeId={id} now={now} />
      </div>
      {children}
    </>
  );
}
