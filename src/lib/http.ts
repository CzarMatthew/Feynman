import { NextResponse } from "next/server";
import { getUser } from "./supabase/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Run a handler with the signed-in user, or 401. */
export async function withUser<T>(fn: (user: { id: string; email?: string }) => Promise<T>) {
  const user = await getUser();
  if (!user) return fail("Not signed in", 401);
  try {
    return await fn(user);
  } catch (e) {
    console.error(e);
    return fail(e instanceof Error ? e.message : "Something went wrong", 500);
  }
}
