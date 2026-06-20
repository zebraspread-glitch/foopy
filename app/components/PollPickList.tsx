import type { PollEntry } from "@/app/lib/pollHistory";

const STATUS_META: Record<PollEntry["status"], { label: string; color: string }> = {
  won:     { label: "W", color: "#22c55e" },
  lost:    { label: "L", color: "#ef4444" },
  pending: { label: "·", color: "#94a3b8" },
};

export default function PollPickList({ entries }: { entries: PollEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((p) => {
        const meta = STATUS_META[p.status];
        return (
          <div key={p.id} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border-1)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {p.teams && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>{p.teams}</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)" }}>{p.question}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Your pick: <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{p.answer}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}44`, borderRadius: 8, padding: "3px 9px", minWidth: 26, textAlign: "center", flexShrink: 0 }}>
                {meta.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
