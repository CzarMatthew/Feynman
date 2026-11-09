import { NextRequest, NextResponse } from "next/server";
import { ensureDaily } from "@/lib/daily";
import { dateKey } from "@/lib/dates";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") || dateKey();
  const force = req.nextUrl.searchParams.get("force") === "1";
  const result = await ensureDaily(date, force);
  return NextResponse.json({ date, result });
}
