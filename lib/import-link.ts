import "server-only";
import { z } from "zod";
import { IngestError, ingestVideo, maxUploadBytes, tooLargeError } from "@/lib/ingest";
import { ALLOWED_VIDEO_TYPES } from "@/lib/storage";
import type { UserDoc } from "@/lib/models/User";

// Only Google hosts that serve Flow videos. Keeping this an allowlist stops the server
// from being used to fetch arbitrary (or internal) URLs.
const ALLOWED_HOSTS = [
  "flow.google.com",
  "flow-content.google",
  "labs.google",
  "storage.googleapis.com",
  "googleusercontent.com",
];

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const NOT_A_FILE =
  "That link opens a Google Flow page, not a video. In Flow, use Share on the video and paste its share link (flow.google.com/shared/video/…).";

const SHARE_PATH = /^\/shared\/video\/([0-9a-f-]{36})\/?$/i;

// The part of Flow's shared-media response we need.
const SharedMediaSchema = z.object({
  primaryMedia: z.object({
    video: z.object({ generatedVideo: z.object({ fifeUrl: z.url() }) }),
  }),
});

/**
 * Turns a Flow share link (flow.google.com/shared/video/<id>) into the signed URL of the
 * video file, the same way Flow's public share page does. Returns null for other links.
 * Note: this relies on how Flow's share page works today, not on a documented API.
 */
async function resolveFlowShareLink(url: URL): Promise<URL | null> {
  const shareId = url.hostname === "flow.google.com" ? SHARE_PATH.exec(url.pathname)?.[1] : undefined;
  if (!shareId) return null;

  const changed = new IngestError(
    "Couldn't read this Flow share link (Google may have changed Flow). Download the video from Flow and upload the file instead.",
    502,
  );
  try {
    // The share page embeds the public web key its own player uses.
    const page = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const key = /AIzaSy[A-Za-z0-9_-]{33}/.exec(await page.text())?.[0];
    if (!key) throw changed;

    const api = await fetch(
      `https://aisandbox-pa.googleapis.com/v1/flowMedia/${shareId}:getSharedMedia?key=${key}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (api.status === 403 || api.status === 404) {
      throw new IngestError(
        "This Flow video isn't shared, or the share link was removed. In Flow, open Share on the video and copy a fresh link.",
        400,
      );
    }
    const parsed = SharedMediaSchema.safeParse(await api.json().catch(() => null));
    if (!api.ok || !parsed.success) throw changed;
    return new URL(parsed.data.primaryMedia.video.generatedVideo.fifeUrl);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    console.error("[import] resolving Flow share link failed", err);
    throw changed;
  }
}

function fileNameFrom(res: Response, url: URL) {
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const fromHeader = match ? decodeURIComponent(match[1] ?? match[2]) : "";
  const fromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  return fromHeader || (/\.\w{2,4}$/.test(fromPath) ? fromPath : "google-flow-video.mp4");
}

/** Downloads a Google Flow video link and creates a draft from it. Returns the video id. */
export async function importVideoFromLink(user: UserDoc, rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new IngestError("That doesn't look like a link. Paste the full https:// address.", 400);
  }
  url = (await resolveFlowShareLink(url)) ?? url;

  // Follow redirects by hand so every hop is checked against the allowlist.
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" || !isAllowedHost(url.hostname)) {
      // A Flow link that bounces to Google sign-in (or elsewhere) is a page, not the file.
      if (hop > 0) throw new IngestError(NOT_A_FILE, 400);
      throw new IngestError("Only Google Flow video links are supported.", 400);
    }
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5 * 60 * 1000) });
    } catch {
      throw new IngestError("Couldn't download the video from that link. Please try again.", 502);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400)) {
    throw new IngestError("That link redirects too many times.", 400);
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (/expired/i.test(body) || res.status === 400 || res.status === 403) {
      throw new IngestError(
        "Google refused the download. The link has probably expired, or it only works while signed in to Flow. Copy a fresh video link from Flow and try again.",
        400,
      );
    }
    throw new IngestError(`Google returned an error (${res.status}) for that link.`, 502);
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType.startsWith("text/") || contentType.includes("json")) {
    await res.body.cancel().catch(() => {});
    throw new IngestError(NOT_A_FILE, 400);
  }
  if (Number(res.headers.get("content-length") ?? 0) > maxUploadBytes()) {
    await res.body.cancel().catch(() => {});
    throw tooLargeError();
  }

  return ingestVideo(user, {
    body: res.body,
    // Storage often labels files application/octet-stream; those are sniffed instead.
    mimeType: ALLOWED_VIDEO_TYPES[contentType] ? contentType : null,
    originalName: fileNameFrom(res, url),
  });
}
