import { GRACE_SECONDS, type Tier } from "./config";
import { gradeResponse, type ChatMsg, type Context, type Grade, type WrapUp } from "./coach";
import type { ArticleInfo, PodcastInfo, Questions } from "./daily";
import { assessIntegrity, type Integrity, type Telemetry } from "./integrity";
import { supabaseAdmin } from "./supabase/server";
import { countWords } from "./words";

export type Session = {
  id: string;
  user_id: string;
  date: string;
  tier: Tier;
  question: string;
  status: "writing" | "grading" | "graded" | "discussing" | "complete";
  started_at: string;
  deadline: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  draft: string;
  response: string | null;
  word_count: number | null;
  integrity: Integrity | null;
  grade: Grade | null;
  overall_score: number | null;
  acknowledged_at: string | null;
  discussion: ChatMsg[];
  wrap_up: WrapUp | null;
  completed_at: string | null;
};

export async function getOwnSession(id: string, userId: string): Promise<Session | null> {
  const { data } = await supabaseAdmin().from("sessions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as Session) ?? null;
}

export async function loadContext(s: Session): Promise<Context> {
  const db = supabaseAdmin();
  const [{ data: set }, { data: priv }] = await Promise.all([
    db.from("daily_sets").select("article, podcast").eq("date", s.date).single(),
    db.from("daily_private").select("article_text, podcast_text, questions").eq("date", s.date).single(),
  ]);
  const qs = (priv?.questions ?? {}) as Questions;
  return {
    tier: s.tier,
    question: s.question,
    guide: qs[s.tier]?.guide ?? "",
    article: set!.article as ArticleInfo,
    podcast: set!.podcast as PodcastInfo,
    articleText: priv?.article_text ?? "",
    podcastText: priv?.podcast_text ?? "",
  };
}

export function isPastDeadline(s: Session, now = Date.now()): boolean {
  return now > Date.parse(s.deadline) + GRACE_SECONDS * 1000;
}

/** Store the final text and mark the session as grading. Returns the updated row. */
export async function submit(s: Session, text: string, telemetry: Telemetry | null, auto: boolean): Promise<Session> {
  const integrity = assessIntegrity(
    telemetry ?? s.integrity ?? { pasteAttempts: 0, dropAttempts: 0, keystrokes: 0, largeInsertions: [], focusLosses: 0 },
    text
  );
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .update({
      status: "grading",
      response: text,
      draft: text,
      word_count: countWords(text),
      submitted_at: new Date().toISOString(),
      auto_submitted: auto,
      integrity,
    })
    .eq("id", s.id)
    .eq("status", "writing")
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Already submitted");
  return data as Session;
}

export async function grade(s: Session): Promise<Session> {
  const ctx = await loadContext(s);
  const g = await gradeResponse(ctx, s.response ?? "", s.word_count ?? 0, s.auto_submitted);
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .update({ status: "graded", grade: g, overall_score: g.overall })
    .eq("id", s.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Session;
}

/** If the timer ran out while the tab was closed, submit the saved draft. */
export async function finalizeIfExpired(s: Session): Promise<Session> {
  if (s.status !== "writing" || !isPastDeadline(s)) return s;
  try {
    return await submit(s, s.draft, null, true);
  } catch {
    const { data } = await supabaseAdmin().from("sessions").select("*").eq("id", s.id).single();
    return (data as Session) ?? s;
  }
}
