// ============================================================
// Navigation hierarchy
// ------------------------------------------------------------
// Foopy has two kinds of screens:
//   • ROOT screens  — the 5 bottom-tab sections. Persistent "home bases".
//                     Show the top-left profile button that opens the drawer.
//   • PUSHED screens — everything opened from the sidebar, links, etc.
//                     Show an iOS-style back arrow instead.
//
// Components read this to decide whether to render the drawer/profile button
// (GlobalSideDrawer) or an automatic back arrow (PageHeader).
// ============================================================

/** The five bottom-tab destinations — see app/components/BottomNav.tsx. */
export const ROOT_ROUTES = ["/", "/cards", "/search", "/dms", "/profile"] as const;

export function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

/** True for the 5 bottom-tab root sections. */
export function isRootRoute(pathname: string | null | undefined): boolean {
  return (ROOT_ROUTES as readonly string[]).includes(normalizePath(pathname));
}

/**
 * Routes that render the fixed top-left profile button (opens the drawer).
 * This is the root sections minus /profile, which has its own bespoke hero
 * header with its own controls.
 */
export function showsDrawerButton(pathname: string | null | undefined): boolean {
  const p = normalizePath(pathname);
  return isRootRoute(p) && p !== "/profile";
}
