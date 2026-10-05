"use server";

import { revalidatePath } from "next/cache";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { generateVideoMetadata } from "@/lib/gemini";
import { DraftSchema, type DraftInput, type Metadata } from "@/lib/schemas";
import { requireUser } from "@/lib/session";
import { deleteVideoFile, videoPath } from "@/lib/storage";
import { getVideo } from "@/lib/videos";
import { importVideoFromLink } from "@/lib/import-link";
import { IngestError } from "@/lib/ingest";
import { Video } from "@/lib/models/Video";
import { errorMessage, type ActionResult } from "@/lib/actions/result";

/** Gemini watches the uploaded video and writes its title, description and tags. */
export async function generateMetadataAction(videoId: string): Promise<ActionResult<Metadata>> {
  const user = await requireUser();
  const video = isValidObjectId(videoId) ? await getVideo(user, videoId) : null;
  if (!video?.fileName) return { ok: false, error: "Video file not found." };

  try {
    const metadata = await generateVideoMetadata({
      filePath: videoPath(video.fileName),
      mimeType: video.mimeType,
      channelNiche: user.settings.channelNiche,
    });
    return { ok: true, data: metadata };
  } catch (err) {
    console.error("[metadata] generation failed", err);
    return { ok: false, error: errorMessage(err, "Couldn't generate the video details. Please try again.") };
  }
}

/** Saves edits without uploading, so nothing is lost if the page is closed. */
export async function saveDraftAction(videoId: string, input: DraftInput): Promise<ActionResult> {
  const user = await requireUser();
  if (!isValidObjectId(videoId)) return { ok: false, error: "Video not found." };
  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  await connectDB();
  const res = await Video.updateOne(
    { _id: videoId, userId: user._id, status: { $in: ["draft", "failed"] } },
    { $set: parsed.data },
  );
  if (!res.matchedCount) return { ok: false, error: "This video can no longer be edited." };
  revalidatePath("/history");
  return { ok: true, data: undefined };
}

export async function deleteVideoAction(videoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isValidObjectId(videoId)) return { ok: false, error: "Video not found." };
  await connectDB();
  // Uploaded videos stay in history; only drafts (and their local files) can be removed.
  const video = await Video.findOneAndDelete({
    _id: videoId,
    userId: user._id,
    status: { $in: ["draft", "failed"] },
  }).lean();
  if (!video) return { ok: false, error: "Only drafts can be deleted." };
  await deleteVideoFile(video.fileName);
  revalidatePath("/history");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/** Downloads a Google Flow video link and creates a draft for it. */
export async function importFromLinkAction(url: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const id = await importVideoFromLink(user, url);
    revalidatePath("/history");
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof IngestError) return { ok: false, error: err.message };
    console.error("[import] failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't import that video: ${detail}` };
  }
}
