import { NextResponse, type NextRequest } from "next/server";
import { allowedEmails, env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { encrypt, unsign } from "@/lib/crypto";
import { describeGoogleError, fetchOwnChannel, oauthClient } from "@/lib/google";
import { OAUTH_STATE_COOKIE, sessionCookie } from "@/lib/session";
import { User } from "@/lib/models/User";

const UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function fail(message: string) {
  const url = new URL("/login", env().APP_URL);
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth" });
  return res;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("Google sign-in was cancelled.");

  const rawState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const stored = rawState ? unsign(rawState) : null;
  const { state, tz } = stored ? (JSON.parse(stored) as { state: string; tz: string }) : { state: "", tz: "" };
  const code = params.get("code");
  if (!code || !state || params.get("state") !== state) {
    return fail("Sign-in session expired. Please try again.");
  }

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return fail("Google did not return an identity token.");

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env().GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || !profile.email_verified) {
      return fail("Your Google account email could not be verified.");
    }

    const allowed = allowedEmails();
    if (allowed.length && !allowed.includes(profile.email.toLowerCase())) {
      return fail(`${profile.email} is not allowed to use this TubePilot instance.`);
    }
    if (!tokens.scope?.split(" ").includes(UPLOAD_SCOPE)) {
      return fail("Please allow TubePilot to upload videos to YouTube when signing in.");
    }

    client.setCredentials(tokens);
    const channel = await fetchOwnChannel(client);
    if (!channel) {
      return fail("This Google account has no YouTube channel. Create one on YouTube first.");
    }

    await connectDB();
    const existing = await User.findOne({ googleId: profile.sub }).select({ _id: 1 }).lean();
    const set: Record<string, unknown> = {
      email: profile.email,
      name: profile.name ?? "",
      picture: profile.picture ?? "",
      channel,
      "tokens.accessToken": encrypt(tokens.access_token ?? ""),
      "tokens.expiryDate": tokens.expiry_date ?? 0,
      "tokens.scope": tokens.scope ?? "",
    };
    // Google only sends a refresh token on consent; keep the old one otherwise.
    if (tokens.refresh_token) set["tokens.refreshToken"] = encrypt(tokens.refresh_token);
    if (!existing && tz) set["settings.timezone"] = tz;

    const user = await User.findOneAndUpdate(
      { googleId: profile.sub },
      { $set: set },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    if (!user?.tokens?.refreshToken) {
      return fail("Google did not grant offline access. Please try signing in again.");
    }

    const res = NextResponse.redirect(new URL("/", env().APP_URL));
    const cookie = sessionCookie(user._id.toString());
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth" });
    return res;
  } catch (err) {
    console.error("[auth] Google callback failed", err);
    return fail(describeGoogleError(err));
  }
}
