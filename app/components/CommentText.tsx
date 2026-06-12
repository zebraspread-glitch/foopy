"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isStickerName, stickerUrl } from "@/app/lib/stickers";

const stickerImgStyle: CSSProperties = {
  width: 28,
  height: 28,
  verticalAlign: "middle",
  objectFit: "contain",
  margin: "-4px 1px",
};

const soloStickerImgStyle: CSSProperties = {
  width: 100,
  height: 100,
  objectFit: "contain",
  display: "block",
};

const SOLO_STICKER_RE = /^:([a-zA-Z0-9_]+)$/;
const PART_RE = /(@\w+|:[a-zA-Z0-9_]+)/g;

/**
 * Renders comment text, turning @mentions into profile links and :name into sticker images.
 * A sticker alone on its own line renders large; one mixed in with other text on a line renders small.
 */
export default function CommentText({ text, style }: { text: string; style?: CSSProperties }) {
  const router = useRouter();
  const lines = text.split("\n");

  return (
    <p style={style}>
      {lines.map((line, i) => {
        const solo = line.trim().match(SOLO_STICKER_RE);
        if (solo && isStickerName(solo[1])) {
          return <img key={i} src={stickerUrl(solo[1])} alt={line.trim()} style={soloStickerImgStyle} />;
        }
        const nextSolo = lines[i + 1]?.trim().match(SOLO_STICKER_RE);
        const nextIsSolo = !!nextSolo && isStickerName(nextSolo[1]);
        const isLast = i === lines.length - 1;
        return (
          <span key={i}>
            {renderParts(line, router)}
            {!isLast && !nextIsSolo && <br />}
          </span>
        );
      })}
    </p>
  );
}

function renderParts(line: string, router: ReturnType<typeof useRouter>): ReactNode[] {
  return line.split(PART_RE).map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return (
        <span
          key={i}
          onClick={() => router.push(`/profile/${part.slice(1)}`)}
          style={{ color: "#60a5fa", fontWeight: 700, cursor: "pointer" }}
        >
          {part}
        </span>
      );
    }
    if (/^:[a-zA-Z0-9_]+$/.test(part) && isStickerName(part.slice(1))) {
      return <img key={i} src={stickerUrl(part.slice(1))} alt={part} style={stickerImgStyle} />;
    }
    return part;
  });
}
