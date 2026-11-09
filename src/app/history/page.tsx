import Link from "next/link";
import { redirect } from "next/navigation";
import { TIER_LABELS, type Tier } from "@/lib/config";
import { shortDate } from "@/lib/dates";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  writing: "Writing",
  grading: "Grading",
  graded: "Review marks",
  discussing: "In discussion",
  complete: "Done",
};

export default async function History() {
  const user = await getUser();
  if (!user) redirect("/login");
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("sessions")
    .select("id, date, tier, status, overall_score, word_count, grade, question")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(200);
  const dates = [...new Set((rows ?? []).map((r) => r.date))];
  const { data: sets } = dates.length
    ? await db.from("daily_sets").select("date, field, article").in("date", dates)
    : { data: [] };
  const byDate = new Map((sets ?? []).map((s) => [s.date, s]));

  return (
    <div>
      <h1>History</h1>
      {!rows?.length ? (
        <div className="panel">
          <p>Nothing here yet. Your responses, grades, and discussions will collect here.</p>
          <Link className="btn" href="/">Start today's reading</Link>
        </div>
      ) : (
        <div className="panel" style={{ padding: "10px 16px", overflowX: "auto" }}>
          <table className="hist">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reading</th>
                <th>Level</th>
                <th className="hide-sm">Status</th>
                <th className="num hide-sm">Words</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const set = byDate.get(r.date);
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{shortDate(r.date)}</td>
                    <td>
                      <Link href={`/s/${r.id}`}>{set?.article?.title ?? r.question}</Link>
                      {set?.field && <div className="quiet small">{set.field}</div>}
                    </td>
                    <td><span className={`tag${r.tier === "extreme" ? " extreme" : ""}`}>{TIER_LABELS[r.tier as Tier]}</span></td>
                    <td className="hide-sm">{STATUS[r.status] ?? r.status}</td>
                    <td className="num hide-sm">{r.word_count ?? ""}</td>
                    <td className="num">
                      {r.overall_score != null ? <><strong>{r.grade?.letter}</strong> {r.overall_score}</> : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
