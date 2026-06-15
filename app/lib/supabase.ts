import { createClient } from "@supabase/supabase-js";

// Supabase serialises token refresh across tabs with a Web Lock. On some
// browsers / PWAs / multi-tab setups that lock can be held by a context that
// went away and is never released — which makes `auth.getSession()` (and
// therefore most pages, which await it before rendering) hang forever, so the
// app appears frozen and needs a full reload.
//
// This lock behaves like the default in the normal case, but NEVER waits more
// than a few seconds: if it can't acquire the lock (a stuck/deadlocked lock),
// it just proceeds without it rather than hanging the whole app.
const LOCK_TIMEOUT_MS = 5000;

const resilientLock = async <R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    return fn();
  }
  // AbortSignal.timeout isn't in very old browsers — fall back to no signal.
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(LOCK_TIMEOUT_MS)
      : undefined;
  try {
    return await navigator.locks.request(
      name,
      signal ? { signal } : {},
      async () => fn(),
    );
  } catch {
    // Couldn't get the lock in time (likely a stuck lock) — run anyway so auth
    // can never deadlock the UI.
    return fn();
  }
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: resilientLock,
    },
  },
);
