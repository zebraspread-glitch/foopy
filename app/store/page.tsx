"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";
import { type Cosmetic, type EquippedCosmetics, nameColorStyle, avatarFrameStyle } from "@/app/lib/cosmetics";
import { patternBackground } from "@/app/components/PassCard";
import { StoreItemSkeleton } from "@/app/components/Skeleton";
import { getPassLevel, PLAYER_PASS_LEVELS } from "@/app/lib/passes";

const PATTERN_PREVIEW_LEVEL = getPassLevel(375, PLAYER_PASS_LEVELS);

const RARITY: Record<string, { label: string; color: string; grad: string; tint: string }> = {
  common:    { label: "Common",    color: "#9ca3af", grad: "linear-gradient(135deg,#6b7280,#9ca3af)", tint: "rgba(156,163,175,0.16)" },
  rare:      { label: "Rare",      color: "#38bdf8", grad: "linear-gradient(135deg,#2563eb,#38bdf8)", tint: "rgba(56,189,248,0.15)" },
  epic:      { label: "Epic",      color: "#d946ef", grad: "linear-gradient(135deg,#7c3aed,#d946ef)", tint: "rgba(217,70,239,0.15)" },
  legendary: { label: "Legendary", color: "#facc15", grad: "linear-gradient(135deg,#f59e0b,#facc15)", tint: "rgba(250,204,21,0.16)" },
};

const RARITY_WEIGHT: Record<string, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

const SECTION_TITLE: Record<string, string> = {
  profile_frame: "Profile Rings",
  profile_banner: "Banners",
  profile_background: "Banners",
  name_color: "Name Colours",
  card_back: "Pass Backgrounds",
  name_effect: "Name Effects",
  badge: "Badges",
  chat_bubble: "Chat Bubbles",
  reaction_effect: "Reactions",
  feed_flair: "Feed Flair",
};

const SECTION_ORDER = [
  "profile_frame",
  "profile_banner",
  "profile_background",
  "name_color",
  "card_back",
  "badge",
  "name_effect",
  "chat_bubble",
  "reaction_effect",
  "feed_flair",
];

const sectionId = (slot: string) => `store-section-${slot.replace(/[^a-z0-9_-]/gi, "-")}`;
const rarityOf = (c: Cosmetic) => RARITY[c.rarity ?? "common"] ?? RARITY.common;

export default function StorePage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("You");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [catalog, setCatalog] = useState<Cosmetic[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<EquippedCosmetics>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { load(); }, []);

  async function buy(c: Cosmetic) {
    if (!token || busyKey) return;
    setBusyKey(c.key);
    setMsg(null);
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
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleEquip(c: Cosmetic) {
    if (!token || busyKey || !c.slot) return;
    const isEquipped = equipped[c.slot] === c.id;
    setBusyKey(c.key);
    setMsg(null);
    try {
      const res = await fetch("/api/cosmetics/equip", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cosmetic_id: c.id, equip: !isEquipped }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setMsg(data?.error ?? "Failed"); return; }
      setEquipped(data.equipped ?? {});
    } finally {
      setBusyKey(null);
    }
  }

  const equippedNameAsset = useMemo(() => {
    const id = equipped.name_color;
    return id ? (catalog.find(c => c.id === id)?.asset ?? null) : null;
  }, [equipped, catalog]);

  const equippedFrameAsset = useMemo(() => {
    const id = equipped.profile_frame;
    return id ? (catalog.find(c => c.id === id)?.asset ?? null) : null;
  }, [equipped, catalog]);

  const featured = useMemo(() => {
    return [...catalog].sort((a, b) => {
      const rarityDiff = (RARITY_WEIGHT[b.rarity ?? "common"] ?? 0) - (RARITY_WEIGHT[a.rarity ?? "common"] ?? 0);
      if (rarityDiff) return rarityDiff;
      return (b.token_price ?? 0) - (a.token_price ?? 0);
    })[0] ?? null;
  }, [catalog]);

  const sections = useMemo(() => {
    const map = new Map<string, Cosmetic[]>();
    for (const c of catalog) {
      const key = c.slot ?? c.category;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }

    return [...map.entries()]
      .map(([slot, items]) => [
        slot,
        [...items].sort((a, b) => {
          const rarityDiff = (RARITY_WEIGHT[b.rarity ?? "common"] ?? 0) - (RARITY_WEIGHT[a.rarity ?? "common"] ?? 0);
          if (rarityDiff) return rarityDiff;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        }),
      ] as [string, Cosmetic[]])
      .sort(([a], [b]) => {
        const ai = SECTION_ORDER.indexOf(a);
        const bi = SECTION_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [catalog]);

  useEffect(() => {
    if (!activeSlot && sections.length) setActiveSlot(sections[0][0]);
  }, [activeSlot, sections]);

  const ownedCount = useMemo(() => catalog.filter(c => owned.has(c.id)).length, [catalog, owned]);

  function jumpToSection(slot: string) {
    setActiveSlot(slot);
    document.getElementById(sectionId(slot))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleExpanded(slot: string) {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  const Sample = ({ c, size, boxWidth, featured: isFeatured = false }: { c: Cosmetic; size: number; boxWidth?: number; featured?: boolean }) => {
    const r = rarityOf(c);
    const asset = c.asset ?? "linear-gradient(135deg,#334155,#111827)";

    if (c.slot === "profile_frame") {
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            padding: Math.max(3, Math.round(size * 0.055)),
            background: asset,
            boxShadow: `0 0 ${isFeatured ? 42 : 26}px ${r.color}66, inset 0 0 12px rgba(255,255,255,0.28)`,
          }}
        >
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--bg)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }} />
        </div>
      );
    }

    if (c.slot === "card_back") {
      const w = boxWidth ?? size * 2.25;
      return (
        <div
          style={{
            width: w,
            height: size,
            borderRadius: isFeatured ? 26 : 12,
            background: patternBackground(c.asset, PATTERN_PREVIEW_LEVEL),
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: isFeatured ? "0 24px 70px -30px rgba(59,130,246,0.85)" : "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        />
      );
    }

    if (c.slot === "profile_banner" || c.slot === "profile_background") {
      const w = boxWidth ?? size * 2.4;
      return (
        <div
          style={{
            width: w,
            height: size,
            borderRadius: isFeatured ? 24 : 12,
            background: asset,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: isFeatured ? `0 24px 70px -32px ${r.color}` : "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        />
      );
    }

    const label = `@${username}`;
    const maxFont = size * 0.38;
    const fitFont = boxWidth ? (boxWidth * 0.9) / (label.length * 0.65) : maxFont;
    const fontSize = Math.max(16, Math.min(maxFont, fitFont));
    return (
      <span
        style={{
          fontSize,
          fontWeight: 950,
          lineHeight: 1,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          letterSpacing: "-0.03em",
          ...nameColorStyle(c.slot === "name_color" ? c.asset : null),
        }}
      >
        {label}
      </span>
    );
  };

  const TokenPrice = ({ c, size = 15 }: { c: Cosmetic; size?: number }) => (
    <span className="store-price">
      <img src="/token/token.png" alt="" style={{ width: size, height: size }} />
      <span>{c.token_price.toLocaleString()}</span>
    </span>
  );

  const FeaturedAction = ({ c }: { c: Cosmetic }) => {
    const isOwned = owned.has(c.id);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const canAfford = tokens >= c.token_price;
    const busy = busyKey === c.key;

    if (isOwned) {
      if (c.slot === "card_back") return <button className="store-buy featured-owned" disabled>Owned</button>;
      return (
        <button className="store-buy featured-owned" onClick={() => toggleEquip(c)} disabled={busy || !c.slot}>
          {busy ? "..." : isEquipped ? "Equipped" : "Equip"}
        </button>
      );
    }

    return (
      <button className="store-buy" onClick={() => buy(c)} disabled={busy || !canAfford}>
        {busy ? "..." : <>Buy <TokenPrice c={c} size={16} /></>}
      </button>
    );
  };

  const CardAction = ({ c }: { c: Cosmetic }) => {
    const isOwned = owned.has(c.id);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    const canAfford = tokens >= c.token_price;
    const busy = busyKey === c.key;

    if (isOwned) {
      if (c.slot === "card_back") return <button className="store-card-action owned" disabled>Owned</button>;
      return (
        <button className={`store-card-action${isEquipped ? " equipped" : ""}`} onClick={() => toggleEquip(c)} disabled={busy || !c.slot}>
          {busy ? "..." : isEquipped ? "Equipped" : "Equip"}
        </button>
      );
    }

    return (
      <button className="store-card-action" onClick={() => buy(c)} disabled={busy || !canAfford}>
        {busy ? "..." : <TokenPrice c={c} size={15} />}
      </button>
    );
  };

  const ProductCard = ({ c }: { c: Cosmetic }) => {
    const r = rarityOf(c);
    const isEquipped = c.slot ? equipped[c.slot] === c.id : false;
    return (
      <article className={`store-product${isEquipped ? " equipped" : ""}`}>
        <div className="store-product-preview">
          <Sample c={c} size={c.slot === "profile_frame" ? 88 : 50} boxWidth={128} />
          <span className="store-badge" style={{ color: r.color, background: r.tint }}>{r.label}</span>
        </div>
        <div className="store-product-name">{c.name}</div>
        <CardAction c={c} />
      </article>
    );
  };

  const Shelf = ({ slot, items }: { slot: string; items: Cosmetic[] }) => {
    const isExpanded = expandedSlots.has(slot);
    const shown = isExpanded ? items : items.slice(0, 4);
    return (
      <section id={sectionId(slot)} className="store-section">
        <div className="store-section-head">
          <h2>{SECTION_TITLE[slot] ?? slot}</h2>
          {items.length > 4 && (
            <button type="button" onClick={() => toggleExpanded(slot)}>
              {isExpanded ? "Show less" : "View all"}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="store-grid">
          {shown.map(c => <ProductCard key={c.id} c={c} />)}
        </div>
      </section>
    );
  };

  return (
    <main className="store-page page-enter">
      <style>{`
        .store-page {
          min-height: 100dvh;
          background:
            radial-gradient(80% 55% at 50% -15%, rgba(37,99,235,0.14), transparent 68%),
            radial-gradient(50% 42% at 100% 10%, rgba(236,72,153,0.08), transparent 65%),
            var(--bg);
          color: var(--text-1);
          padding-bottom: calc(var(--nav-h) + 22px);
        }

        .store-wrap {
          width: min(100%, 980px);
          margin: 0 auto;
          padding: calc(env(safe-area-inset-top) + 22px) 24px 18px;
        }

        .store-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
        }

        .store-kicker h1 {
          margin: 0;
          font-size: 34px;
          line-height: 0.95;
          font-weight: 1000;
          letter-spacing: -0.05em;
        }

        .store-kicker p {
          margin: 7px 0 0;
          color: rgba(203,213,225,0.78);
          font-size: 15px;
          line-height: 1.25;
          font-weight: 600;
        }

        .store-user {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .store-balance {
          height: 48px;
          min-width: 126px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.035);
          color: #38bdf8;
          font-size: 18px;
          font-weight: 950;
          font-variant-numeric: tabular-nums;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }

        .store-balance img,
        .store-price img {
          object-fit: contain;
          flex-shrink: 0;
        }

        .store-avatar-ring {
          border-radius: 50%;
          flex-shrink: 0;
        }

        .store-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg,#ec4899,#f472b6);
          border: 1px solid rgba(255,255,255,0.18);
          color: #fff;
          font-size: 20px;
          font-weight: 950;
        }

        .store-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .store-message,
        .store-state,
        .store-lock {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.035);
          border-radius: 18px;
        }

        .store-message {
          margin-bottom: 22px;
          padding: 13px 16px;
          color: #fca5a5;
          font-size: 14px;
          font-weight: 800;
        }

        .store-state {
          padding: 64px 22px;
          text-align: center;
          color: rgba(203,213,225,0.72);
          font-size: 15px;
          font-weight: 800;
        }

        .store-feature {
          position: relative;
          padding: 2px;
          border-radius: 22px;
          background: linear-gradient(115deg,#f472b6 0%,#8b5cf6 38%,#38bdf8 63%,#facc15 100%);
          margin-bottom: 28px;
          overflow: hidden;
        }

        .store-feature-inner {
          position: relative;
          overflow: hidden;
          min-height: 220px;
          border-radius: 20px;
          background:
            radial-gradient(85% 120% at 76% 35%, rgba(37,99,235,0.18), transparent 60%),
            linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
            #050506;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(210px, 270px);
          align-items: center;
          gap: 28px;
          padding: 22px 32px;
        }

        .store-feature-copy {
          min-width: 0;
        }

        .store-feature-tag {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 16px;
          padding: 6px 11px;
          border-radius: 0 10px 10px 0;
          background: linear-gradient(135deg, rgba(124,58,237,0.75), rgba(88,28,135,0.85));
          color: #fff;
          font-size: 11px;
          line-height: 1;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: -0.01em;
        }

        .store-feature-name {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -0.05em;
        }

        .store-feature-rarity {
          display: block;
          margin-top: 7px;
          font-size: 12px;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .store-feature-desc {
          margin: 14px 0 20px;
          max-width: 320px;
          color: rgba(203,213,225,0.78);
          font-size: 14px;
          line-height: 1.45;
          font-weight: 600;
        }

        .store-buy {
          min-width: 138px;
          height: 44px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg,#fbbf24,#f59e0b);
          color: #050506;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 1000;
          cursor: pointer;
          box-shadow: 0 18px 44px -26px rgba(251,191,36,0.9), inset 0 1px 0 rgba(255,255,255,0.35);
        }

        .store-buy:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .featured-owned {
          background: rgba(255,255,255,0.08);
          color: #e5e7eb;
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: none;
        }

        .store-feature-art {
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .store-dots {
          position: absolute;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
        }

        .store-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
        }

        .store-dots span:first-child {
          background: #fff;
        }

        .store-tabs {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          scrollbar-width: none;
          padding: 0 0 22px;
          margin-bottom: 2px;
        }

        .store-tabs::-webkit-scrollbar {
          display: none;
        }

        .store-tab {
          flex-shrink: 0;
          min-height: 42px;
          padding: 0 18px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.14);
          background: transparent;
          color: rgba(203,213,225,0.82);
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .store-tab.active {
          border-color: transparent;
          color: #fff;
          background: linear-gradient(135deg,#3b82f6,#4338ca);
          box-shadow: 0 18px 42px -26px rgba(59,130,246,0.95);
        }

        .store-section {
          scroll-margin-top: 18px;
          margin-bottom: 30px;
        }

        .store-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 14px;
        }

        .store-section-head h2 {
          margin: 0;
          font-size: 22px;
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -0.04em;
        }

        .store-section-head button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
          color: #c084fc;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          padding: 6px 0;
          white-space: nowrap;
        }

        .store-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .store-product {
          min-width: 0;
          min-height: 190px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.16);
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012));
          padding: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .store-product.equipped {
          border-color: rgba(56,189,248,0.55);
          box-shadow: 0 0 0 1px rgba(56,189,248,0.18), 0 22px 60px -45px rgba(56,189,248,0.75);
        }

        @media (hover: hover) {
          .store-product:hover {
            transform: translateY(-3px);
            border-color: rgba(255,255,255,0.26);
          }
        }

        .store-product-preview {
          position: relative;
          height: 105px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }

        .store-badge {
          position: absolute;
          top: -3px;
          left: -1px;
          padding: 4px 7px;
          border-radius: 7px;
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .store-product-name {
          min-width: 0;
          margin-top: auto;
          color: #fff;
          font-size: 14px;
          line-height: 1.15;
          font-weight: 950;
          letter-spacing: -0.03em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .store-card-action {
          width: fit-content;
          margin-top: 10px;
          border: none;
          background: transparent;
          color: #38bdf8;
          font-size: 15px;
          font-weight: 1000;
          padding: 0;
          cursor: pointer;
        }

        .store-card-action:disabled {
          cursor: default;
        }

        .store-card-action.owned {
          color: rgba(148,163,184,0.44);
        }

        .store-card-action.equipped {
          color: #facc15;
        }

        .store-card-action:not(.owned):disabled {
          color: rgba(56,189,248,0.42);
        }

        .store-price {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-variant-numeric: tabular-nums;
        }

        .store-lock {
          min-height: 60px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 20px;
          color: rgba(203,213,225,0.72);
          font-size: 14px;
          font-weight: 700;
        }

        .store-lock svg {
          color: rgba(203,213,225,0.48);
          flex-shrink: 0;
        }

        .store-foot {
          margin: 14px 0 0;
          color: rgba(148,163,184,0.65);
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
        }

        @media (max-width: 860px) {
          .store-wrap {
            padding: calc(env(safe-area-inset-top) + 18px) 16px 16px;
          }

          .store-top {
            margin-bottom: 18px;
          }

          .store-kicker h1 {
            font-size: 30px;
          }

          .store-kicker p {
            font-size: 14px;
          }

          .store-user {
            gap: 14px;
          }

          .store-balance {
            height: 44px;
            min-width: 100px;
            padding: 0 12px;
            border-radius: 14px;
            font-size: 15px;
          }

          .store-avatar {
            width: 44px;
            height: 44px;
          }

          .store-feature-inner {
            min-height: 0;
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 18px 18px 42px;
          }

          .store-feature-art {
            order: -1;
            min-height: 118px;
          }

          .store-feature-name {
            font-size: 24px;
          }

          .store-feature-desc {
            font-size: 14px;
            margin: 12px 0 18px;
          }

          .store-buy {
            width: 100%;
          }

          .store-tabs {
            gap: 8px;
            padding-bottom: 18px;
          }

          .store-tab {
            min-height: 38px;
            padding: 0 16px;
            border-radius: 14px;
            font-size: 12px;
          }

          .store-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .store-product {
            min-height: 164px;
            padding: 10px;
          }

          .store-product-preview {
            height: 92px;
          }
        }

        @media (max-width: 520px) {
          .store-top {
            align-items: center;
          }

          .store-user {
            gap: 10px;
          }

          .store-balance {
            min-width: 90px;
            height: 42px;
            padding: 0 10px;
            font-size: 14px;
            border-radius: 13px;
          }

          .store-avatar {
            width: 42px;
            height: 42px;
          }

          .store-section-head h2 {
            font-size: 21px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .store-product,
          .store-tab {
            transition: none;
          }
        }
      `}</style>

      <div className="store-wrap">
        <header className="store-top">
          <div className="store-kicker">
            <h1>Store</h1>
            <p>Customize your profile. Stand out.</p>
          </div>

          <div className="store-user">
            {mounted ? (
              <>
                <div className="store-balance">
                  <img src="/token/token.png" alt="" width="22" height="22" suppressHydrationWarning />
                  <span>{tokens.toLocaleString()}</span>
                </div>
                <div className="store-avatar-ring" style={avatarFrameStyle(equippedFrameAsset, 3) ?? undefined}>
                  <div className="store-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : (username[0] ?? "?").toUpperCase()}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="store-balance" />
                <div className="store-avatar" />
              </>
            )}
          </div>
        </header>

        {msg && <div className="store-message">{msg}</div>}

        {loading ? (
          <StoreItemSkeleton count={8} />
        ) : !token ? (
          <div className="store-state">Sign in to shop cosmetics.</div>
        ) : catalog.length === 0 ? (
          <div className="store-state">No cosmetics available yet.</div>
        ) : (
          <>
            {featured && (
              <section className="store-feature">
                <div className="store-feature-inner">
                  <div className="store-feature-copy">
                    <span className="store-feature-tag">Featured</span>
                    <h2 className="store-feature-name">{featured.name}</h2>
                    <span className="store-feature-rarity" style={{ color: rarityOf(featured).color }}>{rarityOf(featured).label}</span>
                    <p className="store-feature-desc">{featured.description || "Stand out with an exclusive look for your profile."}</p>
                    <FeaturedAction c={featured} />
                  </div>

                  <div className="store-feature-art">
                    <Sample
                      c={featured}
                      featured
                      size={featured.slot === "profile_frame" ? 120 : 145}
                      boxWidth={featured.slot === "profile_frame" ? 120 : 210}
                    />
                  </div>

                  <div className="store-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </section>
            )}

            {sections.length > 0 && (
              <nav className="store-tabs" aria-label="Store categories">
                {sections.map(([slot]) => (
                  <button
                    key={slot}
                    className={`store-tab${slot === activeSlot ? " active" : ""}`}
                    type="button"
                    onClick={() => jumpToSection(slot)}
                  >
                    {SECTION_TITLE[slot] ?? slot}
                  </button>
                ))}
              </nav>
            )}

            {sections.map(([slot, items]) => <Shelf key={slot} slot={slot} items={items} />)}

            <div className="store-lock">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>More cosmetics coming soon.</span>
            </div>

            <p className="store-foot">
              {ownedCount > 0 ? `${ownedCount} cosmetic${ownedCount === 1 ? "" : "s"} owned. ` : ""}
              Foopy Tokens are spent on cosmetics only and never affect gameplay.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
