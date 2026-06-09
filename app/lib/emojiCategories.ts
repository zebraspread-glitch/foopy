// Full emoji catalogue for the reaction picker, grouped into the standard
// keyboard categories. The dataset (@emoji-mart/data) is ~1.4MB so it is
// dynamically imported only when the picker first opens, and cached after.

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

let cache: EmojiCategory[] | null = null;

export async function loadEmojiCategories(): Promise<EmojiCategory[]> {
  if (cache) return cache;

  const mod = await import("@emoji-mart/data");
  const data = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    categories: { id: string; emojis: string[] }[];
    emojis: Record<string, { skins: { native: string }[] }>;
  };

  const cats: EmojiCategory[] = [];
  for (const cat of data.categories) {
    const meta = META[cat.id];
    if (!meta) continue;
    const emojis = cat.emojis
      .map((id) => data.emojis[id]?.skins?.[0]?.native)
      .filter((native): native is string => Boolean(native));
    if (emojis.length) cats.push({ id: cat.id, label: meta.label, icon: meta.icon, emojis });
  }
  cats.sort((a, b) => (META[a.id]?.order ?? 99) - (META[b.id]?.order ?? 99));

  cache = cats;
  return cats;
}
