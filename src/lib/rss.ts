import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  title: string;
  link: string;
  published: string | null; // ISO
  description: string; // raw html/text
  content: string; // content:encoded when present
  audioUrl: string | null;
  duration: string | null;
  transcriptUrl: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o["#cdata"] != null) return text(o["#cdata"]);
    if (o["#text"] != null) return text(o["#text"]);
  }
  return "";
}

function toIso(s: string): string | null {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function atomLink(links: unknown): string {
  for (const l of asArray(links as Record<string, string>[])) {
    if (typeof l === "string") return l;
    if (!l["@_rel"] || l["@_rel"] === "alternate") return l["@_href"] || "";
  }
  return "";
}

export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"];
  if (channel) {
    const items = asArray(channel.item ?? doc?.["rdf:RDF"]?.item);
    return items.map((it: Record<string, unknown>) => {
      const enclosures = asArray(it.enclosure as Record<string, string>[]);
      const audio = enclosures.find((e) => (e["@_type"] || "").startsWith("audio")) ?? enclosures[0];
      const transcripts = asArray(it["podcast:transcript"] as Record<string, string>[]);
      const pref = ["text/plain", "text/html", "text/vtt", "application/x-subrip", "application/json"];
      transcripts.sort((a, b) => {
        const ia = pref.indexOf(a["@_type"]);
        const ib = pref.indexOf(b["@_type"]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      return {
        title: text(it.title).trim(),
        link: text(it.link).trim() || text((it.guid as Record<string, unknown>) ?? "").trim(),
        published: toIso(text(it.pubDate) || text(it["dc:date"])),
        description: text(it.description) || text(it["itunes:summary"]),
        content: text(it["content:encoded"]),
        audioUrl: audio?.["@_url"] ?? null,
        duration: text(it["itunes:duration"]) || null,
        transcriptUrl: transcripts[0]?.["@_url"] ?? null,
      };
    });
  }
  const feed = doc?.feed;
  if (feed) {
    return asArray(feed.entry).map((e: Record<string, unknown>) => ({
      title: text(e.title).trim(),
      link: atomLink(e.link),
      published: toIso(text(e.published) || text(e.updated)),
      description: text(e.summary),
      content: text(e.content),
      audioUrl: null,
      duration: null,
      transcriptUrl: null,
    }));
  }
  return [];
}

/** "3725" or "1:02:05" or "45:10" -> "62 min" */
export function prettyDuration(d: string | null): string | null {
  if (!d) return null;
  const parts = d.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  if (parts.length === 1) secs = parts[0];
  const mins = Math.max(1, Math.round(secs / 60));
  return `${mins} min`;
}
