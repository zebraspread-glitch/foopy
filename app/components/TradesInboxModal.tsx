"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = "bronze"|"silver"|"gold"|"emerald"|"sapphire"|"ruby"|"amethyst"|"diamond"|"pinkdiamond"|"mythic";

type TradeItem = {
  id: string; direction: "offer"|"request";
  player_id: string; player_name: string;
  rarity: Rarity; rating: number; team: string; team_logo: string;
};

type TradeOffer = {
  id: string; sender_id: string; receiver_id: string;
  status: "pending"|"accepted"|"declined"|"cancelled";
  message?: string|null; created_at: string;
  sender:   { id: string; username: string|null; display_name: string|null; avatar_url?: string|null } | null;
  receiver: { id: string; username: string|null; display_name: string|null; avatar_url?: string|null } | null;
  items: TradeItem[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_META: Record<Rarity, { color: string; glow: string }> = {
  bronze:      { color: "#cd7f32", glow: "rgba(205,127,50,0.55)" },
  silver:      { color: "#c0c0c0", glow: "rgba(192,192,192,0.55)" },
  gold:        { color: "#ffd700", glow: "rgba(255,215,0,0.55)" },
  emerald:     { color: "#10b981", glow: "rgba(16,185,129,0.60)" },
  sapphire:    { color: "#3b82f6", glow: "rgba(59,130,246,0.60)" },
  ruby:        { color: "#ef4444", glow: "rgba(239,68,68,0.60)" },
  amethyst:    { color: "#a78bfa", glow: "rgba(167,139,250,0.65)" },
  diamond:     { color: "#67e8f9", glow: "rgba(103,232,249,0.65)" },
  pinkdiamond: { color: "#f472b6", glow: "rgba(244,114,182,0.65)" },
  mythic:      { color: "#c084fc", glow: "rgba(192,132,252,0.75)" },
};

const TEAM_FOLDER: Record<string, string> = {
  Adelaide: "crows", "Adelaide Crows": "crows",
  "Brisbane Lions": "lions", Brisbane: "lions",
  Carlton: "blues", Collingwood: "magpies", Essendon: "bombers",
  Fremantle: "dockers", GWS: "giants", "GWS Giants": "giants",
  Geelong: "cats", "Geelong Cats": "cats",
  "Gold Coast": "suns", "Gold Coast Suns": "suns",
  Hawthorn: "hawks", Melbourne: "demons",
  "North Melbourne": "kangaroos", "Port Adelaide": "power",
  Richmond: "tigers", "St Kilda": "saints",
  Sydney: "swans", "Sydney Swans": "swans",
  "West Coast": "eagles", "West Coast Eagles": "eagles",
  "Western Bulldogs": "bulldogs",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  accepted:  { label: "Accepted",  color: "#4ade80", bg: "rgba(74,222,128,.12)",  border: "rgba(74,222,128,.25)" },
  declined:  { label: "Declined",  color: "#f87171", bg: "rgba(248,113,113,.12)", border: "rgba(248,113,113,.25)" },
  cancelled: { label: "Cancelled", color: "rgba(255,255,255,.4)", bg: "rgba(255,255,255,.06)", border: "rgba(255,255,255,.12)" },
};

// ── Mini card ─────────────────────────────────────────────────────────────────
// Zero state — image errors handled by DOM mutation so no re-renders cascade.

const TradeMiniCard = memo(function TradeMiniCard({ rarity, playerName, team, playerId, rating }: {
  rarity: Rarity; playerName: string; team: string; playerId: string; rating: number;
}) {
  const meta   = RARITY_META[rarity] ?? RARITY_META.bronze;
  const folder = TEAM_FOLDER[team] ?? team.toLowerCase().replace(/[^a-z]/g, "");
  const slug   = playerId.toLowerCase().replace(/[^a-z0-9]/g, "");
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div style={{ width: 52, flexShrink: 0 }}>
      <div style={{
        position: "relative", aspectRatio: "3/4.2", borderRadius: 8, overflow: "hidden",
        boxShadow: `0 0 0 1.5px ${meta.color}88, 0 4px 14px ${meta.glow}`,
      }}>
        {/* Card art */}
        <img src={`/cards/${rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,0) 35%,rgba(0,0,0,.72) 72%,rgba(0,0,0,.9) 100%)" }} />
        {/* Player photo */}
        <div style={{ position: "absolute", top: "13%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden" }}>
          <img
            ref={imgRef}
            src={`/players/${folder}/${slug}.png`}
            alt=""
            onError={() => { if (imgRef.current) imgRef.current.style.display = "none"; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
          />
        </div>
        {/* Rating */}
        <div style={{ position: "absolute", top: 2, right: 2, fontSize: 6.5, fontWeight: 900, color: meta.color, background: "rgba(0,0,0,.85)", borderRadius: 3, padding: "1px 3px", lineHeight: 1.5 }}>
          {rating}
        </div>
        {/* Name */}
        <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 5.5, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px", textShadow: `0 0 6px ${meta.glow}` }}>
          {playerName.split(" ").pop()}
        </div>
      </div>
    </div>
  );
});

// ── Card strip (offer or request side) ───────────────────────────────────────

function CardStrip({ items, label }: { items: TradeItem[]; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.28)", letterSpacing: ".1em", marginBottom: 7 }}>
        {label}
      </div>
      {items.length > 0 ? (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {items.map(item => (
            <TradeMiniCard
              key={item.id}
              rarity={item.rarity}
              playerName={item.player_name}
              team={item.team}
              playerId={item.player_id}
              rating={item.rating}
            />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.18)", fontStyle: "italic" }}>Nothing</div>
      )}
    </div>
  );
}

// ── User avatar chip ──────────────────────────────────────────────────────────

function UserChip({ profile, label }: { profile: TradeOffer["sender"]; label: string }) {
  const name   = profile?.display_name || profile?.username || "Unknown";
  const handle = profile?.username ? `@${profile.username}` : name;
  const initials = (profile?.display_name || profile?.username || "?")
    .slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(255,255,255,.12)" }} />
        ) : (
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(96,165,250,.25)", border: "1.5px solid rgba(96,165,250,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: "#60a5fa", flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{handle}</span>
      </div>
    </div>
  );
}

// ── Single trade row — self-contained state so sibling rows never re-render ──

const TradeRow = memo(function TradeRow({
  trade: initialTrade, myUserId, accessToken, onStatusChange,
}: {
  trade: TradeOffer; myUserId: string; accessToken: string;
  onStatusChange: (id: string, newStatus: TradeOffer["status"]) => void;
}) {
  const [trade, setTrade]   = useState(initialTrade);
  const [acting, setActing] = useState(false);
  const [toast, setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

  // Sync if parent gives a fresh copy (e.g. after a full refresh)
  useEffect(() => { setTrade(initialTrade); }, [initialTrade.status]);

  const isSender = trade.sender_id === myUserId;
  const other    = isSender ? trade.receiver : trade.sender;

  const offerItems   = trade.items.filter(i => i.direction === "offer");
  const requestItems = trade.items.filter(i => i.direction === "request");

  const doAction = useCallback(async (action: "accept"|"decline"|"cancel") => {
    if (acting) return;
    setActing(true);

    // Cancel: disable button while request is in flight, remove on success only
    if (action === "cancel") {
      try {
        const res = await fetch(`/api/trades/${trade.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: "cancel" }),
        });
        if (res.ok) {
          onStatusChange(trade.id, "cancelled"); // remove from list
        } else {
          const d = await res.json().catch(() => ({}));
          setToast({ msg: d.error ?? "Failed to cancel", ok: false });
          setTimeout(() => setToast(null), 3000);
        }
      } catch {
        setToast({ msg: "Network error — try again", ok: false });
        setTimeout(() => setToast(null), 3000);
      } finally {
        setActing(false);
      }
      return;
    }

    // ── Optimistic update — instant UI response ─────────────────────────────
    const newStatus: TradeOffer["status"] = action === "accept" ? "accepted" : "declined";
    setTrade(prev => ({ ...prev, status: newStatus }));

    try {
      const res  = await fetch(`/api/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        onStatusChange(trade.id, newStatus);
        const msgs = { accept: "Trade accepted! 🎉", decline: "Trade declined.", cancel: "" };
        setToast({ msg: msgs[action], ok: action === "accept" });
        setTimeout(() => setToast(null), 2500);
      } else {
        const msg: string = data.error ?? "Something went wrong";
        // Only treat it as stale if the trade itself is gone/completed — not card errors
        const isStale =
          res.status === 404 ||
          msg.toLowerCase().includes("no longer pending") ||
          msg.toLowerCase().includes("trade not found") ||
          msg.toLowerCase().includes("no longer owns") ||
          msg.toLowerCase().includes("you no longer own");
        if (isStale) {
          onStatusChange(trade.id, "cancelled");
          return;
        }
        // Revert on other server errors
        setTrade(prev => ({ ...prev, status: "pending" }));
        setToast({ msg, ok: false });
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setTrade(prev => ({ ...prev, status: "pending" }));
      setToast({ msg: "Network error — try again", ok: false });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setActing(false);
    }
  }, [acting, trade.id, accessToken, onStatusChange]);

  const isPending = trade.status === "pending";
  const statusMeta = STATUS_META[trade.status];
  const dateLabel = new Date(trade.created_at).toLocaleDateString("en-AU", {
    day: "numeric", month: "short",
  });

  return (
    <div style={{
      background: isPending
        ? "rgba(255,255,255,.03)"
        : "transparent",
      border: `1px solid ${isPending ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.05)"}`,
      borderRadius: 16,
      padding: "14px 14px 12px",
      marginBottom: 10,
      transition: "all 0.2s ease",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <UserChip profile={other} label={isSender ? "TO" : "FROM"} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {isPending && !isSender && (
            <div style={{ fontSize: 9, fontWeight: 900, color: "#fbbf24", background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.28)", borderRadius: 99, padding: "2px 8px", letterSpacing: ".05em" }}>
              RESPOND
            </div>
          )}
          {!isPending && statusMeta && (
            <div style={{ fontSize: 9, fontWeight: 900, color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, borderRadius: 99, padding: "2px 8px", letterSpacing: ".05em" }}>
              {statusMeta.label.toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.22)", fontWeight: 600 }}>{dateLabel}</span>
        </div>
      </div>

      {/* ── Cards ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <CardStrip items={offerItems}   label={isSender ? "YOU OFFER"  : "THEY OFFER"} />
        <div style={{ paddingTop: 22, color: "rgba(255,255,255,.15)", fontSize: 14, flexShrink: 0 }}>→</div>
        <CardStrip items={requestItems} label={isSender ? "YOU WANT"   : "THEY WANT" } />
      </div>

      {/* ── Message ── */}
      {trade.message && (
        <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,.38)", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "6px 10px", fontStyle: "italic" }}>
          "{trade.message}"
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          marginTop: 10, padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700,
          background: toast.ok ? "rgba(74,222,128,.12)" : "rgba(248,113,113,.12)",
          border: `1px solid ${toast.ok ? "rgba(74,222,128,.28)" : "rgba(248,113,113,.28)"}`,
          color: toast.ok ? "#4ade80" : "#f87171",
          transition: "opacity 0.2s",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Actions ── */}
      {isPending && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {!isSender ? (
            <>
              <button
                onClick={() => doAction("accept")}
                disabled={acting}
                style={{
                  flex: 2, padding: "10px 0", borderRadius: 11, border: "none",
                  background: acting ? "rgba(74,222,128,.1)" : "rgba(74,222,128,.18)",
                  color: "#4ade80", fontWeight: 900, fontSize: 13,
                  cursor: acting ? "default" : "pointer", fontFamily: "inherit",
                  transition: "background 0.12s",
                }}
              >
                {acting ? "…" : "✓  Accept"}
              </button>
              <button
                onClick={() => doAction("decline")}
                disabled={acting}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 11, border: "1px solid rgba(248,113,113,.2)",
                  background: "rgba(248,113,113,.07)", color: "#f87171", fontWeight: 700, fontSize: 13,
                  cursor: acting ? "default" : "pointer", fontFamily: "inherit",
                  transition: "background 0.12s",
                }}
              >
                Decline
              </button>
            </>
          ) : (
            <button
              onClick={() => doAction("cancel")}
              disabled={acting}
              style={{
                padding: "9px 16px", borderRadius: 11,
                border: "1px solid rgba(255,255,255,.1)",
                background: "transparent", color: "rgba(255,255,255,.38)",
                fontWeight: 700, fontSize: 12,
                cursor: acting ? "default" : "pointer", fontFamily: "inherit",
                transition: "color 0.12s",
              }}
            >
              {acting ? "Cancelling…" : "Cancel offer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ── Main modal ─────────────────────────────────────────────────────────────────

export default function TradesInboxModal({
  myUserId, accessToken, initialTrades, onClose,
}: {
  myUserId: string; accessToken: string;
  initialTrades?: TradeOffer[]; onClose: () => void;
}) {
  const [tab, setTab]         = useState<"incoming"|"sent"|"history">("incoming");
  const [trades, setTrades]   = useState<TradeOffer[]>((initialTrades ?? []).filter(t => t.status !== "cancelled"));
  const [loading, setLoading] = useState(!initialTrades);
  const [error, setError]     = useState<string|null>(null);
  const [spinning, setSpinning] = useState(false);

  const fetchTrades = useCallback(async (showSpinner = false) => {
    if (!accessToken) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    if (showSpinner) setSpinning(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch("/api/trades", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const d = await res.json();
        setTrades((d.trades ?? []).filter((t: TradeOffer) => t.status !== "cancelled"));
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to load trades");
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setError(err?.name === "AbortError" ? "Request timed out — tap to retry" : "Network error — please try again");
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!initialTrades) fetchTrades();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called by TradeRow — remove cancelled trades, reclassify others
  const handleStatusChange = useCallback((id: string, newStatus: TradeOffer["status"]) => {
    if (newStatus === "cancelled") {
      setTrades(prev => prev.filter(t => t.id !== id));
    } else {
      setTrades(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
      // Move to History tab so the user sees the result
      if (newStatus === "accepted" || newStatus === "declined") {
        setTab("history");
      }
    }
  }, []);

  const incoming = trades.filter(t => t.receiver_id === myUserId && t.status === "pending");
  const sent     = trades.filter(t => t.sender_id   === myUserId && t.status === "pending");
  const history  = trades.filter(t => t.status !== "pending" && t.status !== "cancelled")
                         .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const current = tab === "incoming" ? incoming : tab === "sent" ? sent : history;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.82)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tmFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .tm-refresh:hover { opacity: 1 !important; }
        .tm-tab:active { opacity: 0.7; }
        .tm-row { animation: tmFadeIn 0.18s ease both; }
      `}</style>

      <div
        style={{ background: "#0f0f13", borderRadius: 22, width: "100%", maxWidth: 500, maxHeight: "90dvh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid rgba(255,255,255,.09)", boxShadow: "0 24px 80px rgba(0,0,0,.7)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-.02em", color: "#fff" }}>Trades</span>
              <button
                className="tm-refresh"
                onClick={() => fetchTrades(true)}
                disabled={spinning}
                title="Refresh"
                style={{ appearance: "none", border: "none", background: "rgba(255,255,255,.07)", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: "rgba(255,255,255,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: spinning ? 0.5 : 0.7, transition: "opacity 0.15s" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: spinning ? "spin 0.7s linear infinite" : "none" }}>
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            </div>
            <button
              onClick={onClose}
              style={{ appearance: "none", border: "none", background: "rgba(255,255,255,.08)", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,.55)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >×</button>
          </div>

          {/* Hint */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Go to someone's album and tap their card to start a trade
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            {([ ["incoming","Incoming",incoming.length], ["sent","Sent",sent.length], ["history","History",null] ] as const).map(([key, label, count]) => (
              <button
                key={key}
                className="tm-tab"
                onClick={() => setTab(key)}
                style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", padding: "7px 14px 9px", fontFamily: "inherit", fontSize: 13, fontWeight: tab === key ? 900 : 600, color: tab === key ? "#fff" : "rgba(255,255,255,.35)", borderBottom: tab === key ? "2px solid #fff" : "2px solid transparent", marginBottom: -1, transition: "all 0.15s" }}
              >
                {label}
                {count != null && count > 0 && (
                  <span style={{ marginLeft: 5, background: "#3b82f6", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 900, padding: "1px 6px" }}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px 8px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 12 }}>
              <div style={{ width: 26, height: 26, border: "2.5px solid rgba(255,255,255,.08)", borderTop: "2.5px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Loading trades…</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 13, color: "#f87171", fontWeight: 700, marginBottom: 12 }}>{error}</div>
              <button onClick={() => fetchTrades(true)} style={{ appearance: "none", border: "1px solid rgba(255,255,255,.13)", background: "transparent", color: "rgba(255,255,255,.55)", fontSize: 12, fontWeight: 700, padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
                Try again
              </button>
            </div>
          ) : current.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,.28)" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>
                {tab === "incoming" ? "📭" : tab === "sent" ? "📤" : "📋"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {tab === "incoming" ? "No incoming offers" : tab === "sent" ? "No sent offers" : "No trade history"}
              </div>
            </div>
          ) : (
            <div className="tm-row">
              {current.map(trade => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  myUserId={myUserId}
                  accessToken={accessToken}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
