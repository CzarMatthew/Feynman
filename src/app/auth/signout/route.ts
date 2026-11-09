import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  const dest = req.nextUrl.clone();
  dest.pathname = "/login";
  dest.search = "";
  return NextResponse.redirect(dest, { status: 303 });
}
