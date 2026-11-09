import { fail, json, withUser } from "@/lib/http";
import { getOwnSession } from "@/lib/sessions";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The writer has gone through every red-pen mark; open the discussion.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const s = await getOwnSession(id, user.id);
    if (!s) return fail("Not found", 404);
    if (s.status !== "graded") return json({ status: s.status });
    await supabaseAdmin()
      .from("sessions")
      .update({ status: "discussing", acknowledged_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "graded");
    return json({ status: "discussing" });
  });
}
