"use client";

const PALETTE: [string, string][] = [
  ["#3b82f6", "#ffffff"],
  ["#22c55e", "#06281a"],
  ["#f59e0b", "#3a2300"],
  ["#a855f7", "#ffffff"],
  ["#ef4444", "#ffffff"],
  ["#06b6d4", "#04313a"],
  ["#ec4899", "#ffffff"],
  ["#84cc16", "#1a2e05"],
];

function pal(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Small circular avatar for the current user, used in comment input bars. */
export default function MiniAvatar({ name, url, size = 38 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  const [bg, fg] = pal(name || "?");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.42), fontWeight: 900 }}>
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}
