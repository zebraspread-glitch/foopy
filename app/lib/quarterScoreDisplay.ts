export type QuarterScoreDisplayMode = "total" | "totalGb" | "quarterPoints" | "quarterGb";

export const QUARTER_SCORE_DISPLAY_KEY = "foopy_quarter_score_display";

export const QUARTER_SCORE_DISPLAY_OPTIONS: ReadonlyArray<{
  value: QuarterScoreDisplayMode;
  label: string;
  summary: string;
}> = [
  { value: "total", label: "Total score", summary: "Score at end of quarter" },
  { value: "totalGb", label: "Total G.B", summary: "Goals.behinds at end of quarter" },
  { value: "quarterPoints", label: "Quarter points", summary: "Points scored that quarter" },
  { value: "quarterGb", label: "Quarter G.B", summary: "Goals.behinds scored that quarter" },
];

export function normalizeQuarterScoreDisplay(value: string | null | undefined): QuarterScoreDisplayMode {
  return QUARTER_SCORE_DISPLAY_OPTIONS.some((option) => option.value === value)
    ? (value as QuarterScoreDisplayMode)
    : "total";
}
