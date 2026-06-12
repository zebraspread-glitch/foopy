"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";
import { type Cosmetic, type EquippedCosmetics, nameColorStyle, avatarFrameStyle } from "@/app/lib/cosmetics";
import { patternBackground } from "@/app/components/PassCard";
import { getPassLevel, PLAYER_PASS_LEVELS } from "@/app/lib/passes";

// Representative level used to preview pass background patterns in the store.
const PATTERN_PREVIEW_LEVEL = getPassLevel(225, PLAYER_PASS_LEVELS); // Emerald

// Rarity visual identity: label, accent colour, and the gradient used for
// CTA buttons. Kept subtle — accents, not glowing borders.
const RARITY: Record<string, { label: string; color: string; grad: string; tint: string }> = {
  common:    { label: "Common",    color: "#60a5fa", grad: "linear-gradient(135deg,#2563eb,#38bdf8)", tint: "rgba(96,165,250,.08)" },
  rare:      { label: "Rare",      color: "#a78bfa", grad: "linear-gradient(135deg,#7c3aed,#a78bfa)", tint: "rgba(167,139,250,.10)" },
  epic:      { label: "Epic",      color: "#fb923c", grad: "linear-gradient(135deg,#ec4899,#f59e0b)", tint: "rgba(251,146,60,.10)" },
  legendary: { label: "Legendary", color: "#fbbf24", grad: "linear-gradient(135deg,#f59e0b,#fbbf24)", tint: "rgba(251,191,36,.10)" },
};
const rarOf = (c: Cosmetic) => RARITY[c.rarity ?? "common"] ?? RARITY.common;

const SECTION_TITLE: Record<string, string> = {
  name_color: "Name Colours",
  profile_frame: "Profile Rings",
  card_back: "Pass Backgrounds",
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

  const Sample = ({ c, size, boxWidth }: { c: Cosmetic; size: number; boxWidth?: number }) => {
    if (c.slot === "profile_frame") {
      return (
        <div className="s-sample-inner" style={avatarFrameStyle(c.asset, Math.max(2.5, size / 18)) ?? undefined}>
          <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--surface-2)", border: "2px solid var(--bg)" }} />
        </div>
      );
    }
    if (c.slot === "card_back") {
      const w = boxWidth ?? size * 2;
      return (
        <div className="s-sample-inner" style={{ width: w, height: size * 1.6, borderRadius: 10, background: patternBackground(c.asset, PATTERN_PREVIEW_LEVEL), border: "1px solid rgba(255,255,255,.08)" }} />
      );
    }
    const label = `@${username}`;
    const maxFont = size * 0.6;
    // Shrink the font so the username always fits the available width.
    const fitFont = boxWidth ? (boxWidth * 0.9) / (label.length * 0.75) : maxFont;
    const fontSize = Math.max(9, Math.min(maxFont, fitFont));
    return (
      <span
        className="s-sample-inner"
        style={{
          fontSize,
          fontWeight: 800,
          lineHeight: 1,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...nameColorStyle(c.slot === "name_color" ? c.asset : null),
        }}
      >
        {label}
      </span>
    );
  };

  const Price = ({ c, size = 14 }: { c: Cosmetic; size?: number }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <img src="/token/token.png" alt="" style={{ width: size, height: size, objectFit: "contain" }} />
      {c.token_price.toLocaleString()}
    </span>
  );

  const ActionButton = ({ c, large }: { c: Cosmetic; large?: boolean }) => {
    const isOwned = owned.has(c.id);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const canAfford = tokens >= c.token_price;
    const busy = busyKey === c.key;
    const r = rarOf(c);

    if (isOwned) {
      return (
        <button
          className={`s-btn ${isEquipped ? "s-btn-equipped" : "s-btn-owned"}${large ? " s-btn-lg" : ""}`}
          onClick={() => toggleEquip(c)}
          disabled={busy || !c.slot}
        >
          {busy ? "…" : isEquipped ? "Equipped" : "Owned · Equip"}
        </button>
      );
    }
    return (
      <button
        className={`s-btn s-btn-buy${large ? " s-btn-lg" : ""}`}
        style={{ "--rg": r.grad } as CSSProperties}
        onClick={() => buy(c)}
        disabled={busy || !canAfford}
      >
        {busy ? "…" : <>Buy&nbsp;·&nbsp;<Price c={c} size={large ? 16 : 13} /></>}
      </button>
    );
  };

  const Card = ({ c, i }: { c: Cosmetic; i: number }) => {
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const r = rarOf(c);
    return (
      <div
        className={`s-card${isEquipped ? " equipped" : ""}`}
        style={{ "--rc": r.color, "--rtint": r.tint, animationDelay: `${Math.min(i, 12) * 0.035}s` } as CSSProperties}
      >
        <div className="s-preview">
          <Sample c={c} size={30} boxWidth={120} />
          {c.is_limited && <span className="s-limited-tag">Limited</span>}
        </div>
        <div className="s-card-body">
          <div className="s-card-name">{c.name}</div>
          <span className="s-rarity-badge" style={{ color: r.color }}>{r.label}</span>
          <ActionButton c={c} />
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <div className="s-section-head">
      <span>{title}</span>
    </div>
  );

  const Featured = ({ c }: { c: Cosmetic }) => {
    const r = rarOf(c);
    return (
      <div className="s-featured" style={{ "--rg": r.grad } as CSSProperties}>
        <div className="s-featured-inner">
          <div className="s-featured-shine" />
          <span className="s-featured-tag">★ Featured Today</span>
          <div className="s-featured-row" style={{ "--rtint": r.tint } as CSSProperties}>
            <div className="s-featured-art">
              <Sample c={c} size={c.slot === "profile_frame" ? 52 : 46} boxWidth={66} />
            </div>
            <div className="s-featured-meta">
              <div className="s-featured-name">{c.name}</div>
              <span className="s-rarity-badge" style={{ color: r.color }}>{r.label}</span>
              <p className="s-featured-desc">Stand out with an exclusive look for your profile.</p>
            </div>
            <div className="s-featured-action">
              <ActionButton c={c} large />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="s-main">
      <style>{`
        @keyframes sFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sShine { 0% { transform: translateX(-130%); } 60%, 100% { transform: translateX(130%); } }

        .s-main { min-height: 100dvh; background: var(--bg); color: var(--text-1); padding-bottom: calc(90px + env(safe-area-inset-bottom)); position: relative; overflow-x: hidden; }
        .s-ambient { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 150%; height: 420px; pointer-events: none; z-index: 0;
          background: radial-gradient(56% 100% at 50% 0%, rgba(56,189,248,.20), rgba(99,102,241,.08) 46%, transparent 74%); }

        .s-header { position: sticky; top: 0; z-index: 50; height: calc(52px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 16px 0 58px;
          display: flex; align-items: center; justify-content: space-between;
          background: linear-gradient(180deg, rgba(10,10,15,.82), rgba(10,10,15,.30)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        .s-title { font-size: 19px; font-weight: 900; letter-spacing: -.02em; color: var(--text-1); }
        .s-token-pill { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 999px; overflow: hidden;
          background: linear-gradient(135deg,#38bdf8,#6366f1); box-shadow: 0 4px 16px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.35); }
        .s-token-pill img { width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
        .s-token-pill span { font-size: 13.5px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }

        .s-content { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 18px; }

        /* Your Look */
        .s-myprofile { position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.013)); border: 1px solid rgba(255,255,255,.07);
          animation: sFadeUp .4s cubic-bezier(.2,.7,.3,1) both; }
        .s-preview-av-inner { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; background: var(--surface-3); border: 2px solid var(--border-2); display: flex; align-items: center; justify-content: center; color: var(--text-2); font-weight: 800; font-size: 18px; flex-shrink: 0; }
        .s-preview-av-inner img { width: 100%; height: 100%; object-fit: cover; }
        .s-myprofile-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .s-myprofile-name { font-size: 16px; font-weight: 800; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .s-myprofile-sub { font-size: 12px; font-weight: 600; color: var(--text-3); }

        /* Section headers */
        .s-section-head { font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: var(--text-3); padding: 0 2px; margin: 4px 0 -4px; }

        /* Featured hero */
        .s-featured { position: relative; padding: 1.5px; border-radius: 22px; background: linear-gradient(160deg, rgba(99,102,241,.55), rgba(56,189,248,.15) 60%, rgba(99,102,241,.22));
          box-shadow: 0 22px 48px -22px rgba(0,0,0,.7), 0 0 44px -18px rgba(56,189,248,.35);
          animation: sFadeUp .4s cubic-bezier(.2,.7,.3,1) both; }
        .s-featured-inner { position: relative; overflow: hidden; border-radius: 20.5px; background: var(--surface-1); padding: 18px; }
        .s-featured-shine { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,.07) 50%, transparent 62%); transform: translateX(-130%); animation: sShine 6s ease-in-out infinite; }
        .s-featured-tag { position: relative; display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #fff;
          background: var(--rg); padding: 4px 11px; border-radius: 999px; margin-bottom: 14px; box-shadow: 0 5px 14px -5px rgba(99,102,241,.6); }
        .s-featured-row { position: relative; display: flex; align-items: center; gap: 16px; }
        .s-featured-art { width: 78px; height: 78px; flex-shrink: 0; border-radius: 16px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
          background: var(--rtint); border: 1px solid rgba(255,255,255,.06); }
        .s-featured-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .s-featured-name { font-size: 18px; font-weight: 800; color: var(--text-1); letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .s-featured-desc { font-size: 12.5px; color: var(--text-3); font-weight: 600; margin: 1px 0 0; }
        .s-featured-action { flex-shrink: 0; }

        /* Product grid + cards */
        .s-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 10px; }
        .s-card { position: relative; border-radius: 16px; background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012)); border: 1px solid rgba(255,255,255,.06);
          padding: 10px; display: flex; flex-direction: column; gap: 10px;
          animation: sFadeUp .35s cubic-bezier(.2,.7,.3,1) both;
          transition: transform .18s cubic-bezier(.2,.8,.3,1), box-shadow .2s ease, border-color .2s ease; }
        .s-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -16px rgba(0,0,0,.6); border-color: rgba(255,255,255,.12); }
        .s-card:active { transform: translateY(-1px) scale(.99); }
        .s-card.equipped { border-color: var(--rc); }
        .s-preview { position: relative; overflow: hidden; height: 80px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
          background: var(--rtint); }
        .s-sample-inner { position: relative; transition: transform .2s cubic-bezier(.2,.8,.3,1); }
        .s-card:hover .s-sample-inner { transform: scale(1.08); }
        .s-limited-tag { position: absolute; top: 6px; right: 6px; font-size: 8px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #fff; background: rgba(0,0,0,.5); padding: 3px 7px; border-radius: 6px; }
        .s-card-body { display: flex; flex-direction: column; gap: 3px; }
        .s-card-name { font-size: 13px; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .s-rarity-badge { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }

        /* Buttons */
        .s-btn { position: relative; overflow: hidden; padding: 9px 0; border-radius: 11px; border: none; cursor: pointer; font-weight: 800; font-size: 12.5px; transition: filter .15s ease, transform .12s ease, background .15s ease; width: 100%; }
        .s-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .s-btn:active:not(:disabled) { transform: scale(.97); }
        .s-btn-buy { color: #fff; background: var(--rg); box-shadow: inset 0 1px 0 rgba(255,255,255,.22); }
        .s-btn-buy::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%); transform: translateX(-130%); }
        .s-btn-buy:hover:not(:disabled)::after { animation: sShine 1.2s ease-in-out; }
        .s-btn-buy:disabled { background: var(--surface-3); color: var(--text-4); box-shadow: none; cursor: not-allowed; filter: none; }
        .s-btn-buy:disabled::after { display: none; }
        .s-btn-owned { color: var(--text-2); background: var(--surface-3); }
        .s-btn-equipped { color: #60a5fa; background: var(--blue-dim); border: 1px solid rgba(96,165,250,.25); }
        .s-btn-lg { padding: 13px 22px; border-radius: 13px; font-size: 14px; width: auto; min-width: 124px; }

        .s-msg { padding: 10px 14px; border-radius: 12px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3); color: #ef4444; font-size: 13px; font-weight: 700; text-align: center; }
        .s-state { text-align: center; color: var(--text-3); padding: 48px 0; font-weight: 700; }
        .s-foot { font-size: 11px; color: var(--text-3); text-align: center; margin: 0; padding: 6px 0 18px; line-height: 1.5; }

        @media (max-width: 420px) {
          .s-featured-row { flex-wrap: wrap; }
          .s-featured-action { width: 100%; }
          .s-btn-lg { width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .s-card, .s-myprofile, .s-featured, .s-featured-shine, .s-btn-buy::after { animation: none !important; }
          .s-card { opacity: 1; }
        }
      `}</style>

      <div className="s-ambient" />

      <header className="s-header">
        <span className="s-title">Store</span>
        <div className="s-token-pill" suppressHydrationWarning>
          <img src="/token/token.png" alt="" />
          <span>{tokens.toLocaleString()}</span>
        </div>
      </header>

      <div className="s-content">
        {/* Your look preview */}
        <section className="s-myprofile">
          <div className="s-preview-av-inner" style={avatarFrameStyle(equippedFrameAsset) ?? undefined}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : (username[0] ?? "?").toUpperCase()}
          </div>
          <div className="s-myprofile-text">
            <div className="s-myprofile-name" style={nameColorStyle(equippedNameAsset)}>@{username}</div>
            <span className="s-myprofile-sub">Customize your identity</span>
          </div>
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
