// Locate grader quotes inside the writer's text. No relative imports.

export type Annotation = {
  quote: string;
  category: string;
  severity: "minor" | "major";
  comment: string;
  suggestion?: string;
};

export type Located = Annotation & { index: number; start: number; end: number };

const FOLD: Record<string, string> = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-" };

/** Lowercased, whitespace-collapsed, quote-folded copy plus a map back to original offsets. */
function normalize(s: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    ch = FOLD[ch] ?? ch;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else lastSpace = false;
    out += ch.toLowerCase();
    map.push(i);
  }
  return { text: out, map };
}

export function locate(text: string, quote: string, from = 0): { start: number; end: number } | null {
  if (!quote.trim()) return null;
  const exact = text.indexOf(quote, from);
  if (exact >= 0) return { start: exact, end: exact + quote.length };
  const T = normalize(text);
  const Q = normalize(quote.trim()).text;
  const fromN = T.map.findIndex((i) => i >= from);
  const at = T.text.indexOf(Q, Math.max(0, fromN));
  if (at < 0) return null;
  const start = T.map[at];
  const end = T.map[at + Q.length - 1] + 1;
  return { start, end };
}

/** Place annotations; overlapping or missing ones come back in `unplaced`. */
export function placeAnnotations(text: string, anns: Annotation[]): { placed: Located[]; unplaced: (Annotation & { index: number })[] } {
  const placed: Located[] = [];
  const unplaced: (Annotation & { index: number })[] = [];
  anns.forEach((a, index) => {
    let pos = locate(text, a.quote);
    // If that spot is taken, try a later occurrence of the same phrase.
    while (pos && placed.some((p) => pos!.start < p.end && p.start < pos!.end)) {
      pos = locate(text, a.quote, pos.end);
    }
    if (pos) placed.push({ ...a, index, ...pos });
    else unplaced.push({ ...a, index });
  });
  placed.sort((x, y) => x.start - y.start);
  return { placed, unplaced };
}

export type Segment = { text: string; ann?: Located };

export function segments(text: string, placed: Located[]): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  for (const p of placed) {
    if (p.start > i) out.push({ text: text.slice(i, p.start) });
    out.push({ text: text.slice(p.start, p.end), ann: p });
    i = p.end;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}
