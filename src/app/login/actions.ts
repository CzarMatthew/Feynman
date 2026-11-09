"use server";
import { headers } from "next/headers";
import { isAllowedEmail, supabaseServer } from "@/lib/supabase/server";

export async function sendCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email address." };
  if (!isAllowedEmail(clean)) return { ok: false, error: "This email isn't on the invite list." };
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifyCode(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!isAllowedEmail(clean)) return { ok: false, error: "This email isn't on the invite list." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ email: clean, token: token.trim(), type: "email" });
  if (error) return { ok: false, error: "That code didn't work. Check it, or send a new one." };
  return { ok: true };
}
