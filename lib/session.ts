import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { connectDB } from "@/lib/db";
import { secureCookies } from "@/lib/env";
import { sign, unsign } from "@/lib/crypto";
import { User, type UserDoc } from "@/lib/models/User";

export const SESSION_COOKIE = "tp_session";
export const OAUTH_STATE_COOKIE = "tp_oauth";
const SESSION_DAYS = 30;

export function sessionCookie(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return {
    name: SESSION_COOKIE,
    value: sign(`${userId}:${exp}`),
    options: {
      httpOnly: true,
      secure: secureCookies(),
      sameSite: "lax" as const,
      path: "/",
      expires: new Date(exp),
    },
  };
}

async function sessionUserId(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const value = raw ? unsign(raw) : null;
  if (!value) return null;
  const [userId, exp] = value.split(":");
  if (!isValidObjectId(userId) || Number(exp) < Date.now()) return null;
  return userId;
}

/** The signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<UserDoc | null> => {
  const userId = await sessionUserId();
  if (!userId) return null;
  await connectDB();
  return User.findById(userId).lean<UserDoc>();
});

/** For pages and server actions: redirects to /login when signed out. */
export async function requireUser(): Promise<UserDoc> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
