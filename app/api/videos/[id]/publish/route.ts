import { createReadStream } from "node:fs";
import { isValidObjectId } from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { describeGoogleError, userOAuthClient, youtubeClient } from "@/lib/google";
import { markPromptUsed } from "@/lib/prompts";
import { PublishSchema, type PublishEvent } from "@/lib/schemas";
import { getCurrentUser } from "@/lib/session";
import { deleteVideoFile, videoPath } from "@/lib/storage";
import { STALE_UPLOAD_MS, youtubeUrl } from "@/lib/videos";
import { Video } from "@/lib/models/Video";

/**
 * Uploads a video to YouTube as Public. Only runs when the request carries `confirmed: true`,
 * which the UI sends from the explicit confirmation dialog.
 * Responds with newline-delimited JSON progress events.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/publish">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  const parsed = PublishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  await connectDB();
  // Atomically claim the video so a double click can never upload it twice.
  const video = await Video.findOneAndUpdate(
    {
      _id: id,
      userId: user._id,
      fileName: { $ne: "" },
      $or: [
        { status: { $in: ["draft", "failed"] } },
        { status: "uploading", uploadStartedAt: { $lt: new Date(Date.now() - STALE_UPLOAD_MS) } },
      ],
    },
    {
      $set: {
        title: input.title,
        description: input.description,
        tags: input.tags,
        privacy: "public",
        madeForKids: input.madeForKids,
        status: "uploading",
        uploadStartedAt: new Date(),
        error: "",
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!video) {
    return NextResponse.json(
      { error: "This video is already uploaded or an upload is in progress." },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: PublishEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Client went away; the upload still finishes and is saved.
        }
      };

      const run = async () => {
        let lastPercent = -1;
        try {
          const res = await youtubeClient(userOAuthClient(user)).videos.insert(
            {
              part: ["snippet", "status"],
              requestBody: {
                snippet: {
                  title: input.title,
                  description: input.description,
                  tags: input.tags,
                  categoryId: user.settings.categoryId,
                },
                status: {
                  privacyStatus: "public",
                  selfDeclaredMadeForKids: input.madeForKids,
                },
              },
              media: { mimeType: video.mimeType, body: createReadStream(videoPath(video.fileName)) },
            },
            {
              onUploadProgress: (evt: { bytesRead: number }) => {
                const percent = Math.min(99, Math.floor((evt.bytesRead / video.size) * 100));
                if (percent !== lastPercent) {
                  lastPercent = percent;
                  send({ type: "progress", percent });
                }
              },
            },
          );

          const youtubeId = res.data.id;
          if (!youtubeId) throw new Error("YouTube did not return a video ID.");

          await Video.updateOne(
            { _id: video._id },
            {
              $set: {
                status: "uploaded",
                youtubeId,
                uploadedAt: new Date(),
                uploadedDay: dayKey(user.settings.timezone),
                fileName: "",
              },
            },
          );
          await markPromptUsed(user._id, video.promptId);
          // The video now lives on YouTube; free the local disk space.
          await deleteVideoFile(video.fileName);
          send({ type: "progress", percent: 100 });
          send({ type: "done", youtubeId, url: youtubeUrl(youtubeId) });
        } catch (err) {
          console.error("[publish] YouTube upload failed", err);
          const message = describeGoogleError(err);
          await Video.updateOne({ _id: video._id }, { $set: { status: "failed", error: message } }).catch(() => {});
          send({ type: "error", message });
        } finally {
          try {
            controller.close();
          } catch {}
        }
      };
      void run();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
