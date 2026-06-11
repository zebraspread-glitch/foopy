// Shared types + helpers for Foopy Tokens (premium currency) and cosmetics.
// Foopy Tokens are bought with real money (Apple IAP) and spent ONLY on
// cosmetics — purely visual items that never affect gameplay.

import type { CSSProperties } from "react";

export type CosmeticCategory = "profile" | "card" | "app" | "social";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

// Equip slots — one active cosmetic per slot at a time. A catalog item with a
// `null` slot is an owned-only unlock (e.g. a sticker pack) with no single
// equipped state.
export type CosmeticSlot =
  // profile
  | "profile_frame"
  | "profile_banner"
  | "profile_background"
  | "name_color"
  | "name_effect"
  | "badge"
  // card
  | "card_back"
  | "card_foil"
  | "card_frame"
  // app & ui
  | "app_icon"
  | "ui_theme"
  | "accent_color"
  // social
  | "chat_bubble"
  | "reaction_effect"
  | "feed_flair";

export interface Cosmetic {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: CosmeticCategory;
  slot: CosmeticSlot | null;
  token_price: number;
  asset: string | null;
  rarity: CosmeticRarity | null;
  is_active: boolean;
  is_limited: boolean;
  available_from: string | null;
  available_until: string | null;
  sort_order: number;
  created_at: string;
}

export interface UserCosmetic {
  id: string;
  user_id: string;
  cosmetic_id: string;
  acquired_at: string;
}

/** Map of equip slot -> owned cosmetic id, stored on profiles.equipped_cosmetics. */
export type EquippedCosmetics = Partial<Record<CosmeticSlot, string>>;

export type TokenReason = "purchase" | "grant" | "spend" | "refund" | "admin";

export interface TokenTransaction {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number | null;
  reason: TokenReason;
  reference: string | null;
  created_at: string;
}

/** True if a catalog cosmetic is currently buyable (active + within its availability window). */
export function isCosmeticAvailable(c: Pick<Cosmetic, "is_active" | "available_from" | "available_until">, now: Date = new Date()): boolean {
  if (!c.is_active) return false;
  if (c.available_from && new Date(c.available_from) > now) return false;
  if (c.available_until && new Date(c.available_until) < now) return false;
  return true;
}

/**
 * Renders a name-colour cosmetic asset (a hex colour or a CSS gradient string)
 * as text styling. Use anywhere a username is shown.
 */
export function nameColorStyle(asset: string | null | undefined): CSSProperties {
  if (!asset) return {};
  if (asset.startsWith("linear-gradient")) {
    return { background: asset, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" };
  }
  return { color: asset };
}

/**
 * Renders an avatar-frame cosmetic asset (a hex colour or CSS gradient) as a
 * ring around a circular avatar. Wrap the avatar element in a <div> with this
 * style. Returns null when no frame is equipped (so the caller can skip the
 * wrapper).
 */
export function avatarFrameStyle(asset: string | null | undefined, thickness = 3): CSSProperties | null {
  if (!asset) return null;
  return { padding: thickness, borderRadius: "50%", background: asset, display: "inline-flex", lineHeight: 0, flexShrink: 0 };
}
