import { nextCoachTurn, wrapUp, type ChatMsg } from "@/lib/coach";
import { fail, json, withUser } from "@/lib/http";
import { getOwnSession, loadContext } from "@/lib/sessions";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST {} -> coach opens (only when the chat is empty)
 * POST {message} -> writer replies; coach asks the next question or wraps up
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const s = await getOwnSession(id, user.id);
    if (!s) return fail("Not found", 404);
    if (s.status !== "discussing") return fail("The discussion isn't open.");
    if (!s.grade || !s.response) return fail("Missing grade.");

    const body = await req.json().catch(() => ({}));
    const msgs: ChatMsg[] = [...(s.discussion ?? [])];
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const last = msgs[msgs.length - 1];

    if (message) {
      if (!last || last.role !== "coach") return fail("Wait for the next question.");
      msgs.push({ role: "writer", content: message, at: new Date().toISOString() });
    } else if (msgs.length > 0 && last?.role === "coach") {
      return json({ discussion: msgs, status: s.status }); // nothing to do
    }

    const ctx = await loadContext(s);
    const turn = await nextCoachTurn(ctx, s.response, s.grade, msgs);
    const db = supabaseAdmin();

    if (turn.wrap) {
      const w = await wrapUp(ctx, s.response, msgs);
      await db
        .from("sessions")
        .update({ discussion: msgs, wrap_up: w, status: "complete", completed_at: new Date().toISOString() })
        .eq("id", id);
      return json({ discussion: msgs, wrap_up: w, status: "complete" });
    }

    msgs.push({ role: "coach", content: turn.message, at: new Date().toISOString() });
    await db.from("sessions").update({ discussion: msgs }).eq("id", id);
    return json({ discussion: msgs, status: "discussing" });
  });
}
