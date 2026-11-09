// Turn HTML / caption files into plain readable text. No relative imports so
// this file can be unit-tested directly with node.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", eacute: "é", deg: "°",
  times: "×", minus: "−", micro: "µ", copy: "©", reg: "®", trade: "™", middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

const JUNK_BLOCKS = /<(script|style|noscript|svg|nav|header|footer|aside|form|figure|iframe|button|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Pull the readable paragraphs out of an article page. */
export function htmlToArticleText(html: string, maxChars = 24000): string {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(JUNK_BLOCKS, " ");
  // Prefer the <article> element when there is one.
  const article = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const scope = article && article.length > 2000 ? article : cleaned;
  const paras: string[] = [];
  const re = /<(p|h2|h3|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope))) {
    const t = stripTags(m[2]).replace(/\s+/g, " ").trim();
    const tag = m[1].toLowerCase();
    const keep = tag === "p" ? t.length >= 40 : tag === "li" ? t.length >= 20 && t.length < 300 : t.length >= 4 && t.length < 160;
    if (keep) paras.push(t);
  }
  const seen = new Set<string>();
  const out = paras.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join("\n\n");
  return out.slice(0, maxChars);
}

/** Strip timestamps and cue numbers from WebVTT / SRT captions. */
export function captionsToText(raw: string, maxChars = 30000): string {
  if (/^\s*[{[]/.test(raw)) {
    try {
      const j = JSON.parse(raw);
      const segs = Array.isArray(j) ? j : j.segments;
      if (Array.isArray(segs)) {
        return segs.map((s: { body?: string; text?: string }) => s.body ?? s.text ?? "").join(" ").slice(0, maxChars);
      }
    } catch {
      /* fall through */
    }
  }
  if (/<html|<p\b/i.test(raw)) return htmlToArticleText(raw, maxChars);
  return raw
    .replace(/^WEBVTT.*$/m, "")
    .split(/\r?\n/)
    .filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^NOTE\b/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, maxChars);
}
