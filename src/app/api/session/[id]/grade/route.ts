import { fail, json, withUser } from "@/lib/http";
import { finalizeIfExpired, getOwnSession, grade } from "@/lib/sessions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Retry grading (or grade a draft that auto-submitted while the tab was closed).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    let s = await getOwnSession(id, user.id);
    if (!s) return fail("Not found", 404);
    s = await finalizeIfExpired(s);
    if (s.status !== "grading") return json({ status: s.status });
    s = await grade(s);
    return json({ status: s.status });
  });
}
