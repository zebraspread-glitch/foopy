"use client";

import { useEffect, useState } from "react";
import { CARD_PLAYERS } from "@/app/data/cardPlayers";

type Rarity = "bronze" | "silver" | "gold" | "emerald" | "sapphire" | "ruby" | "amethyst" | "diamond" | "pinkdiamond" | "mythic";

const TEAM_COLORS: Record<string, string> = {
  Adelaide: "#002b5c", "Brisbane Lions": "#a50034", Carlton: "#031a35",
  Collingwood: "#1e1e28", Essendon: "#cc0000", Fremantle: "#4b1979",
  "Geelong Cats": "#003b73", Geelong: "#003b73", "Gold Coast": "#c0392b",
  GWS: "#e05a1a", "GWS Giants": "#e05a1a", "Greater Western Sydney": "#e05a1a",
  Hawthorn: "#6b3a1f", Melbourne: "#c8102e", "North Melbourne": "#0055a4",
  "Port Adelaide": "#008999", Richmond: "#facc15", "St Kilda": "#c8102e",
  Sydney: "#c0392b", "West Coast": "#003087", "Western Bulldogs": "#1a4abf",
};

const RARITY_META: Record<Rarity, { color: string; glow: string }> = {
  bronze:      { color: "#cd7f32", glow: "rgba(205,127,50,0.6)" },
  silver:      { color: "#c0c0c0", glow: "rgba(192,192,192,0.6)" },
  gold:        { color: "#ffd700", glow: "rgba(255,215,0,0.6)" },
  emerald:     { color: "#10b981", glow: "rgba(16,185,129,0.65)" },
  sapphire:    { color: "#3b82f6", glow: "rgba(59,130,246,0.65)" },
  ruby:        { color: "#ef4444", glow: "rgba(239,68,68,0.65)" },
  amethyst:    { color: "#a78bfa", glow: "rgba(167,139,250,0.70)" },
  diamond:     { color: "#67e8f9", glow: "rgba(103,232,249,0.70)" },
  pinkdiamond: { color: "#f472b6", glow: "rgba(244,114,182,0.70)" },
  mythic:      { color: "#c084fc", glow: "rgba(192,132,252,0.80)" },
};

type TradeOffer = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  sender: { id: string; username: string | null; display_name: string | null } | null;
  receiver: { id: string; username: string | null; display_name: string | null } | null;
  items: { id: string; direction: "offer" | "request"; player_id: string; player_name: string; rarity: Rarity; rating: number; team: string; team_logo: string }[];
};

function TradeMiniCard({ rarity, playerName, team, rating }: { rarity: Rarity; playerName: string; team: string; rating: number }) {
  const meta = RARITY_META[rarity];
  const player = CARD_PLAYERS.find(p => p.name === playerName || p.id === playerName);
  return (
    <div style={{ width: 56, position: "relative", aspectRatio: "3/4.2", borderRadius: 8, overflow: "hidden", boxShadow: `0 0 0 1.5px ${meta.color}88, 0 3px 12px ${meta.glow}` }}>
      <img src={`/cards/${rarity}.png`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,0) 35%,rgba(0,0,0,.75) 72%,rgba(0,0,0,.92) 100%)" }} />
      {player && (
        <div style={{ position: "absolute", top: "14%", left: "50%", transform: "translateX(-50%)", width: "68%", aspectRatio: "1/1", borderRadius: "50%", overflow: "hidden", background: (TEAM_COLORS[team] ?? "#1e2438") + "44" }}>
          <img src={`/players/${player.folder}/${player.id}.png`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
      )}
      <div style={{ position: "absolute", top: 3, right: 3, fontSize: 7, fontWeight: 1000, color: meta.color, background: "rgba(0,0,0,.85)", borderRadius: 4, padding: "1px 3px" }}>{rating}</div>
      <div style={{ position: "absolute", bottom: 3, left: 0, right: 0, textAlign: "center", fontSize: 6.5, fontWeight: 900, color: meta.color, letterSpacing: ".06em" }}>{rarity.toUpperCase()}</div>
    </div>
  );
}

export default function TradesInboxModal({ myUserId, accessToken, initialTrades, onClose }: { myUserId: string; accessToken: string; initialTrades?: TradeOffer[]; onClose: () => void }) {
  const [tab, setTab] = useState<"incoming" | "sent" | "history">("incoming");
  const [trades, setTrades] = useState<TradeOffer[]>(initialTrades ?? []);
  const [loading, setLoading] = useState(!initialTrades);
  const [acting, setActing] = useState<string | null>(null);

  async function fetchTrades() {
    try {
      const res = await fetch("/api/trades", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { const d = await res.json(); setTrades(d.trades ?? []); }
    } catch (e) {
      console.error("[TradesInboxModal]", e);
    } finally {
      setLoading(false);
    }
  }

  // Only fetch on mount if we didn't get pre-loaded data
  useEffect(() => { if (!initialTrades) fetchTrades(); }, []);

  async function doAction(tradeId: string, action: "accept" | "decline" | "cancel") {
    setActing(tradeId);
    const res = await fetch(`/api/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action }),
    });
    if (res.ok) await fetchTrades();
    setActing(null);
  }

  const incoming = trades.filter(t => t.receiver_id === myUserId && t.status === "pending");
  const sent     = trades.filter(t => t.sender_id  === myUserId && t.status === "pending");
  const history  = trades.filter(t => t.status !== "pending");

  const tabList = [
    { key: "incoming" as const, label: "Incoming", count: incoming.length },
    { key: "sent"     as const, label: "Sent",     count: sent.length },
    { key: "history"  as const, label: "History",  count: null },
  ];

  const current = tab === "incoming" ? incoming : tab === "sent" ? sent : history;

  function TradeRow({ trade }: { trade: TradeOffer }) {
    const isSender = trade.sender_id === myUserId;
    const other = isSender ? trade.receiver : trade.sender;
    const otherName = other?.display_name || other?.username || "Unknown";
    const offerItems   = trade.items.filter(i => i.direction === "offer");
    const requestItems = trade.items.filter(i => i.direction === "request");

    const statusColors: Record<string, string> = {
      accepted:  "#4ade80",
      declined:  "#f87171",
      cancelled: "rgba(255,255,255,.35)",
      pending:   "#60a5fa",
    };

    return (
      <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.85)" }}>
            {isSender ? `To @${otherName}` : `From @${otherName}`}
          </div>
          {tab === "history" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: statusColors[trade.status] ?? "#fff", letterSpacing: ".04em" }}>
              {trade.status.toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", marginBottom: 6, letterSpacing: ".08em" }}>
              {isSender ? "YOU OFFER" : "THEY OFFER"}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {offerItems.map(item => (
                <TradeMiniCard key={item.id} rarity={item.rarity} playerName={item.player_name} team={item.team} rating={item.rating} />
              ))}
            </div>
          </div>

          <div style={{ paddingTop: 28, color: "rgba(255,255,255,.25)", fontSize: 16 }}>⇄</div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", marginBottom: 6, letterSpacing: ".08em" }}>
              {isSender ? "YOU WANT" : "THEY WANT"}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {requestItems.map(item => (
                <TradeMiniCard key={item.id} rarity={item.rarity} playerName={item.player_name} team={item.team} rating={item.rating} />
              ))}
            </div>
          </div>
        </div>

        {trade.status === "pending" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!isSender && (
              <>
                <button
                  onClick={() => doAction(trade.id, "accept")}
                  disabled={!!acting}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "rgba(74,222,128,.15)", color: "#4ade80", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {acting === trade.id ? "…" : "Accept"}
                </button>
                <button
                  onClick={() => doAction(trade.id, "decline")}
                  disabled={!!acting}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "rgba(248,113,113,.12)", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Decline
                </button>
              </>
            )}
            {isSender && (
              <button
                onClick={() => doAction(trade.id, "cancel")}
                disabled={!!acting}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "rgba(255,255,255,.4)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel offer
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#111", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-.02em" }}>Trades</div>
            <button onClick={onClose} style={{ appearance: "none", border: "none", background: "rgba(255,255,255,.08)", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,.6)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            {tabList.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", padding: "8px 16px 10px", fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.key ? 900 : 600, color: tab === t.key ? "#fff" : "rgba(255,255,255,.38)", borderBottom: tab === t.key ? "2px solid #fff" : "2px solid transparent", marginBottom: -1, transition: "all 0.15s" }}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span style={{ marginLeft: 5, background: "#3b82f6", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 900, padding: "1px 6px" }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "0 18px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: 24, height: 24, border: "2.5px solid rgba(255,255,255,.1)", borderTop: "2.5px solid #60a5fa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            </div>
          ) : current.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,.3)", fontSize: 14, fontWeight: 600 }}>
              {tab === "incoming" ? "No incoming offers" : tab === "sent" ? "No sent offers" : "No trade history"}
            </div>
          ) : (
            current.map(trade => <TradeRow key={trade.id} trade={trade} />)
          )}
        </div>
      </div>
    </div>
  );
}
