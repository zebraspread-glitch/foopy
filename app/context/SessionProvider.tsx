"use client";

// ============================================================
// SessionProvider — single source of truth for auth + profile.
// ------------------------------------------------------------
// Fetches the Supabase session and the signed-in user's profile
// (coins, aura, avatar, etc.) ONCE near the app root, then shares
// it via context so headers, the drawer, cards/store, and every
// coin/aura display read from one place instead of each querying
// Supabase independently.
//
//   const { user, profile, loading, refreshProfile } = useSession();
//
// • `loading` is true only until the first session check resolves —
//   gate "Sign in" UI on it so it never flashes for signed-in users.
// • `refreshProfile()` re-pulls coins/aura after packs, passes,
//   rewards or purchases.
// • `mutateProfile(patch)` updates the cached profile locally for
//   instant optimistic UI (e.g. deducting coins before the API call).
// ============================================================

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";

export type SessionProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  aura: number;
  coins: number;
  tokens: number;
  name_color: string | null;
  avatar_frame: string | null;
  verified: boolean;
  favourite_team: string | null;
};

const PROFILE_COLUMNS =
  "id, username, display_name, avatar_url, banner_url, aura, coins, tokens, name_color, avatar_frame, verified, favourite_team";

function normalize(row: Record<string, unknown>): SessionProfile {
  return {
    id: String(row.id),
    username: (row.username as string) ?? null,
    display_name: (row.display_name as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? null,
    banner_url: (row.banner_url as string) ?? null,
    aura: (row.aura as number) ?? 0,
    coins: (row.coins as number) ?? 0,
    tokens: (row.tokens as number) ?? 0,
    name_color: (row.name_color as string) ?? null,
    avatar_frame: (row.avatar_frame as string) ?? null,
    verified: Boolean(row.verified),
    favourite_team: (row.favourite_team as string) ?? null,
  };
}

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  profile: SessionProfile | null;
  /** True until the first session check resolves. Gate "Sign in" UI on this. */
  loading: boolean;
  /** True while the profile row is being (re)fetched. */
  profileLoading: boolean;
  signedIn: boolean;
  /** Re-fetch coins/aura/etc. — call after packs, passes, rewards, purchases. */
  refreshProfile: () => Promise<void>;
  /** Optimistically patch the cached profile (e.g. deduct coins instantly). */
  mutateProfile: (patch: Partial<SessionProfile>) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Tracks the user id whose profile is already loaded/loading, so the initial
  // getSession() and the onAuthStateChange INITIAL_SESSION event don't both
  // trigger a duplicate profile query.
  const handledUserId = useRef<string | null | undefined>(undefined);

  const fetchProfile = useCallback(async (uid: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", uid)
      .single();
    setProfileLoading(false);
    if (!error && data) setProfile(normalize(data as Record<string, unknown>));
  }, []);

  const apply = useCallback((next: Session | null) => {
    setSession(next);
    setLoading(false);
    const uid = next?.user?.id ?? null;
    if (uid !== handledUserId.current) {
      handledUserId.current = uid;
      if (uid) fetchProfile(uid);
      else setProfile(null);
    }
  }, [fetchProfile]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) apply(session);
    }).catch(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) apply(session);
    });
    // Failsafe: never let a stalled auth check freeze the app on a loading
    // screen. If nothing has resolved in 8s, stop blocking — onAuthStateChange
    // will still fill in the session if/when it arrives.
    const failsafe = setTimeout(() => { if (active) setLoading(false); }, 8000);
    return () => { active = false; subscription.unsubscribe(); clearTimeout(failsafe); };
  }, [apply]);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (uid) await fetchProfile(uid);
  }, [session, fetchProfile]);

  const mutateProfile = useCallback((patch: Partial<SessionProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value: SessionContextValue = {
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    profile,
    loading,
    profileLoading,
    signedIn: !!session?.user,
    refreshProfile,
    mutateProfile,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
