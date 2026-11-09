import { redirect } from "next/navigation";
import TodayClient from "@/components/TodayClient";
import { dateKey } from "@/lib/dates";
import type { DailySet } from "@/lib/daily";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = await getUser();
  if (!user) redirect("/login");
  const db = supabaseAdmin();
  const today = dateKey();

  const [{ data: todayRow }, { data: latest }] = await Promise.all([
    db.from("daily_sets").select("*").eq("date", today).maybeSingle(),
    db.from("daily_sets").select("*").eq("status", "ready").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const set = (todayRow?.status === "ready" ? todayRow : latest) as DailySet | null;
  const { data: sessions } = set
    ? await db.from("sessions").select("id, tier, status, overall_score").eq("user_id", user.id).eq("date", set.date)
    : { data: [] };

  return (
    <TodayClient
      today={today}
      set={set}
      todayStatus={(todayRow?.status as DailySet["status"]) ?? "missing"}
      todayError={todayRow?.error ?? null}
      sessions={(sessions ?? []) as { id: string; tier: string; status: string; overall_score: number | null }[]}
    />
  );
}
