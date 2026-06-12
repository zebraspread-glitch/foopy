"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type TokenPack = {
  id: string;
  tokens: number;
  bonus: number;       // marketing "bonus" badge (0 = no badge)
  price: string;
  img: string;         // stacked-coin artwork
  tag?: string;        // "Best Value"
  grad: string;        // button gradient
};

const FEATURED: TokenPack = {
  id: "ultimate", tokens: 7000, bonus: 50, price: "$79.99", img: "/token/stack-7000.png", tag: "Best Value",
  grad: "linear-gradient(100deg,#6366f1,#db2777,#f59e0b)",
};

const PACKS: TokenPack[] = [
  { id: "starter", tokens: 100,  bonus: 0,  price: "$1.99",  img: "/token/stack-100.png",  grad: "linear-gradient(135deg,#2563eb,#60a5fa)" },
  { id: "value",   tokens: 500,  bonus: 20, price: "$7.99",  img: "/token/stack-500.png",  grad: "linear-gradient(135deg,#2563eb,#60a5fa)" },
  { id: "popular", tokens: 1200, bonus: 30, price: "$16.99", img: "/token/stack-1200.png", grad: "linear-gradient(135deg,#2563eb,#60a5fa)" },
];

export default function TokensPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("tokens").eq("id", session.user.id).single();
      setTokens(data?.tokens ?? 0);
      setLoading(false);
    })();
  }, []);

  function buy(pack: TokenPack) {
    setMsg(`Token purchases are coming soon! (${pack.tokens.toLocaleString()} tokens for ${pack.price})`);
  }

  return (
    <main className="tk-main">
      <style>{`
        @keyframes tkFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tkFloat { 0%, 100% { transform: translateY(-50%); } 50% { transform: translateY(calc(-50% - 6px)); } }
        @keyframes tkCoinBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes tkPulse { 0%, 100% { opacity: .55; } 50% { opacity: .9; } }

        .tk-main { min-height: 100dvh; background: var(--bg); color: var(--text-1); padding-bottom: calc(90px + env(safe-area-inset-bottom)); position: relative; overflow-x: hidden; }
        .tk-ambient { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 150%; height: 420px; pointer-events: none; z-index: 0;
          background: radial-gradient(56% 100% at 50% 0%, rgba(56,189,248,.26), rgba(99,102,241,.10) 46%, transparent 74%); }

        .tk-header { position: sticky; top: 0; z-index: 50; height: calc(52px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 14px 0 14px;
          display: flex; align-items: center; gap: 10px; justify-content: space-between;
          background: linear-gradient(180deg, rgba(10,10,15,.82), rgba(10,10,15,.30)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        .tk-back { background: none; border: none; color: var(--text-2); cursor: pointer; padding: 6px; margin: -6px; display: flex; border-radius: 10px; transition: background .15s ease; }
        .tk-back:hover { background: rgba(255,255,255,.07); }
        .tk-title { position: absolute; left: 50%; transform: translateX(-50%); font-size: 17px; font-weight: 900; letter-spacing: -.02em; }
        .tk-pill { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 999px; overflow: hidden;
          background: linear-gradient(135deg,#38bdf8,#6366f1); box-shadow: 0 4px 16px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.35); }
        .tk-pill img { width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
        .tk-pill span { font-size: 13.5px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }

        .tk-content { position: relative; z-index: 1; max-width: 560px; margin: 0 auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 14px; }

        /* Balance hero */
        .tk-hero { position: relative; overflow: hidden; display: flex; align-items: center; gap: 18px; padding: 22px 24px; border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.014)); border: 1px solid rgba(255,255,255,.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06); animation: tkFadeUp .5s cubic-bezier(.2,.7,.3,1) both; }
        .tk-hero-mark { position: absolute; right: 18px; top: 50%; transform: translateY(-50%) rotate(-16deg); width: 150px; height: auto; color: #fff; opacity: .055; pointer-events: none; }
        .tk-hero-coin { position: relative; width: 64px; height: 64px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .tk-hero-coin::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; background: radial-gradient(circle, rgba(56,189,248,.5), transparent 68%); }
        .tk-hero-coin img { position: relative; width: 60px; height: 60px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(56,189,248,.5)); animation: tkCoinBob 3.6s ease-in-out infinite; }
        .tk-hero-meta { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .tk-hero-label { font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: var(--text-3); }
        .tk-hero-value { font-size: 40px; font-weight: 1000; letter-spacing: -.03em; line-height: 1; }
        .tk-hero-sub { font-size: 13px; font-weight: 700; color: var(--text-3); }

        .tk-msg { padding: 11px 14px; border-radius: 13px; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.32); color: #7dd3fc; font-size: 13px; font-weight: 800; text-align: center; animation: tkFadeUp .35s ease both; }

        .tk-section-label { font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: var(--text-3); padding: 0 2px; margin: 4px 0 -2px; }

        /* Featured best-value pack */
        .tk-feat { position: relative; padding: 1.5px; border-radius: 24px; background: linear-gradient(160deg, rgba(99,102,241,.6), rgba(56,189,248,.18) 60%, rgba(99,102,241,.25));
          box-shadow: 0 26px 60px -22px rgba(0,0,0,.75), 0 0 56px -18px rgba(56,189,248,.42); animation: tkFadeUp .5s cubic-bezier(.2,.7,.3,1) both; }
        .tk-feat-inner { position: relative; overflow: hidden; border-radius: 22.5px; background: linear-gradient(135deg,#141a2b,#0b0d15); padding: 22px; min-height: 206px; display: flex; align-items: center; }
        .tk-feat-glow { position: absolute; right: 2%; top: 50%; transform: translateY(-50%); width: 74%; height: 104%; pointer-events: none;
          background: radial-gradient(circle at 62% 50%, rgba(56,189,248,.5), rgba(99,102,241,.2) 44%, transparent 68%); animation: tkPulse 4.5s ease-in-out infinite; }
        .tk-feat-art { position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 53%; max-width: 290px; z-index: 1; animation: tkFloat 4.5s ease-in-out infinite; }
        .tk-feat-art img { width: 100%; height: auto; max-height: 220px; object-fit: contain; filter: drop-shadow(0 14px 26px rgba(0,0,0,.5)); }
        .tk-feat-meta { position: relative; z-index: 2; max-width: 50%; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
        .tk-feat-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: #fff;
          background: var(--rg); padding: 5px 13px; border-radius: 999px; box-shadow: 0 5px 16px -5px rgba(219,39,119,.7); }
        .tk-feat-amt { font-size: 34px; font-weight: 1000; letter-spacing: -.03em; color: #fff; line-height: 1.02; margin-top: 4px; }
        .tk-feat-amt small { display: block; font-size: 16px; font-weight: 800; color: var(--text-2); letter-spacing: 0; margin-top: 1px; }
        .tk-feat-bonus { font-size: 14px; font-weight: 900; color: #4f9bff; }
        .tk-feat-buy { margin-top: 10px; padding: 12px 30px; border-radius: 14px; border: none; cursor: pointer; font-size: 17px; font-weight: 900; color: #fff;
          background: var(--rg); box-shadow: 0 10px 24px -8px rgba(219,39,119,.6), inset 0 1px 0 rgba(255,255,255,.3); transition: filter .15s ease, transform .12s ease; }
        .tk-feat-buy:hover { filter: brightness(1.08); }
        .tk-feat-buy:active { transform: scale(.96); }

        /* Standard pack rows */
        .tk-row { position: relative; border-radius: 18px; animation: tkFadeUp .5s cubic-bezier(.2,.7,.3,1) both; transition: transform .18s ease, box-shadow .25s ease; }
        .tk-row:hover { transform: translateY(-3px); box-shadow: 0 16px 30px -16px rgba(0,0,0,.55); }
        .tk-row-inner { position: relative; overflow: hidden; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.013)); border: 1px solid rgba(255,255,255,.07);
          padding: 12px 16px; display: flex; align-items: center; gap: 14px; }
        .tk-row-art { width: 70px; height: 58px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .tk-row-art img { max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,.45)); }
        .tk-row-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
        .tk-row-amt { font-size: 20px; font-weight: 1000; letter-spacing: -.02em; }
        .tk-row-amt small { font-size: 13px; font-weight: 800; color: var(--text-3); margin-left: 6px; }
        .tk-row-bonus { font-size: 12px; font-weight: 900; color: #5b9bff; }
        .tk-row-buy { flex-shrink: 0; padding: 12px 24px; border-radius: 13px; border: none; cursor: pointer; font-size: 15px; font-weight: 900; color: #fff;
          background: var(--rg); box-shadow: inset 0 1px 0 rgba(255,255,255,.22); transition: filter .15s ease, transform .12s ease; }
        .tk-row-buy:hover { filter: brightness(1.1); }
        .tk-row-buy:active { transform: scale(.96); }

        .tk-foot { font-size: 12px; color: var(--text-3); text-align: center; margin: 8px 0 0; line-height: 1.6; }
        .tk-foot a { color: var(--text-2); font-weight: 800; }

        @media (prefers-reduced-motion: reduce) {
          .tk-hero, .tk-feat, .tk-row, .tk-feat-art, .tk-hero-coin img, .tk-feat-glow { animation: none !important; }
          .tk-feat-art { transform: translateY(-50%); }
          .tk-row, .tk-hero { opacity: 1; }
        }
      `}</style>

      <div className="tk-ambient" />

      <header className="tk-header">
        <button className="tk-back" onClick={() => router.back()} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="tk-title">Get Tokens</span>
        <div className="tk-pill">
          <img src="/token/token.png" alt="" />
          <span>{tokens.toLocaleString()}</span>
        </div>
      </header>

      <div className="tk-content">
        <section className="tk-hero">
          {/* faint football watermark */}
          <svg className="tk-hero-mark" viewBox="0 0 140 90" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
            <ellipse cx="70" cy="45" rx="62" ry="36" />
            <line x1="34" y1="45" x2="106" y2="45" />
            <line x1="50" y1="36" x2="50" y2="54" />
            <line x1="62" y1="35" x2="62" y2="55" />
            <line x1="78" y1="35" x2="78" y2="55" />
            <line x1="90" y1="36" x2="90" y2="54" />
          </svg>
          <div className="tk-hero-coin"><img src="/token/token.png" alt="" /></div>
          <div className="tk-hero-meta">
            <span className="tk-hero-label">Your Balance</span>
            <span className="tk-hero-value">{loading ? "…" : tokens.toLocaleString()}</span>
            <span className="tk-hero-sub">Foopy Tokens</span>
          </div>
        </section>

        {msg && <div className="tk-msg">{msg}</div>}

        {/* Featured best value */}
        <section className="tk-feat" style={{ "--rg": FEATURED.grad } as CSSProperties}>
          <div className="tk-feat-inner">
            <div className="tk-feat-glow" />
            <div className="tk-feat-art"><img src={FEATURED.img} alt="" /></div>
            <div className="tk-feat-meta">
              {FEATURED.tag && <span className="tk-feat-tag">★ {FEATURED.tag}</span>}
              <div className="tk-feat-amt">{FEATURED.tokens.toLocaleString()}<small>Tokens</small></div>
              <div className="tk-feat-bonus">+{FEATURED.bonus}% bonus</div>
              <button className="tk-feat-buy" onClick={() => buy(FEATURED)}>{FEATURED.price}</button>
            </div>
          </div>
        </section>

        <div className="tk-section-label">Token Packs</div>

        {PACKS.map((p, i) => (
          <div
            key={p.id}
            className="tk-row"
            style={{ "--rg": p.grad, animationDelay: `${i * 0.05}s` } as CSSProperties}
          >
            <div className="tk-row-inner">
              <div className="tk-row-art"><img src={p.img} alt="" /></div>
              <div className="tk-row-meta">
                <div className="tk-row-amt">{p.tokens.toLocaleString()}<small>Tokens</small></div>
                {p.bonus > 0 && <div className="tk-row-bonus">+{p.bonus}% bonus</div>}
              </div>
              <button className="tk-row-buy" onClick={() => buy(p)}>{p.price}</button>
            </div>
          </div>
        ))}

        <p className="tk-foot">
          Tokens are spent on cosmetics in the <a href="/store">Store</a> and never affect gameplay.<br />
          Purchases are processed securely and are non-refundable.
        </p>
      </div>
    </main>
  );
}
