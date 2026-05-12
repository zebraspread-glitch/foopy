"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/app/lib/supabase";
import { createNotification } from "@/app/lib/notifications";
import {
  canAwardXP,
  levelFromXP,
  recordAction,
  type XPAction,
  type XPLog,
  type XPResult,
  XP_VALUES,
} from "@/app/lib/xp";

// ─── Types ───────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; xp: number };

type LevelUpInfo = { newLevel: number; prevLevel: number };

type XPContextValue = {
  xp: number;
  level: number;
  log: XPLog;
  toasts: Toast[];
  levelUp: LevelUpInfo | null;
  dismissLevelUp: () => void;
  awardXP: (
    action: XPAction,
    meta?: { roundId?: number; gameId?: number; matchId?: string; slot?: number; pollId?: string; xpOverride?: number }
  ) => void;
};

const XPContext = createContext<XPContextValue>({
  xp: 0,
  level: 1,
  log: {},
  toasts: [],
  levelUp: null,
  dismissLevelUp: () => {},
  awardXP: () => {},
});

export function useXP() {
  return useContext(XPContext);
}

// ─── Internal state ref — avoids stale closures ───────────────────────────────

let toastCounter = 0;

const XP_LABELS: Record<XPAction, string> = {
  daily_login:   "Daily login",
  make_pick:     "Pick made",
  lock_picks:    "Picks locked in",
  correct_pick:  "Correct pick!",
  poll_correct:  "Poll correct!",
  send_message:  "Message sent",
  add_favourite: "Favourite added",
  set_username:  "Username set",
  set_avatar:    "Profile picture added",
  set_banner:    "Banner picture added",
  set_bio:       "Bio written",
  view_match:    "Match viewed",
  react_play:    "Reacted to a play",
  like_comment:  "Liked a comment",
  add_friend:    "Friend added",
};

export function XPProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId]   = useState<string | null>(null);
  const [xp, setXP]           = useState(0);
  const [level, setLevel]     = useState(1);
  const [log, setLog]         = useState<XPLog>({});
  const [toasts, setToasts]   = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUpInfo | null>(null);

  // Live refs to avoid stale closures in awardXP
  const xpRef     = useRef(0);
  const logRef    = useRef<XPLog>({});
  const userIdRef = useRef<string | null>(null);

  // Pending DB write — debounced 4s
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingXP  = useRef<number>(0);
  const pendingLog = useRef<XPLog>({});

  // ── Sync refs with state ──────────────────────────────────────────────────
  useEffect(() => { xpRef.current = xp; }, [xp]);
  useEffect(() => { logRef.current = log; }, [log]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ── Load on auth change ───────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function loadProfile(uid: string) {
      const { data } = await supabase
        .from("profiles")
        .select("xp, level, xp_log")
        .eq("id", uid)
        .single();

      if (!mounted || !data) return;
      const savedXP  = data.xp    ?? 0;
      const savedLog = (data.xp_log as XPLog) ?? {};
      xpRef.current  = savedXP;
      logRef.current = savedLog;
      setXP(savedXP);
      setLevel(levelFromXP(savedXP));
      setLog(savedLog);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const uid = data?.session?.user?.id ?? null;
      setUserId(uid);
      userIdRef.current = uid;
      if (uid) loadProfile(uid);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      // Don't re-fetch if it's the same user (e.g. token refresh)
      if (uid && uid === userIdRef.current) return;
      setUserId(uid);
      userIdRef.current = uid;
      if (uid) {
        loadProfile(uid);
      } else {
        xpRef.current  = 0;
        logRef.current = {};
        setXP(0);
        setLevel(1);
        setLog({});
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Debounced DB write ────────────────────────────────────────────────────
  const scheduleWrite = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(async () => {  // 2s debounce — fast enough to save before tab close

      const uid = userIdRef.current;
      if (!uid) return;
      const xpToWrite  = pendingXP.current;
      const logToWrite = pendingLog.current;
      await supabase
        .from("profiles")
        .update({
          xp:     xpToWrite,
          level:  levelFromXP(xpToWrite),
          xp_log: logToWrite,
        })
        .eq("id", uid);
    }, 2000);
  }, []);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const addToast = useCallback((text: string, amount: number) => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, text, xp: amount }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  }, []);

  // ── Main award function ───────────────────────────────────────────────────
  const awardXP = useCallback(
    (
      action: XPAction,
      meta?: { roundId?: number; gameId?: number; matchId?: string; slot?: number; pollId?: string; xpOverride?: number }
    ): void => {
      if (!userIdRef.current) return;

      // All reads from refs (never stale)
      const currentXP  = xpRef.current;
      const currentLog = logRef.current;

      if (!canAwardXP(action, currentLog, meta)) return;

      const awarded    = meta?.xpOverride ?? XP_VALUES[action];
      const newXP      = currentXP + awarded;
      const prevLevel  = levelFromXP(currentXP);
      const newLevel   = levelFromXP(newXP);
      const newLog     = recordAction(action, currentLog, meta);

      // Update refs immediately so rapid sequential calls are safe
      xpRef.current  = newXP;
      logRef.current = newLog;

      // Schedule DB persist
      pendingXP.current  = newXP;
      pendingLog.current = newLog;
      scheduleWrite();

      // Optimistic UI update
      setXP(newXP);
      setLevel(newLevel);
      setLog(newLog);

      // Toast
      addToast(XP_LABELS[action], awarded);

      // Level-up modal + notification
      if (newLevel > prevLevel) {
        setLevelUp({ newLevel, prevLevel });
        createNotification(userIdRef.current!, "level_up", null, { level: newLevel });
      }
    },
    [scheduleWrite, addToast]
  );

  const dismissLevelUp = useCallback(() => setLevelUp(null), []);

  return (
    <XPContext.Provider value={{ xp, level, log, toasts, levelUp, dismissLevelUp, awardXP }}>
      {children}
      <XPToastStack toasts={toasts} />
    </XPContext.Provider>
  );
}

// ─── Toast Stack ─────────────────────────────────────────────────────────────

function XPToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top) + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        pointerEvents: "none",
        width: "max-content",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            background: "rgba(15,15,15,0.96)",
            border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: "999px",
            padding: "9px 18px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backdropFilter: "blur(24px)",
            animation: "xpToastIn 0.4s var(--spring-bounce, cubic-bezier(0.34,1.56,0.64,1)) both",
            boxShadow: "0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(74,222,128,0.1)",
          }}
        >
          <span style={{
            fontSize: "13px",
            fontWeight: 800,
            color: "#4ade80",
            letterSpacing: "-0.2px",
            background: "rgba(74,222,128,0.15)",
            borderRadius: "999px",
            padding: "2px 8px",
          }}>
            +{t.xp} XP
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>
            {t.text}
          </span>
        </div>
      ))}
    </div>
  );
}
