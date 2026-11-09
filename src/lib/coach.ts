import { callStructured } from "./ai";
import { DISCUSSION_MAX_QUESTIONS, DISCUSSION_MIN_QUESTIONS, MAX_WORDS, MIN_WORDS, TIER_LABELS, type Tier } from "./config";
import { CATEGORIES, lengthPenalty, letterGrade, overallScore, type CategoryKey } from "./scoring";
import type { Annotation } from "./annotate";
import type { ArticleInfo, PodcastInfo, Questions } from "./daily";

export type Grade = {
  overall: number;
  letter: string;
  length_penalty: number;
  summary: string;
  strengths: string[];
  priorities: string[];
  categories: { key: CategoryKey; label: string; score: number; comment: string }[];
  annotations: Annotation[];
};

export type ChatMsg = { role: "coach" | "writer"; content: string; at: string };
export type WrapUp = { summary: string; growth: string; try_next: string };

export type Context = {
  tier: Tier;
  question: string;
  guide: string;
  article: ArticleInfo;
  podcast: PodcastInfo;
  articleText: string;
  podcastText: string;
};

function sources(c: Context) {
  return `ARTICLE: "${c.article.title}" (${c.article.source})
${c.articleText}

PODCAST: "${c.podcast.title}" (${c.podcast.show})
${c.podcastText}`;
}

const ANNOTATION_TYPES = ["grammar", "spelling", "punctuation", "word_choice", "clarity", "style", "logic", "evidence", "accuracy"];

export async function gradeResponse(c: Context, response: string, words: number, autoSubmitted: boolean): Promise<Grade> {
  type Raw = {
    summary: string;
    strengths: string[];
    priorities: string[];
    scores: Record<CategoryKey, { score: number; comment: string }>;
    annotations: Annotation[];
  };
  const raw = await callStructured<Raw>({
    system:
      "You are a demanding but fair writing instructor grading a timed essay, like a good professor with a red pen. " +
      "Be specific and honest; do not inflate. A 7/10 is solid college work; 9–10 is exceptional. " +
      "The writer only had 30 minutes and no AI help — judge accordingly, but still mark every real error.",
    user: `Tier: ${TIER_LABELS[c.tier]}
Prompt: ${c.question}
What a strong answer does (grader-only guide): ${c.guide}
Required length: ${MIN_WORDS}–${MAX_WORDS} words. This response: ${words} words${autoSubmitted ? " (auto-submitted when time ran out)" : ""}.

Score each category 1–10 with a one- or two-sentence comment:
${CATEGORIES.map((k) => `- ${k.key}: ${k.label}`).join("\n")}
Raise expectations for content (answer, evidence, reasoning) with the tier; mechanics and style standards are the same at every tier.
The podcast text may be only show notes or a partial transcript: do not mark a podcast detail wrong unless it contradicts the sources.

Annotations (the red pen): mark every grammar, spelling, and punctuation error, plus the most important word-choice, clarity, style, logic, evidence, and factual-accuracy problems (up to 30 total).
- "quote" must be copied EXACTLY from the response — a short span (1–12 words) that contains the problem. Each annotation should point at a different span.
- "comment" explains what is wrong in plain language; "suggestion" gives a fix (rewritten phrase) when one makes sense.
- category is one of: ${ANNOTATION_TYPES.join(", ")}. severity is "major" when it hurts meaning or credibility, else "minor".

Also give: summary (2–3 sentences), 2–3 specific strengths, and 2–3 priorities to work on next time.

${sources(c)}

RESPONSE:
"""
${response}
"""`,
    toolName: "record_grade",
    toolDescription: "Record the grade and red-pen annotations.",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        priorities: { type: "array", items: { type: "string" } },
        scores: {
          type: "object",
          properties: Object.fromEntries(
            CATEGORIES.map((k) => [
              k.key,
              {
                type: "object",
                properties: { score: { type: "integer", minimum: 1, maximum: 10 }, comment: { type: "string" } },
                required: ["score", "comment"],
              },
            ])
          ),
          required: CATEGORIES.map((k) => k.key),
        },
        annotations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              quote: { type: "string" },
              category: { type: "string", enum: ANNOTATION_TYPES },
              severity: { type: "string", enum: ["minor", "major"] },
              comment: { type: "string" },
              suggestion: { type: "string" },
            },
            required: ["quote", "category", "severity", "comment"],
          },
        },
      },
      required: ["summary", "strengths", "priorities", "scores", "annotations"],
    },
    maxTokens: 6000,
  });

  const scores = Object.fromEntries(CATEGORIES.map((k) => [k.key, raw.scores?.[k.key]?.score])) as Record<CategoryKey, number>;
  const penalty = lengthPenalty(words, MIN_WORDS, MAX_WORDS);
  const overall = overallScore(scores, penalty);
  return {
    overall,
    letter: letterGrade(overall),
    length_penalty: penalty,
    summary: raw.summary,
    strengths: raw.strengths ?? [],
    priorities: raw.priorities ?? [],
    categories: CATEGORIES.map((k) => ({
      key: k.key,
      label: k.label,
      score: raw.scores?.[k.key]?.score ?? 0,
      comment: raw.scores?.[k.key]?.comment ?? "",
    })),
    annotations: (raw.annotations ?? []).filter((a) => a.quote && a.comment),
  };
}

function transcript(msgs: ChatMsg[]) {
  return msgs.map((m) => `${m.role === "coach" ? "COACH" : "WRITER"}: ${m.content}`).join("\n\n");
}

/** Next coach turn. Returns {message, wrap} — wrap means the conversation should end now. */
export async function nextCoachTurn(c: Context, response: string, grade: Grade, msgs: ChatMsg[]): Promise<{ message: string; wrap: boolean }> {
  const asked = msgs.filter((m) => m.role === "coach").length;
  if (asked >= DISCUSSION_MAX_QUESTIONS) return { message: "", wrap: true };
  const mayWrap = asked >= DISCUSSION_MIN_QUESTIONS;

  const out = await callStructured<{ message: string; wrap_now?: boolean }>({
    system:
      "You are a Socratic writing coach. You have read the sources and the writer's essay. Your job is to make the writer think harder, " +
      "not to praise or lecture. Ask ONE probing question at a time. Push on why they made choices, bring up counterpoints and details from the " +
      "article or podcast they ignored or got wrong, test their assumptions, and ask them to defend or revise claims. Keep each turn under 110 words. " +
      "Briefly react to their last answer (agree, challenge, or point out what it missed) before asking the next question. Never write their answers for them.",
    user: `Prompt they answered (${TIER_LABELS[c.tier]}): ${c.question}

Their essay:
"""
${response}
"""

Grader summary: ${grade.summary}

${sources(c)}

Conversation so far (${asked} of ${DISCUSSION_MAX_QUESTIONS} questions asked):
${msgs.length ? transcript(msgs) : "(none yet — open with your first question; do not greet at length)"}

${
  asked === 0
    ? "Ask question 1."
    : mayWrap
      ? `You may set wrap_now=true (with an empty message) if the discussion has reached a natural end; otherwise ask question ${asked + 1}.`
      : `Ask question ${asked + 1}.`
}`,
    toolName: "coach_turn",
    toolDescription: "Your next turn in the discussion.",
    schema: {
      type: "object",
      properties: { message: { type: "string" }, wrap_now: { type: "boolean" } },
      required: ["message"],
    },
    maxTokens: 700,
  });
  if (mayWrap && out.wrap_now) return { message: "", wrap: true };
  return { message: out.message.trim(), wrap: false };
}

export async function wrapUp(c: Context, response: string, msgs: ChatMsg[]): Promise<WrapUp> {
  return callStructured<WrapUp>({
    system: "You are a writing coach closing out a short Socratic discussion. Be warm, concrete, and brief.",
    user: `Prompt: ${c.question}

Essay:
"""
${response}
"""

Discussion:
${transcript(msgs)}

Also tell them, in one sentence inside the summary, how today's article and podcast connect: ${c.article.title} / ${c.podcast.title}.

Write:
- summary: 2–3 sentences on where their thinking ended up compared with the essay.
- growth: one sentence naming the strongest moment of reasoning in the discussion.
- try_next: one concrete thing to try in tomorrow's essay.`,
    toolName: "wrap_up",
    toolDescription: "Close the discussion.",
    schema: {
      type: "object",
      properties: { summary: { type: "string" }, growth: { type: "string" }, try_next: { type: "string" } },
      required: ["summary", "growth", "try_next"],
    },
    maxTokens: 600,
  });
}

export type { Questions };
