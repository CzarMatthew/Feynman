import { MAX_WORDS, MIN_WORDS } from "@/lib/config";
import { fail, json, withUser } from "@/lib/http";
import { sanitizeTelemetry } from "@/lib/integrity";
import { getOwnSession, grade, isPastDeadline, submit } from "@/lib/sessions";
import { countWords } from "@/lib/words";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    let s = await getOwnSession(id, user.id);
    if (!s) return fail("Not found", 404);
    if (s.status !== "writing") return json({ status: s.status });

    const body = await req.json().catch(() => ({}));
    const late = isPastDeadline(s);
    const auto = body.auto === true || late;
    // After the deadline only the last saved draft counts.
    const text = late ? s.draft : typeof body.text === "string" ? body.text.slice(0, 20000) : s.draft;
    const words = countWords(text);
    if (!auto && (words < MIN_WORDS || words > MAX_WORDS)) {
      return fail(`Responses need ${MIN_WORDS}–${MAX_WORDS} words (you have ${words}).`);
    }

    s = await submit(s, text, late ? null : sanitizeTelemetry(body.telemetry), auto);
    try {
      s = await grade(s);
    } catch (e) {
      console.error("grading failed", e);
      return json({ status: "grading", gradeError: true });
    }
    return json({ status: s.status });
  });
}
