import { ensureDaily } from "@/lib/daily";
import { dateKey } from "@/lib/dates";
import { json, withUser } from "@/lib/http";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Backup for the cron job: the Today page calls this if today's pair is missing.
export async function POST(req: Request) {
  return withUser(async () => {
    const body = await req.json().catch(() => ({}));
    const result = await ensureDaily(dateKey(), body?.retry === true);
    return json({ result });
  });
}
