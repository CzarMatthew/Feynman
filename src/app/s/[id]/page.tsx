import { notFound, redirect } from "next/navigation";
import Discussion from "@/components/Discussion";
import GradingWait from "@/components/GradingWait";
import Review from "@/components/Review";
import Writer from "@/components/Writer";
import { TIER_LABELS } from "@/lib/config";
import type { ArticleInfo, PodcastInfo } from "@/lib/daily";
import { prettyDate } from "@/lib/dates";
import { finalizeIfExpired, getOwnSession } from "@/lib/sessions";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");
  let s = await getOwnSession(id, user.id);
  if (!s) notFound();
  s = await finalizeIfExpired(s);

  const { data: set } = await supabaseAdmin()
    .from("daily_sets")
    .select("article, podcast, connection_note, field")
    .eq("date", s.date)
    .single();
  const article = set?.article as ArticleInfo;
  const podcast = set?.podcast as PodcastInfo;

  const header = (
    <div className="row" style={{ marginBottom: 14 }}>
      <span className={`tag${s.tier === "extreme" ? " extreme" : ""}`}>{TIER_LABELS[s.tier]}</span>
      <span className="quiet small">{prettyDate(s.date)}{set?.field ? `, ${set.field}` : ""}</span>
    </div>
  );

  if (s.status === "writing") {
    return (
      <div className="narrow" style={{ margin: "0 auto" }}>
        {header}
        <Writer
          id={s.id}
          question={s.question}
          deadline={s.deadline}
          serverNow={Date.now()}
          initialDraft={s.draft}
          article={{ title: article.title, url: article.url }}
          podcast={{ title: podcast.title, url: podcast.url }}
        />
      </div>
    );
  }

  if (s.status === "grading" || !s.grade || !s.response) {
    return (
      <div className="narrow" style={{ margin: "0 auto" }}>
        {header}
        <GradingWait id={s.id} submittedAt={s.submitted_at} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <p className="prompt">{s.question}</p>
      <Review
        id={s.id}
        response={s.response}
        grade={s.grade}
        wordCount={s.word_count ?? 0}
        autoSubmitted={s.auto_submitted}
        integrity={s.integrity}
        locked={s.status !== "graded"}
      />
      {(s.status === "discussing" || s.status === "complete") && (
        <Discussion
          id={s.id}
          initial={s.discussion ?? []}
          initialWrap={s.wrap_up}
          initialStatus={s.status}
          connection={s.status === "complete" ? set?.connection_note ?? null : null}
        />
      )}
    </div>
  );
}
