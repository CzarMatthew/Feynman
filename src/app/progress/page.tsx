import Link from "next/link";
import { redirect } from "next/navigation";
import ProgressCharts, { type ProgressRow } from "@/components/ProgressCharts";
import type { Grade } from "@/lib/coach";
import type { Tier } from "@/lib/config";
import { addDays, dateKey } from "@/lib/dates";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Progress() {
  const user = await getUser();
  if (!user) redirect("/login");
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select("id, date, tier, submitted_at, word_count, grade, overall_score")
    .eq("user_id", user.id)
    .not("overall_score", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(500);

  const rows: ProgressRow[] = (data ?? []).map((r) => {
    const g = r.grade as Grade;
    const words = r.word_count || 1;
    return {
      id: r.id,
      date: r.date,
      tier: r.tier as Tier,
      score: r.overall_score as number,
      letter: g.letter,
      cats: Object.fromEntries(g.categories.map((c) => [c.key, c.score])),
      marksPer100: Math.round((g.annotations.length / words) * 1000) / 10,
      mechanicsPer100:
        Math.round((g.annotations.filter((a) => ["grammar", "spelling", "punctuation"].includes(a.category)).length / words) * 1000) / 10,
    };
  });

  if (rows.length === 0) {
    return (
      <div>
        <h1>Progress</h1>
        <div className="panel">
          <p>Your trends show up here after your first graded response.</p>
          <Link className="btn" href="/">Start today's reading</Link>
        </div>
      </div>
    );
  }

  // Streak: consecutive days (ending today or yesterday) with a graded response.
  const days = new Set(rows.map((r) => r.date));
  const today = dateKey();
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const last = rows.slice(-7);
  const prev = rows.slice(-14, -7);
  const avg = (xs: ProgressRow[]) => (xs.length ? Math.round(xs.reduce((s, r) => s + r.score, 0) / xs.length) : null);

  return (
    <div>
      <h1>Progress</h1>
      <div className="tiles">
        <div className="tile"><b>{rows.length}</b><span>graded responses</span></div>
        <div className="tile"><b>{streak}</b><span>day streak</span></div>
        <div className="tile">
          <b>{avg(last)}</b>
          <span>
            average, last {last.length}
            {prev.length > 0 && avg(prev) != null && ` (${avg(last)! - avg(prev)! >= 0 ? "+" : ""}${avg(last)! - avg(prev)!} vs the ${prev.length} before)`}
          </span>
        </div>
        <div className="tile"><b>{Math.max(...rows.map((r) => r.score))}</b><span>best score</span></div>
      </div>
      <ProgressCharts rows={rows} />
    </div>
  );
}
