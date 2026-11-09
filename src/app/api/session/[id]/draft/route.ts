import { fail, json, withUser } from "@/lib/http";
import { assessIntegrity, sanitizeTelemetry } from "@/lib/integrity";
import { getOwnSession, isPastDeadline } from "@/lib/sessions";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const s = await getOwnSession(id, user.id);
    if (!s) return fail("Not found", 404);
    if (s.status !== "writing" || isPastDeadline(s)) return json({ ok: false, closed: true });
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.slice(0, 20000) : s.draft;
    const integrity = assessIntegrity(sanitizeTelemetry(body.telemetry), text);
    await supabaseAdmin().from("sessions").update({ draft: text, integrity }).eq("id", id).eq("status", "writing");
    return json({ ok: true });
  });
}
