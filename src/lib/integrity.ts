// Typing telemetry checks. No relative imports.

export type Telemetry = {
  pasteAttempts: number;
  dropAttempts: number;
  keystrokes: number;
  largeInsertions: { chars: number; at: number }[]; // at = seconds since start
  focusLosses: number;
};

export type Integrity = Telemetry & { flagged: boolean; reasons: string[] };

export const LARGE_INSERT_CHARS = 30;

export function sanitizeTelemetry(t: unknown): Telemetry {
  const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const ins = Array.isArray(o.largeInsertions) ? o.largeInsertions : [];
  return {
    pasteAttempts: n(o.pasteAttempts),
    dropAttempts: n(o.dropAttempts),
    keystrokes: n(o.keystrokes),
    focusLosses: n(o.focusLosses),
    largeInsertions: ins
      .slice(0, 200)
      .map((x) => ({ chars: n((x as Record<string, unknown>)?.chars), at: n((x as Record<string, unknown>)?.at) }))
      .filter((x) => x.chars > 0),
  };
}

export function assessIntegrity(t: Telemetry, finalText: string): Integrity {
  const reasons: string[] = [];
  const len = finalText.length || 1;
  const chunked = t.largeInsertions.reduce((s, x) => s + x.chars, 0);
  const biggest = t.largeInsertions.reduce((m, x) => Math.max(m, x.chars), 0);
  if (biggest >= 200) reasons.push(`One block of ${biggest} characters appeared at once.`);
  if (chunked / len > 0.15) reasons.push(`${Math.round((chunked / len) * 100)}% of the text arrived in large chunks.`);
  // Typing ~half the final characters as keystrokes is a very loose floor
  // (autocomplete and swipe typing produce fewer key events).
  if (finalText.length > 800 && t.keystrokes < finalText.length * 0.3) reasons.push("Far fewer keystrokes than characters written.");
  if (t.pasteAttempts > 0) reasons.push(`${t.pasteAttempts} blocked paste attempt${t.pasteAttempts === 1 ? "" : "s"}.`);
  const flagged = reasons.some((r) => !r.includes("blocked paste"));
  return { ...t, flagged, reasons };
}
