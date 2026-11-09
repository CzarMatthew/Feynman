import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, prettyDuration } from "../src/lib/rss.ts";
import { htmlToArticleText, captionsToText, stripTags } from "../src/lib/extract.ts";
import { locate, placeAnnotations, segments } from "../src/lib/annotate.ts";
import { overallScore, lengthPenalty, letterGrade } from "../src/lib/scoring.ts";
import { countWords } from "../src/lib/words.ts";
import { assessIntegrity } from "../src/lib/integrity.ts";

const PODCAST_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel><title>Short Wave</title>
<item>
  <title><![CDATA[Why the moon is shrinking & what it means]]></title>
  <link>https://www.npr.org/2026/11/07/moon</link>
  <guid isPermaLink="false">abc-123</guid>
  <pubDate>Fri, 07 Nov 2026 07:00:00 -0500</pubDate>
  <description><![CDATA[<p>Scientists say the <b>moon</b> is cooling.</p>]]></description>
  <itunes:duration>842</itunes:duration>
  <enclosure url="https://cdn.example.com/moon.mp3" type="audio/mpeg" length="1"/>
  <podcast:transcript url="https://example.com/t.vtt" type="text/vtt"/>
  <podcast:transcript url="https://example.com/t.txt" type="text/plain"/>
</item>
<item>
  <title>Second episode</title>
  <link>https://www.npr.org/2026/11/05/two</link>
  <pubDate>Wed, 05 Nov 2026 07:00:00 -0500</pubDate>
  <description>Plain text notes</description>
  <itunes:duration>1:02:05</itunes:duration>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title type="html">Quasar &amp; jets</title><link rel="alternate" href="https://ex.org/q"/><published>2026-11-07T12:00:00Z</published><summary>Big jets</summary></entry>
</feed>`;

test("parses podcast RSS with enclosures, durations and transcripts", () => {
  const items = parseFeed(PODCAST_RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Why the moon is shrinking & what it means");
  assert.equal(items[0].link, "https://www.npr.org/2026/11/07/moon");
  assert.equal(items[0].audioUrl, "https://cdn.example.com/moon.mp3");
  assert.equal(items[0].transcriptUrl, "https://example.com/t.txt"); // plain text preferred
  assert.equal(items[0].published, "2026-11-07T12:00:00.000Z");
  assert.equal(stripTags(items[0].description), "Scientists say the moon is cooling.");
  assert.equal(prettyDuration(items[0].duration), "14 min");
  assert.equal(prettyDuration(items[1].duration), "62 min");
});

test("parses Atom", () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Quasar & jets");
  assert.equal(items[0].link, "https://ex.org/q");
});

test("extracts article paragraphs and drops chrome", () => {
  const filler = "This is a long enough paragraph about lunar geology and thermal contraction. ";
  const html = `<html><nav><p>${filler}NAV</p></nav><script>var x=1</script>
  <article><h2>Results</h2><p>${filler.repeat(15)}</p><p>Short</p><p>${filler}&ldquo;quoted&rdquo; second.</p></article>
  <footer><p>${filler}FOOTER</p></footer></html>`;
  const t = htmlToArticleText(html);
  assert.ok(!t.includes("NAV"));
  assert.ok(!t.includes("FOOTER"));
  assert.ok(!t.includes("Short"));
  assert.ok(t.includes("“quoted” second."));
  assert.ok(t.startsWith("Results"));
});

test("captions to text", () => {
  const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nHello there.\n\n2\n00:00:03.500 --> 00:00:05.000\n<v Emily>The moon is shrinking.";
  assert.equal(captionsToText(vtt), "Hello there. The moon is shrinking.");
});

test("locates quotes despite curly quotes and spacing", () => {
  const text = "The moon’s crust  is cracking. It is old.";
  assert.deepEqual(locate(text, "is cracking"), { start: 18, end: 29 });
  const loose = locate(text, "moon's crust is");
  assert.ok(loose);
  assert.equal(text.slice(loose!.start, loose!.end), "moon’s crust  is");
});

test("places annotations without overlap and segments the text", () => {
  const text = "It is old. It is old again.";
  const { placed, unplaced } = placeAnnotations(text, [
    { quote: "It is old", category: "style", severity: "minor", comment: "a" },
    { quote: "It is old", category: "style", severity: "minor", comment: "b" },
    { quote: "not present", category: "logic", severity: "major", comment: "c" },
  ]);
  assert.equal(placed.length, 2);
  assert.equal(placed[1].start, 11);
  assert.equal(unplaced.length, 1);
  const segs = segments(text, placed);
  assert.equal(segs.map((s) => s.text).join(""), text);
});

test("scoring math", () => {
  assert.equal(overallScore({ answer: 8, evidence: 8, reasoning: 8, organization: 8, mechanics: 8, style: 8 }), 80);
  assert.equal(lengthPenalty(400, 350, 500), 0);
  assert.equal(lengthPenalty(300, 350, 500), 5);
  assert.equal(lengthPenalty(10, 350, 500), 25);
  assert.equal(lengthPenalty(560, 350, 500), 6);
  assert.equal(overallScore({ answer: 10, evidence: 10, reasoning: 10, organization: 10, mechanics: 10, style: 10 }, 5), 95);
  assert.equal(letterGrade(95), "A");
  assert.equal(letterGrade(59), "F");
});

test("word count", () => {
  assert.equal(countWords("Don't over-think it — 3 words, really."), 6);
  assert.equal(countWords("   "), 0);
});

test("integrity flags chunked text but not one blocked paste", () => {
  const text = "a".repeat(1000);
  const clean = assessIntegrity({ pasteAttempts: 1, dropAttempts: 0, keystrokes: 1100, largeInsertions: [], focusLosses: 0 }, text);
  assert.equal(clean.flagged, false);
  const chunky = assessIntegrity({ pasteAttempts: 0, dropAttempts: 0, keystrokes: 200, largeInsertions: [{ chars: 600, at: 30 }], focusLosses: 0 }, text);
  assert.equal(chunky.flagged, true);
  assert.ok(chunky.reasons.length >= 2);
});
