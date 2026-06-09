// Full emoji catalogue for the reaction picker, grouped into the standard
// keyboard categories. The dataset (@emoji-mart/data) is ~1.4MB so it is
// dynamically imported only when the picker first opens, and cached after.
//
// Emojis the current device's font can't render (they show as a "tofu" square)
// are filtered out using on-canvas detection, so the picker only ever shows
// emojis you can actually see.

export type EmojiCategory = { id: string; label: string; icon: string; emojis: string[] };

const META: Record<string, { label: string; icon: string; order: number }> = {
  people:   { label: "Smileys & People", icon: "\u{1F600}", order: 0 },
  nature:   { label: "Animals & Nature", icon: "\u{1F43B}", order: 1 },
  foods:    { label: "Food & Drink",     icon: "\u{1F354}", order: 2 },
  activity: { label: "Activities",       icon: "⚽",     order: 3 },
  places:   { label: "Travel & Places",  icon: "\u{1F697}", order: 4 },
  objects:  { label: "Objects",          icon: "\u{1F4A1}", order: 5 },
  symbols:  { label: "Symbols",          icon: "❤️", order: 6 },
  flags:    { label: "Flags",            icon: "\u{1F3C1}", order: 7 },
};

// ── Tofu (unsupported emoji) detection ──────────────────────────────────────
let renderChecker: ((emoji: string) => boolean) | null = null;

function buildRenderChecker(): (emoji: string) => boolean {
  if (typeof document === "undefined") return () => true;
  const size = 18;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => true;

  ctx.textBaseline = "top";
  ctx.font = `${size}px sans-serif`;

  const data = (ch: string): Uint8ClampedArray => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillText(ch, 0, 0);
    return ctx.getImageData(0, 0, size, size).data;
  };
  const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const isBlank = (a: Uint8ClampedArray) => {
    for (let i = 3; i < a.length; i += 4) if (a[i] !== 0) return false;
    return true;
  };

  // U+10FFFF is unassigned on every platform → renders as the "tofu" box.
  const tofu = Uint8ClampedArray.from(data("\u{10FFFF}"));

  return (emoji: string) => {
    const px = data(emoji);
    return !isBlank(px) && !equal(px, tofu);
  };
}

export function isEmojiRenderable(emoji: string): boolean {
  if (!renderChecker) renderChecker = buildRenderChecker();
  try {
    return renderChecker(emoji);
  } catch {
    return true;
  }
}

// ── Catalogue loader ─────────────────────────────────────────────────────────
let cache: EmojiCategory[] | null = null;

export async function loadEmojiCategories(): Promise<EmojiCategory[]> {
  if (cache) return cache;

  const mod = await import("@emoji-mart/data");
  const data = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    categories: { id: string; emojis: string[] }[];
    emojis: Record<string, { skins: { native: string }[] }>;
  };

  const renderable = isEmojiRenderable;
  const cats: EmojiCategory[] = [];
  for (const cat of data.categories) {
    const meta = META[cat.id];
    if (!meta) continue;
    const emojis = cat.emojis
      .map((id) => data.emojis[id]?.skins?.[0]?.native)
      .filter((native): native is string => Boolean(native) && renderable(native));
    if (emojis.length) cats.push({ id: cat.id, label: meta.label, icon: meta.icon, emojis });
  }
  cats.sort((a, b) => (META[a.id]?.order ?? 99) - (META[b.id]?.order ?? 99));

  cache = cats;
  return cats;
}
