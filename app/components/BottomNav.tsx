"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ── Icons ── */

function HomeIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3l9 9v9h-6v-5a3 3 0 0 0-6 0v5H3v-9z" fill="currentColor" />
      <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,12 12,3 21,12" />
      <path d="M5 10v11h5v-5a2 2 0 0 1 4 0v5h5V10" />
    </svg>
  );
}

function LadderIcon({ active }: { active: boolean }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="6"  y1="2"  x2="6"  y2="22" />
      <line x1="18" y1="2"  x2="18" y2="22" />
      <line x1="6"  y1="7"  x2="18" y2="7"  />
      <line x1="6"  y1="12" x2="18" y2="12" />
      <line x1="6"  y1="17" x2="18" y2="17" />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  const sw = active ? 2.2 : 1.8;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {/* back card rotated clockwise */}
      <rect x="9" y="2" width="13" height="17" rx="2.5" transform="rotate(15 15.5 10.5)" strokeOpacity="0.55" />
      {/* front card upright */}
      <rect x="2" y="5" width="13" height="17" rx="2.5" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
    </svg>
  );
}

function DMIcon({ active }: { active: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

/* ── Tab config ── */

const TABS = [
  { href: "/",        label: "Home",    Icon: HomeIcon    },
  { href: "/cards",   label: "Cards",   Icon: CardsIcon   },
  { href: "/search",  label: "Search",  Icon: SearchIcon  },
  { href: "/dms",     label: "DMs",     Icon: DMIcon      },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  // Hide the bottom nav on the match detail page
  if (pathname.startsWith("/match/")) return null;

  return (
    <nav className="bottom-nav" role="tablist">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={`tab-item${active ? " tab-active" : ""}`}
            role="tab"
            aria-selected={active}
            aria-label={label}
          >
            <span className="tab-icon-wrap">
              <Icon active={active} />
            </span>
            <span className="tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
