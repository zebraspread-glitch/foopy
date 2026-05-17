"use client";
import { useState, useRef, CSSProperties, RefObject } from "react";
import { supabase } from "@/app/lib/supabase";

export interface MentionUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  style?: CSSProperties;
  textareaRef?: RefObject<HTMLTextAreaElement>;
}

/** Detect active @mention before cursor. Returns { start, query } or null. */
function detectMention(val: string, cursorPos: number): { start: number; query: string } | null {
  const before = val.slice(0, cursorPos);
  const match = before.match(/@(\w*)$/);
  if (match) return { start: cursorPos - match[0].length, query: match[1] };
  return null;
}

/** Extract all @username strings from text (deduplicated). */
export function extractMentions(text: string): string[] {
  return [...new Set((text.match(/@(\w+)/g) ?? []).map(m => m.slice(1)))];
}

export default function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 1,
  maxLength,
  style,
  textareaRef,
}: Props) {
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = (textareaRef ?? internalRef) as React.RefObject<HTMLTextAreaElement>;
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function searchUsers(q: string) {
    if (!q) { setResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.${q}%,display_name.ilike.${q}%`)
      .limit(6);
    setResults((data ?? []) as MentionUser[]);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    const cursor = e.target.selectionStart ?? newVal.length;
    onChange(newVal);

    const mention = detectMention(newVal, cursor);
    if (mention) {
      setQuery(mention.query);
      setSelectedIdx(0);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => searchUsers(mention.query), 120);
    } else {
      setQuery(null);
      setResults([]);
    }
  }

  function selectUser(user: MentionUser) {
    const cursor = ref.current?.selectionStart ?? value.length;
    const mention = detectMention(value, cursor);
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(cursor);
    const newVal = `${before}@${user.username} ${after}`;
    onChange(newVal);
    setQuery(null);
    setResults([]);
    setTimeout(() => {
      const pos = before.length + user.username.length + 2;
      ref.current?.setSelectionRange(pos, pos);
      ref.current?.focus();
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query !== null && results.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter" && results[selectedIdx])) {
        e.preventDefault();
        selectUser(results[selectedIdx]);
        return;
      }
      if (e.key === "Escape") { setQuery(null); setResults([]); return; }
    }
    onKeyDown?.(e);
  }

  const showDropdown = query !== null && results.length > 0;

  return (
    <div style={{ position: "relative", flex: 1 }}>
      {showDropdown && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: 0,
          right: 0,
          background: "#131620",
          border: "1px solid rgba(255,255,255,.13)",
          borderRadius: 14,
          overflow: "hidden",
          zIndex: 200,
          boxShadow: "0 -6px 28px rgba(0,0,0,.55)",
        }}>
          {results.map((user, i) => (
            <button
              key={user.id}
              onMouseDown={e => { e.preventDefault(); selectUser(user); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                background: i === selectedIdx ? "rgba(59,130,246,.15)" : "transparent",
                border: "none",
                borderBottom: i < results.length - 1 ? "1px solid var(--border-1)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "#1e293b", overflow: "hidden", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {user.avatar_url
                  ? <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa" }}>
                      {(user.display_name || user.username)[0]?.toUpperCase()}
                    </span>
                }
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>
                  {user.display_name || user.username}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>@{user.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        style={style}
      />
    </div>
  );
}
