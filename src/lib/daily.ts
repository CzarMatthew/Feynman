import { callStructured } from "./ai";
import {
  NEWS_FEEDS,
  PODCAST_FEEDS,
  PODCAST_LOOKBACK_DAYS,
  MIN_WORDS,
  MAX_WORDS,
  TIERS,
  type Tier,
  type PodcastFeed,
} from "./config";
import { addDays, dateKey } from "./dates";
import { captionsToText, htmlToArticleText, stripTags } from "./extract";
import { parseFeed, prettyDuration, type FeedItem } from "./rss";
import { supabaseAdmin } from "./supabase/server";

const UA = "Mozilla/5.0 (compatible; FeynmanDaily/1.0; personal reading app)";

export type ArticleInfo = {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  summary: string;
  paywalled: boolean;
};
export type PodcastInfo = {
  title: string;
  url: string;
  audio_url: string | null;
  show: string;
  published_at: string | null;
  summary: string;
  duration: string | null;
};
export type TierQuestion = { question: string; guide: string };
export type Questions = Record<Tier, TierQuestion>;

export type DailySet = {
  date: string;
  status: "pending" | "generating" | "ready" | "failed";
  field: string | null;
  article: ArticleInfo | null;
  podcast: PodcastInfo | null;
  connection_note: string | null;
  error: string | null;
  updated_at: string;
};

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

async function resolvePodcastFeed(feed: PodcastFeed): Promise<string | null> {
  if (feed.appleId) {
    try {
      const raw = await fetchText(`https://itunes.apple.com/lookup?id=${feed.appleId}&entity=podcast`, 8000);
      const url = JSON.parse(raw)?.results?.[0]?.feedUrl;
      if (url) return url;
    } catch {
      /* use fallback */
    }
  }
  return feed.url ?? null;
}

type ArticleCandidate = FeedItem & { id: string; source: string; paywalled: boolean };
type EpisodeCandidate = FeedItem & { id: string; show: string };

async function gatherArticles(sinceMs: number, exclude: Set<string>): Promise<ArticleCandidate[]> {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async (f) => {
      const items = parseFeed(await fetchText(f.url));
      return items
        .filter((i) => i.link && i.title && !exclude.has(i.link))
        .filter((i) => i.published && Date.parse(i.published) >= sinceMs)
        .slice(0, 15)
        .map((i, n) => ({ ...i, id: `${f.name.replace(/\W+/g, "").slice(0, 10)}-${n}`, source: f.name, paywalled: !!f.paywalled }));
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function gatherEpisodes(exclude: Set<string>): Promise<EpisodeCandidate[]> {
  const since = Date.now() - PODCAST_LOOKBACK_DAYS * 86400_000;
  const results = await Promise.allSettled(
    PODCAST_FEEDS.map(async (f) => {
      const url = await resolvePodcastFeed(f);
      if (!url) return [];
      const items = parseFeed(await fetchText(url, 15000));
      return items
        .filter((i) => i.title && (i.link || i.audioUrl))
        .filter((i) => !exclude.has(i.link || i.audioUrl || ""))
        .filter((i) => i.published && Date.parse(i.published) >= since)
        .filter((i) => !/\bsponsored\b|\btrailer\b|\bencore\b|\brerun\b/i.test(i.title))
        .slice(0, 12)
        .map((i, n) => ({ ...i, id: `${f.name.replace(/\W+/g, "").slice(0, 10)}-${n}`, show: f.name }));
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

type Pick = {
  article_id: string;
  podcast_id: string;
  field: string;
  connection_note: string;
  article_teaser: string;
  podcast_teaser: string;
};

async function pickPair(today: string, articles: ArticleCandidate[], episodes: EpisodeCandidate[]): Promise<Pick> {
  const yesterday = addDays(today, -1);
  const aList = articles
    .map((a) => `[${a.id}] (${a.source}${a.paywalled ? ", PAYWALLED" : ""}; ${a.published ? dateKey(new Date(a.published)) : "?"}) ${a.title}\n    ${clip(stripTags(a.description || a.content), 320)}`)
    .join("\n");
  const eList = episodes
    .map((e) => `[${e.id}] (${e.show}; ${e.published ? dateKey(new Date(e.published)) : "?"}) ${e.title}\n    ${clip(stripTags(e.description || e.content), 420)}`)
    .join("\n");

  return callStructured<Pick>({
    system:
      "You are the science editor for a daily reading-and-writing exercise for a college student. " +
      "You pick one news article and one podcast episode that a reader will study before writing a short essay.",
    user: `Today is ${today}. Yesterday was ${yesterday}.

Pick ONE article and ONE podcast episode.

Article rules:
- Must report new research or a discovery in a hard science: physics, chemistry, biology, astronomy/space, earth & climate science, geology, materials science, neuroscience, genetics, ecology, or mathematics. Not psychology surveys, not business, policy-only, product, or lifestyle stories.
- Strongly prefer articles published ${yesterday}. If none fit, use the most recent one that does.
- Strongly prefer free sources. Use a PAYWALLED one only if it is clearly the best story and nothing free is close.
- Prefer substantive stories with enough detail to write 350–500 words about (findings, methods, numbers, caveats).

Podcast rules:
- Choose the episode most related to the article's topic, field, or underlying idea. An exact match is rare; a meaningful conceptual link is the goal (shared phenomenon, method, organism, physical principle, or tension).
- Prefer interview or explainer episodes with real scientific content. Never pick sponsored content.

Also write:
- field: a 1–3 word field label (e.g. "Astrophysics").
- connection_note: 1–2 sentences on how the two connect. This is shown only AFTER the reader writes.
- article_teaser and podcast_teaser: one neutral sentence each saying what the piece is about, without giving away its conclusions.

ARTICLES:
${aList}

PODCAST EPISODES:
${eList}`,
    toolName: "choose_pair",
    toolDescription: "Record the chosen article and podcast episode.",
    schema: {
      type: "object",
      properties: {
        article_id: { type: "string" },
        podcast_id: { type: "string" },
        field: { type: "string" },
        connection_note: { type: "string" },
        article_teaser: { type: "string" },
        podcast_teaser: { type: "string" },
      },
      required: ["article_id", "podcast_id", "field", "connection_note", "article_teaser", "podcast_teaser"],
    },
    maxTokens: 1200,
  });
}

async function articleText(a: ArticleCandidate): Promise<string> {
  const fromFeed = stripTags(a.content || "");
  if (fromFeed.length > 2500) return fromFeed.slice(0, 24000);
  try {
    const page = htmlToArticleText(await fetchText(a.link));
    if (page.length > 1200) return page;
  } catch {
    /* fall back below */
  }
  return [fromFeed, stripTags(a.description)].filter(Boolean).join("\n\n");
}

async function podcastText(e: EpisodeCandidate): Promise<string> {
  const notes = stripTags(e.content || e.description || "");
  let transcript = "";
  if (e.transcriptUrl) {
    try {
      transcript = captionsToText(await fetchText(e.transcriptUrl));
    } catch {
      /* ignore */
    }
  }
  if (transcript.length < 2000 && e.link && /^https?:/.test(e.link)) {
    try {
      // Nature and NPR episode pages carry full transcripts.
      const page = htmlToArticleText(await fetchText(e.link), 30000);
      if (page.length > transcript.length) transcript = page;
    } catch {
      /* ignore */
    }
  }
  return [`SHOW NOTES:\n${notes}`, transcript && `TRANSCRIPT OR EPISODE PAGE:\n${transcript}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 32000);
}

async function writeQuestions(input: {
  article: ArticleInfo;
  articleText: string;
  podcast: PodcastInfo;
  podcastText: string;
}): Promise<Questions> {
  const qSchema = {
    type: "object",
    properties: { question: { type: "string" }, guide: { type: "string" } },
    required: ["question", "guide"],
  };
  return callStructured<Questions>({
    system:
      "You write essay prompts for a daily critical-reading exercise. The writer reads an article and listens to a podcast, " +
      `then has 30 minutes to write ${MIN_WORDS}–${MAX_WORDS} words with no AI help. Prompts must be answerable from the two sources ` +
      "plus careful reasoning, and must reward close reading of BOTH sources.",
    user: `Write one prompt per difficulty tier.

EASY — comprehension. E.g. the central finding/theme of the article and why it matters, with support from each source.
MEDIUM — explain and evaluate. E.g. explain how the researchers reached a conclusion and judge how convincing it is, drawing on both sources.
ADVANCED — analysis. E.g. methods, limitations, alternative explanations, what would change the conclusion, or implications that neither source states outright.
EXTREME — synthesis of two seemingly unrelated things: name ONE specific detail that appears only in the article and ONE specific detail that appears only in the podcast, and ask the writer to argue how they are related. The link should be real but non-obvious and require reasoning, not lookup.

Each prompt: 1–3 sentences, specific to these sources (name the actual subjects), no yes/no questions, no multi-part lists of more than two asks.
For each tier also write "guide": 2–4 sentences for the grader describing what a strong answer does and the key source details it should use. The writer never sees the guide.

ARTICLE: "${input.article.title}" (${input.article.source})
${input.articleText}

PODCAST: "${input.podcast.title}" (${input.podcast.show})
${input.podcastText}`,
    toolName: "write_prompts",
    toolDescription: "Record the four tiered essay prompts.",
    schema: {
      type: "object",
      properties: Object.fromEntries(TIERS.map((t) => [t, qSchema])),
      required: [...TIERS],
    },
    maxTokens: 2500,
  });
}

/** Build and store the pair + questions for a date. */
export async function generateDaily(date: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: recent } = await db
    .from("daily_sets")
    .select("article, podcast")
    .gte("date", addDays(date, -60))
    .eq("status", "ready");
  const exclude = new Set<string>();
  for (const r of recent ?? []) {
    if (r.article?.url) exclude.add(r.article.url);
    if (r.podcast?.url) exclude.add(r.podcast.url);
    if (r.podcast?.audio_url) exclude.add(r.podcast.audio_url);
  }

  const now = Date.now();
  let articles: ArticleCandidate[] = [];
  for (const hours of [48, 24 * 7, 24 * 21]) {
    articles = await gatherArticles(now - hours * 3600_000, exclude);
    if (articles.length >= 6) break;
  }
  if (articles.length === 0) throw new Error("No articles found in any feed.");
  const episodes = await gatherEpisodes(exclude);
  if (episodes.length === 0) throw new Error("No podcast episodes found in any feed.");

  // Keep the prompt a reasonable size.
  articles = articles.slice(0, 70);

  const pick = await pickPair(date, articles, episodes);
  const a = articles.find((x) => x.id === pick.article_id) ?? articles[0];
  const e = episodes.find((x) => x.id === pick.podcast_id) ?? episodes[0];

  const article: ArticleInfo = {
    title: a.title,
    url: a.link,
    source: a.source,
    published_at: a.published,
    summary: pick.article_teaser,
    paywalled: a.paywalled,
  };
  const podcast: PodcastInfo = {
    title: e.title,
    url: e.link && /^https?:/.test(e.link) ? e.link : e.audioUrl ?? "",
    audio_url: e.audioUrl,
    show: e.show,
    published_at: e.published,
    summary: pick.podcast_teaser,
    duration: prettyDuration(e.duration),
  };

  const [aText, pText] = await Promise.all([articleText(a), podcastText(e)]);
  const questions = await writeQuestions({ article, articleText: aText, podcast, podcastText: pText });

  const { error: e1 } = await db.from("daily_private").upsert({
    date,
    article_text: aText,
    podcast_text: pText,
    questions,
  });
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await db
    .from("daily_sets")
    .update({
      status: "ready",
      field: pick.field,
      article,
      podcast,
      connection_note: pick.connection_note,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("date", date);
  if (e2) throw new Error(e2.message);
}

const STALE_MS = 8 * 60_000;

/** Make sure a date has a ready set; safe to call repeatedly. */
export async function ensureDaily(date: string, force = false): Promise<"ready" | "busy" | "failed"> {
  const db = supabaseAdmin();
  const { data: row } = await db.from("daily_sets").select("status, updated_at").eq("date", date).maybeSingle();

  if (row?.status === "ready" && !force) return "ready";
  if (row?.status === "generating" && Date.now() - Date.parse(row.updated_at) < STALE_MS) return "busy";

  const stamp = new Date().toISOString();
  if (row) {
    // Claim the job only if nobody else changed it since we read it.
    const { data: claimed } = await db
      .from("daily_sets")
      .update({ status: "generating", updated_at: stamp, error: null })
      .eq("date", date)
      .eq("updated_at", row.updated_at)
      .select("date");
    if (!claimed?.length) return "busy";
  } else {
    const { error } = await db.from("daily_sets").insert({ date, status: "generating", updated_at: stamp });
    if (error) return "busy"; // someone else inserted first
  }

  try {
    await generateDaily(date);
    return "ready";
  } catch (err) {
    await db
      .from("daily_sets")
      .update({ status: "failed", error: String(err instanceof Error ? err.message : err).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("date", date);
    return "failed";
  }
}
