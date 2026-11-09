import { TIERS, WRITING_MINUTES, type Tier } from "@/lib/config";
import type { Questions } from "@/lib/daily";
import { fail, json, withUser } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withUser(async (user) => {
    const { date, tier } = (await req.json().catch(() => ({}))) as { date?: string; tier?: Tier };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Missing date");
    if (!tier || !TIERS.includes(tier)) return fail("Pick a tier");

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from("sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", date)
      .eq("tier", tier)
      .maybeSingle();
    if (existing) return json({ id: existing.id });

    const { data: set } = await db.from("daily_sets").select("status").eq("date", date).maybeSingle();
    if (set?.status !== "ready") return fail("That day's reading isn't ready.");
    const { data: priv } = await db.from("daily_private").select("questions").eq("date", date).single();
    const question = (priv?.questions as Questions | undefined)?.[tier]?.question;
    if (!question) return fail("No question for that tier.");

    const now = new Date();
    const { data, error } = await db
      .from("sessions")
      .insert({
        user_id: user.id,
        date,
        tier,
        question,
        started_at: now.toISOString(),
        deadline: new Date(now.getTime() + WRITING_MINUTES * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      // Double click / two devices: return the one that won.
      const { data: again } = await db.from("sessions").select("id").eq("user_id", user.id).eq("date", date).eq("tier", tier).maybeSingle();
      if (again) return json({ id: again.id });
      return fail(error.message, 500);
    }
    return json({ id: data.id });
  });
}
