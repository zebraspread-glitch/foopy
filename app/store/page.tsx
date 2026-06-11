"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";
import { type Cosmetic, type EquippedCosmetics, nameColorStyle, avatarFrameStyle } from "@/app/lib/cosmetics";

// Rarity visual identity: label, accent colour, and the gradient used for
// borders / buttons. Legendary gets a wide multi-stop gradient that animates.
const RARITY: Record<string, { label: string; color: string; grad: string }> = {
  common:    { label: "Common",    color: "#60a5fa", grad: "linear-gradient(135deg,#2563eb,#60a5fa)" },
  rare:      { label: "Rare",      color: "#c084fc", grad: "linear-gradient(135deg,#7c3aed,#c084fc)" },
  epic:      { label: "Epic",      color: "#fb7185", grad: "linear-gradient(135deg,#ec4899,#f59e0b)" },
  legendary: { label: "Legendary", color: "#fbbf24", grad: "linear-gradient(90deg,#fbbf24,#f97316,#ec4899,#a855f7,#38bdf8,#fbbf24)" },
};
const rarOf = (c: Cosmetic) => RARITY[c.rarity ?? "common"] ?? RARITY.common;

const SECTION_TITLE: Record<string, string> = {
  name_color: "Name Colours",
  profile_frame: "Profile Rings",
};

export default function StorePage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("You");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number>(0);
  const [catalog, setCatalog] = useState<Cosmetic[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<EquippedCosmetics>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;
    setToken(accessToken);
    if (!session) { setLoading(false); return; }

    const uid = session.user.id;
    const [profileRes, catalogRes, ownedRes] = await Promise.all([
      supabase.from("profiles").select("username, avatar_url, tokens, equipped_cosmetics").eq("id", uid).single(),
      supabase.from("cosmetics").select("*").eq("is_active", true).order("category").order("sort_order"),
      supabase.from("user_cosmetics").select("cosmetic_id").eq("user_id", uid),
    ]);

    if (profileRes.data) {
      setUsername(profileRes.data.username || "You");
      setAvatarUrl(profileRes.data.avatar_url ?? null);
      setTokens(profileRes.data.tokens ?? 0);
      setEquipped((profileRes.data.equipped_cosmetics ?? {}) as EquippedCosmetics);
    }
    setCatalog((catalogRes.data ?? []) as Cosmetic[]);
    setOwned(new Set((ownedRes.data ?? []).map((r: { cosmetic_id: string }) => r.cosmetic_id)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function buy(c: Cosmetic) {
    if (!token || busyKey) return;
    setBusyKey(c.key); setMsg(null);
    try {
      const res = await fetch("/api/cosmetics/purchase", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cosmetic_key: c.key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMsg(data?.error ?? "Purchase failed"); return; }
      setTokens(data.tokens);
      setOwned(prev => new Set(prev).add(c.id));
    } finally { setBusyKey(null); }
  }

  async function toggleEquip(c: Cosmetic) {
    if (!token || busyKey || !c.slot) return;
    const isEquipped = equipped[c.slot] === c.id;
    setBusyKey(c.key); setMsg(null);
    try {
      const res = await fetch("/api/cosmetics/equip", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cosmetic_id: c.id, equip: !isEquipped }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMsg(data?.error ?? "Failed"); return; }
      setEquipped(data.equipped ?? {});
    } finally { setBusyKey(null); }
  }

  const equippedNameAsset = useMemo(() => {
    const id = equipped["name_color"];
    return id ? (catalog.find(c => c.id === id)?.asset ?? null) : null;
  }, [equipped, catalog]);

  const equippedFrameAsset = useMemo(() => {
    const id = equipped["profile_frame"];
    return id ? (catalog.find(c => c.id === id)?.asset ?? null) : null;
  }, [equipped, catalog]);

  // The featured item: highest rarity available (legendary → epic → first).
  const featured = useMemo(() =>
    catalog.find(c => c.rarity === "legendary") ?? catalog.find(c => c.rarity === "epic") ?? catalog[0] ?? null,
  [catalog]);

  const limited = useMemo(() => catalog.filter(c => c.is_limited), [catalog]);

  // Sections grouped by equip slot (Name Colours, Profile Rings, …).
  const sections = useMemo(() => {
    const map = new Map<string, Cosmetic[]>();
    for (const c of catalog) {
      const key = c.slot ?? c.category;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [catalog]);

  // ── Reusable bits ──────────────────────────────────────────────────────────

  const Sample = ({ c, size }: { c: Cosmetic; size: number }) => (
    c.slot === "profile_frame" ? (
      <div className="s-sample-inner" style={avatarFrameStyle(c.asset, Math.max(2.5, size / 18)) ?? undefined}>
        <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--surface-2)", border: "2px solid var(--bg)" }} />
      </div>
    ) : (
      <span className="s-sample-inner" style={{ fontSize: size * 0.95, fontWeight: 1000, lineHeight: 1, ...nameColorStyle(c.slot === "name_color" ? c.asset : null) }}>Aa</span>
    )
  );

  const Card = ({ c, i }: { c: Cosmetic; i: number }) => {
    const isOwned = owned.has(c.id);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const canAfford = tokens >= c.token_price;
    const busy = busyKey === c.key;
    const r = rarOf(c);
    const premium = c.rarity === "epic" || c.rarity === "legendary";
    return (
      <div
        className={`s-card${c.rarity === "legendary" ? " legendary" : ""}${isEquipped ? " equipped" : ""}`}
        style={{ "--rg": r.grad, "--rc": r.color, animationDelay: `${Math.min(i, 12) * 0.04}s` } as CSSProperties}
      >
        <div className="s-inner">
          <div className={`s-preview${premium ? " premium" : ""}`}>
            <div className="s-preview-glow" />
            <Sample c={c} size={c.slot === "profile_frame" ? 30 : 30} />
            {c.is_limited && <span className="s-limited-tag">Limited</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", color: r.color }}>{r.label}</span>
          </div>
          {isOwned ? (
            <button className="s-btn s-btn-equip" data-on={isEquipped} onClick={() => toggleEquip(c)} disabled={busy || !c.slot}>
              {busy ? "…" : isEquipped ? "Equipped ✓" : "Equip"}
            </button>
          ) : (
            <button className="s-btn s-btn-buy" onClick={() => buy(c)} disabled={busy || !canAfford}>
              {busy ? "…" : (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <img src="/token/token.png" alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                  {c.token_price.toLocaleString()}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 2px" }}>
      <span style={{ width: 4, height: 17, borderRadius: 99, background: "linear-gradient(180deg,#38bdf8,#6366f1)" }} />
      <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text-1)" }}>{title}</span>
    </div>
  );

  const Featured = ({ c }: { c: Cosmetic }) => {
    const isOwned = owned.has(c.id);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const canAfford = tokens >= c.token_price;
    const busy = busyKey === c.key;
    const r = rarOf(c);
    return (
      <div className="s-featured" style={{ "--rg": r.grad, "--rc": r.color } as CSSProperties}>
        <div className="s-featured-card">
          <div className="s-featured-glow" />
          <div className="s-featured-shine" />
          <span className="s-featured-tag">★ Featured Today</span>
          <div className="s-featured-row">
            <div className="s-featured-art">
              <div className="s-preview-glow" />
              <Sample c={c} size={c.slot === "profile_frame" ? 56 : 50} />
            </div>
            <div className="s-featured-meta">
              <div className="s-featured-name">{c.name}</div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", color: r.color }}>{r.label}</div>
              {isOwned ? (
                <button className="s-btn s-featured-btn s-btn-equip" data-on={isEquipped} onClick={() => toggleEquip(c)} disabled={busy || !c.slot}>
                  {busy ? "…" : isEquipped ? "Equipped ✓" : "Equip"}
                </button>
              ) : (
                <button className="s-btn s-featured-btn" onClick={() => buy(c)} disabled={busy || !canAfford}>
                  {busy ? "…" : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <img src="/token/token.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                      {c.token_price.toLocaleString()}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="s-main">
      <style>{`
        @keyframes sFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sShine { 0% { transform: translateX(-130%); } 60%, 100% { transform: translateX(130%); } }
        @keyframes sFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes sBorderFlow { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }

        .s-main { min-height: 100dvh; background: var(--bg); color: var(--text-1); padding-bottom: calc(90px + env(safe-area-inset-bottom)); position: relative; overflow-x: hidden; }
        .s-ambient { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 140%; height: 380px; pointer-events: none; z-index: 0;
          background: radial-gradient(58% 100% at 50% 0%, rgba(99,102,241,.30), rgba(56,189,248,.10) 45%, transparent 72%); }

        .s-header { position: sticky; top: 0; z-index: 50; height: calc(52px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 16px 0 58px;
          display: flex; align-items: center; justify-content: space-between;
          background: linear-gradient(180deg, rgba(10,10,15,.82), rgba(10,10,15,.30)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        .s-title { font-size: 19px; font-weight: 900; letter-spacing: -.03em; }
        .s-token-pill { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; overflow: hidden;
          background: linear-gradient(135deg,#38bdf8,#6366f1); box-shadow: 0 4px 16px rgba(99,102,241,.5), inset 0 1px 0 rgba(255,255,255,.35); }
        .s-token-pill img { width: 17px; height: 17px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
        .s-token-pill span { font-size: 14px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
        .s-token-pill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.5) 50%, transparent 70%); transform: translateX(-130%); animation: sShine 3.6s ease-in-out infinite; }

        .s-content { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 18px 14px; display: flex; flex-direction: column; gap: 26px; }

        .s-myprofile { display: flex; flex-direction: column; align-items: center; gap: 11px; padding: 24px 16px; border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.012)); border: 1px solid rgba(255,255,255,.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 14px 40px -20px rgba(99,102,241,.5); backdrop-filter: blur(10px); }
        .s-myprofile-label { font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--text-3); }
        .s-preview-av { animation: sFloat 3.8s ease-in-out infinite; }
        .s-preview-av-inner { width: 78px; height: 78px; border-radius: 50%; overflow: hidden; background: var(--surface-3); border: 2px solid var(--border-2); display: flex; align-items: center; justify-content: center; color: var(--text-2); font-weight: 800; font-size: 26px; }
        .s-preview-av-inner img { width: 100%; height: 100%; object-fit: cover; }
        .s-preview-name { font-size: 25px; font-weight: 1000; letter-spacing: -.02em; }

        /* Featured hero */
        .s-featured { position: relative; border-radius: 24px; padding: 1.5px; background: var(--rg); background-size: 200% 100%; animation: sBorderFlow 9s linear infinite;
          box-shadow: 0 24px 54px -18px rgba(0,0,0,.7), 0 0 44px -14px var(--rc); }
        .s-featured-card { position: relative; overflow: hidden; border-radius: 22.5px; background: linear-gradient(135deg, #15151f, #0c0c13); padding: 18px; }
        .s-featured-glow { position: absolute; right: -18%; top: -45%; width: 70%; height: 170%; pointer-events: none; opacity: .32; background: radial-gradient(circle, var(--rc), transparent 64%); }
        .s-featured-shine { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 36%, rgba(255,255,255,.10) 50%, transparent 64%); transform: translateX(-130%); animation: sShine 5s ease-in-out infinite; }
        .s-featured-tag { position: relative; display: inline-block; font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.18); padding: 4px 10px; border-radius: 999px; margin-bottom: 16px; }
        .s-featured-row { position: relative; display: flex; align-items: center; gap: 18px; }
        .s-featured-art { width: 112px; height: 112px; flex-shrink: 0; border-radius: 18px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); }
        .s-featured-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .s-featured-name { font-size: 22px; font-weight: 1000; color: #fff; letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .s-featured-btn { margin-top: 10px; align-self: flex-start; padding: 11px 24px; border-radius: 14px; font-size: 15px; color: #fff; background: var(--rg); box-shadow: 0 8px 22px -8px var(--rc), inset 0 1px 0 rgba(255,255,255,.3); }

        /* Product grid + cards */
        .s-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
        .s-card { position: relative; padding: 1.5px; border-radius: 18px; background: var(--rg); animation: sFadeUp .5s cubic-bezier(.2,.7,.3,1) both;
          transition: transform .18s ease, box-shadow .25s ease; will-change: transform; }
        .s-card.legendary { background-size: 300% 100%; animation: sFadeUp .5s cubic-bezier(.2,.7,.3,1) both, sBorderFlow 6s linear infinite; }
        .s-card:hover { transform: translateY(-4px) scale(1.015); box-shadow: 0 18px 36px -12px rgba(0,0,0,.6), 0 0 24px -8px var(--rc); }
        .s-card:active { transform: translateY(-1px) scale(.99); }
        .s-card.equipped { box-shadow: 0 0 20px -4px var(--rc); }
        .s-inner { position: relative; border-radius: 16.5px; background: linear-gradient(180deg, var(--surface-1), var(--surface-2)); padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100%; }
        .s-preview { position: relative; overflow: hidden; height: 96px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); }
        .s-preview-glow { position: absolute; inset: 0; pointer-events: none; opacity: .2; background: radial-gradient(circle at 50% 42%, var(--rc), transparent 62%); }
        .s-preview.premium::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,.14) 50%, transparent 62%); transform: translateX(-130%); animation: sShine 3s ease-in-out infinite; }
        .s-sample-inner { position: relative; transition: transform .2s ease; }
        .s-card:hover .s-sample-inner { transform: scale(1.12); }
        .s-limited-tag { position: absolute; top: 6px; right: 6px; font-size: 8px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; color: #fff; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.18); padding: 2px 6px; border-radius: 6px; }

        .s-btn { padding: 9px 0; border-radius: 11px; border: none; cursor: pointer; font-weight: 900; font-size: 13px; transition: filter .15s ease, transform .12s ease; }
        .s-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .s-btn:active:not(:disabled) { transform: scale(.96); }
        .s-btn-buy { color: #fff; background: var(--rg); box-shadow: inset 0 1px 0 rgba(255,255,255,.22); }
        .s-btn-buy:disabled { background: var(--surface-3); color: var(--text-4); box-shadow: none; cursor: not-allowed; }
        .s-btn-equip { color: #0b1020; background: var(--rc); }
        .s-btn-equip[data-on="true"] { background: var(--surface-3); color: var(--text-2); }

        .s-msg { padding: 10px 14px; border-radius: 12px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3); color: #ef4444; font-size: 13px; font-weight: 700; text-align: center; }
        .s-state { text-align: center; color: var(--text-3); padding: 48px 0; font-weight: 700; }
        .s-foot { font-size: 11px; color: var(--text-3); text-align: center; margin: 6px 0 0; line-height: 1.5; }

        @media (prefers-reduced-motion: reduce) {
          .s-card, .s-card.legendary, .s-featured, .s-token-pill::after, .s-featured-shine, .s-preview.premium::after, .s-preview-av { animation: none !important; }
          .s-card { opacity: 1; }
        }
      `}</style>

      <div className="s-ambient" />

      <header className="s-header">
        <span className="s-title">Store</span>
        <div className="s-token-pill">
          <img src="/token/token.png" alt="" />
          <span>{tokens.toLocaleString()}</span>
        </div>
      </header>

      <div className="s-content">
        {/* Your look preview */}
        <section className="s-myprofile">
          <div className="s-myprofile-label">Your Look</div>
          <div className="s-preview-av" style={avatarFrameStyle(equippedFrameAsset) ?? undefined}>
            <div className="s-preview-av-inner">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : (username[0] ?? "?").toUpperCase()}
            </div>
          </div>
          <div className="s-preview-name" style={nameColorStyle(equippedNameAsset)}>@{username}</div>
        </section>

        {msg && <div className="s-msg">{msg}</div>}

        {loading ? (
          <div className="s-state">Loading…</div>
        ) : !token ? (
          <div className="s-state">Sign in to shop cosmetics.</div>
        ) : catalog.length === 0 ? (
          <div className="s-state">No cosmetics available yet.</div>
        ) : (
          <>
            {featured && (
              <section style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <Featured c={featured} />
              </section>
            )}

            {limited.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <SectionHeader title="Limited Time" />
                <div className="s-grid">{limited.map((c, i) => <Card key={c.id} c={c} i={i} />)}</div>
              </section>
            )}

            {sections.map(([slot, items]) => (
              <section key={slot} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <SectionHeader title={SECTION_TITLE[slot] ?? slot} />
                <div className="s-grid">{items.map((c, i) => <Card key={c.id} c={c} i={i} />)}</div>
              </section>
            ))}
          </>
        )}

        <p className="s-foot">Cosmetics are visual only and never affect gameplay. Foopy Tokens are bought with real money and are non-refundable.</p>
      </div>
    </main>
  );
}
