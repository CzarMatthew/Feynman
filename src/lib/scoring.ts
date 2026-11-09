// Score math kept separate from AI calls so it is easy to test. No relative imports.

export const CATEGORIES = [
  { key: "answer", label: "Answers the prompt", weight: 20 },
  { key: "evidence", label: "Use of both sources", weight: 20 },
  { key: "reasoning", label: "Reasoning & insight", weight: 20 },
  { key: "organization", label: "Organization", weight: 15 },
  { key: "mechanics", label: "Grammar & mechanics", weight: 15 },
  { key: "style", label: "Style & clarity", weight: 10 },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export function lengthPenalty(words: number, min: number, max: number): number {
  if (words < min) return Math.min(25, Math.ceil((min - words) / 10));
  if (words > max) return Math.min(15, Math.ceil((words - max) / 10));
  return 0;
}

/** Weighted 1–10 category scores -> 0–100, minus a length penalty. */
export function overallScore(scores: Partial<Record<CategoryKey, number>>, penalty = 0): number {
  let total = 0;
  let weight = 0;
  for (const c of CATEGORIES) {
    const s = scores[c.key];
    if (typeof s === "number" && Number.isFinite(s)) {
      total += Math.max(0, Math.min(10, s)) * c.weight;
      weight += c.weight;
    }
  }
  if (weight === 0) return 0;
  return Math.max(0, Math.round((total / weight) * 10 - penalty));
}

export function letterGrade(score: number): string {
  const bands: [number, string][] = [
    [97, "A+"], [93, "A"], [90, "A−"], [87, "B+"], [83, "B"], [80, "B−"],
    [77, "C+"], [73, "C"], [70, "C−"], [67, "D+"], [63, "D"], [60, "D−"],
  ];
  for (const [min, l] of bands) if (score >= min) return l;
  return "F";
}
