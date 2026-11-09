import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isAllowedEmail, supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const sb = await supabaseServer();

  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  if (ok) {
    const { data } = await sb.auth.getUser();
    if (!isAllowedEmail(data.user?.email)) {
      await sb.auth.signOut();
      ok = false;
    }
  }
  const dest = url.clone();
  dest.search = "";
  dest.pathname = ok ? "/" : "/login";
  return NextResponse.redirect(dest);
}
