// Sticker pack — files live in public/stickers/{name}.png
// To rename a sticker, just rename its file (e.g. 1.png -> brad.png) and
// update STICKER_NAMES below; the shortcode (:name) and rendering update automatically.
export const STICKER_NAMES = [
  "bradscott",
  "cinema",
  "dafoe",
  "dan1",
  "depression",
  "dexteregg",
  "dog",
  "drakeyachty",
  "flight1",
  "flight2",
  "flight3",
  "kevinjames",
  "lebronscared",
  "longmuir",
  "me",
  "nas1",
  "patrick1",
  "rachele1",
  "shocked",
  "speed1",
  "stop",
  "talknothink",
];

export function stickerUrl(name: string) {
  return `/stickers/${name}.png`;
}

export function isStickerName(name: string) {
  return STICKER_NAMES.includes(name);
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
