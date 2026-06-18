// ── Stickers ─────────────────────────────────────────────────────────────────
// Two tiers:
//   • FREE stickers  — files in public/stickers/{name}.png, usable by everyone.
//   • PAID stickers  — files in public/paidstickers/{name}.png, grouped into
//     packs sold in the store. Everyone can SEE a paid sticker once it's posted,
//     but only users who own the pack can SEND it (gated in StickerPicker and
//     enforced server-side by the enforce_paid_stickers trigger — see
//     supabase/paid-stickers.sql).
//
// Sticker shortcodes (:name) are GLOBAL — every name here must be unique across
// both tiers, free and paid.

// Free stickers — public/stickers/{name}.png
export const FREE_STICKER_NAMES = [
  "baldman",
  "bontmicdrop",
  "bradscott",
  "canigetuh",
  "cavemen",
  "choke",
  "cinema",
  "dafoe",
  "dan1",
  "davidrodan",
  "depression",
  "dexteregg",
  "dog",
  "drakeyachty",
  "dusty1",
  "flight1",
  "flight2",
  "flight3",
  "gawn1",
  "harley1",
  "jerry",
  "jezza1",
  "jordancrying",
  "kevinhart1",
  "kevinhart2",
  "kevinjames",
  "kurtangle",
  "lebronscared",
  "linjong",
  "longmuir",
  "me",
  "nas1",
  "nickwatson1",
  "patrick1",
  "phone",
  "rachele1",
  "robot",
  "rodrick",
  "ronaldo1",
  "shaq1",
  "shocked",
  "son",
  "speed1",
  "speed2",
  "stare1",
  "stare2",
  "stare3",
  "stop",
  "talknothink",
  "wedidit",
];

// Back-compat alias — older imports expect STICKER_NAMES to be the free set.
export const STICKER_NAMES = FREE_STICKER_NAMES;

export interface PaidSticker {
  /** Matches the `key` of the cosmetics row sold in the store. */
  key: string;
  /** Display name shown in the store. */
  name: string;
  /** Shortcode + filename: public/paidstickers/{sticker}.png. */
  sticker: string;
}

// ── Paid stickers (sold individually) ─────────────────────────────────────────
// Each paid sticker is its own store item — bought on its own, not in a pack.
// To add one:
//   1. Drop the PNG into public/paidstickers/ (filename = the shortcode name).
//   2. Add an entry here.
//   3. Add a matching cosmetics row + sticker_cosmetics row in
//      supabase/paid-stickers.sql (names MUST match exactly — the SQL drives
//      both the store catalog and the server-side ownership enforcement).
//
// These are EXAMPLES — replace with your real sticker files.
export const PAID_STICKERS: PaidSticker[] = [
  { key: "sticker_legend1", name: "Legend 1", sticker: "legend1" },
  { key: "sticker_legend2", name: "Legend 2", sticker: "legend2" },
  { key: "sticker_legend3", name: "Legend 3", sticker: "legend3" },
  { key: "sticker_legend4", name: "Legend 4", sticker: "legend4" },
  { key: "sticker_legend5", name: "Legend 5", sticker: "legend5" },
];

export const PAID_STICKER_NAMES = PAID_STICKERS.map((s) => s.sticker);

const FREE_SET = new Set(FREE_STICKER_NAMES);
const PAID_SET = new Set(PAID_STICKER_NAMES);

/** Every renderable sticker name (free + paid). Use for rendering, not for gating. */
export const ALL_STICKER_NAMES = [...FREE_STICKER_NAMES, ...PAID_STICKER_NAMES];

/** True for any sticker that should RENDER (everyone sees paid stickers). */
export function isStickerName(name: string) {
  return FREE_SET.has(name) || PAID_SET.has(name);
}

/** True only for paid stickers (those that require buying to send). */
export function isPaidSticker(name: string) {
  return PAID_SET.has(name);
}

export function stickerUrl(name: string) {
  return PAID_SET.has(name) ? `/paidstickers/${name}.png` : `/stickers/${name}.png`;
}

/** The store cosmetic key that unlocks a paid sticker, or undefined if free. */
export function cosmeticKeyForSticker(name: string): string | undefined {
  return PAID_STICKERS.find((s) => s.sticker === name)?.key;
}

/**
 * The set of sticker names a user is allowed to SEND, given the cosmetic keys
 * they own: all free stickers plus every paid sticker they've purchased.
 */
export function usableStickerNames(ownedKeys: Set<string>): Set<string> {
  const usable = new Set(FREE_STICKER_NAMES);
  for (const s of PAID_STICKERS) {
    if (ownedKeys.has(s.key)) usable.add(s.sticker);
  }
  return usable;
}

const RECENT_STICKERS_KEY = "foopy_recent_stickers";
const MAX_RECENT_STICKERS = 12;

export function getRecentStickers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STICKERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === "string" && isStickerName(n));
  } catch {
    return [];
  }
}

export function addRecentSticker(name: string): string[] {
  const next = [name, ...getRecentStickers().filter(n => n !== name)].slice(0, MAX_RECENT_STICKERS);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}
