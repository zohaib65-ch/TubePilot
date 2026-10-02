import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPES, oauthClient } from "@/lib/google";
import { sign } from "@/lib/crypto";
import { secureCookies } from "@/lib/env";
import { isValidTimezone } from "@/lib/dates";
import { OAUTH_STATE_COOKIE } from "@/lib/session";

/** Starts Google OAuth. `?tz=` carries the browser timezone for first-time setup. */
export async function GET(request: NextRequest) {
  const state = randomBytes(24).toString("base64url");
  const tz = request.nextUrl.searchParams.get("tz") ?? "";

  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, sign(JSON.stringify({ state, tz: isValidTimezone(tz) ? tz : "" })), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 10 * 60,
  });
  return res;
}
