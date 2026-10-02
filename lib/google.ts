import "server-only";
import { OAuth2Client } from "google-auth-library";
import { youtube, type youtube_v3 } from "@googleapis/youtube";
import { env } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/crypto";
import { User, type UserDoc } from "@/lib/models/User";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function redirectUri() {
  return new URL("/api/auth/google/callback", env().APP_URL).toString();
}

export function oauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  return new OAuth2Client({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(),
  });
}

/** An OAuth client for the user that persists refreshed access tokens. */
export function userOAuthClient(user: UserDoc) {
  if (!user.tokens?.refreshToken) {
    throw new YouTubeAuthError();
  }
  const client = oauthClient();
  client.setCredentials({
    refresh_token: decrypt(user.tokens.refreshToken),
    access_token: decrypt(user.tokens.accessToken ?? "") || undefined,
    expiry_date: user.tokens.expiryDate || undefined,
  });
  client.on("tokens", (tokens) => {
    const update: Record<string, unknown> = {};
    if (tokens.access_token) update["tokens.accessToken"] = encrypt(tokens.access_token);
    if (tokens.expiry_date) update["tokens.expiryDate"] = tokens.expiry_date;
    if (tokens.refresh_token) update["tokens.refreshToken"] = encrypt(tokens.refresh_token);
    if (Object.keys(update).length) {
      User.updateOne({ _id: user._id }, { $set: update }).catch((err) =>
        console.error("[google] failed to persist refreshed tokens", err),
      );
    }
  });
  return client;
}

export function youtubeClient(auth: OAuth2Client): youtube_v3.Youtube {
  return youtube({ version: "v3", auth });
}

export async function fetchOwnChannel(auth: OAuth2Client) {
  const res = await youtubeClient(auth).channels.list({ part: ["snippet"], mine: true });
  const channel = res.data.items?.[0];
  if (!channel?.id) return null;
  return {
    id: channel.id,
    title: channel.snippet?.title ?? "",
    thumbnail:
      channel.snippet?.thumbnails?.default?.url ?? channel.snippet?.thumbnails?.medium?.url ?? "",
  };
}

export class YouTubeAuthError extends Error {
  constructor() {
    super("Your YouTube connection has expired. Reconnect your channel in Settings.");
    this.name = "YouTubeAuthError";
  }
}

/** Turns Google API errors into a message that is safe and useful to show. */
export function describeGoogleError(err: unknown): string {
  if (err instanceof YouTubeAuthError) return err.message;
  const e = err as {
    message?: string;
    response?: { data?: { error?: string | { message?: string; errors?: { reason?: string }[] } } };
  };
  const data = e.response?.data?.error;
  if (data === "invalid_grant" || e.message?.includes("invalid_grant")) {
    return new YouTubeAuthError().message;
  }
  if (typeof data === "object" && data) {
    const reason = data.errors?.[0]?.reason;
    if (reason === "quotaExceeded") return "YouTube API quota exceeded for today. Try again tomorrow.";
    if (reason === "uploadLimitExceeded") return "Your channel has reached YouTube's upload limit. Try again later.";
    if (data.message) return data.message;
  }
  return e.message || "Something went wrong talking to YouTube.";
}
