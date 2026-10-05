import "server-only";
import { createWriteStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Types } from "mongoose";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { ALLOWED_VIDEO_TYPES, ensureUploadDir, uploadDir, videoPath } from "@/lib/storage";
import { Video } from "@/lib/models/Video";
import type { UserDoc } from "@/lib/models/User";

/** An ingest failure with a message that is safe to show and an HTTP status. */
export class IngestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function maxUploadBytes() {
  return env().MAX_UPLOAD_MB * 1024 * 1024;
}

export function tooLargeError() {
  return new IngestError(`Video is larger than the ${env().MAX_UPLOAD_MB} MB limit.`, 413);
}

/** Detects the container from the first bytes, for downloads served as application/octet-stream. */
async function sniffVideoType(filePath: string): Promise<string | null> {
  const handle = await open(filePath, "r");
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    if (buffer.toString("latin1", 4, 8) === "ftyp") {
      return buffer.toString("latin1", 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
    }
    if (buffer.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
    return null;
  } finally {
    await handle.close();
  }
}

/**
 * Streams a video to disk (never buffering it in memory) and creates its draft.
 * Pass `mimeType: null` when the source didn't say what it is; the file is then sniffed.
 */
export async function ingestVideo(
  user: UserDoc,
  opts: { body: ReadableStream<Uint8Array>; mimeType: string | null; originalName: string },
): Promise<string> {
  const id = new Types.ObjectId();
  const tempPath = videoPath(`${id}.part`);
  const maxBytes = maxUploadBytes();

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb(size > maxBytes ? tooLargeError() : null, chunk);
    },
  });

  try {
    await ensureUploadDir();
    await pipeline(
      Readable.fromWeb(opts.body as unknown as NodeReadableStream<Uint8Array>),
      limiter,
      createWriteStream(tempPath),
    );
    if (size === 0) throw new IngestError("The video file is empty.", 400);

    const mimeType = opts.mimeType ?? (await sniffVideoType(tempPath));
    const ext = mimeType ? ALLOWED_VIDEO_TYPES[mimeType] : undefined;
    if (!mimeType || !ext) {
      throw new IngestError("That file isn't a supported video. Use MP4, MOV or WebM.", 415);
    }

    const fileName = `${id}.${ext}`;
    await rename(tempPath, videoPath(fileName));

    await connectDB();
    await Video.create({
      _id: id,
      userId: user._id,
      originalName: opts.originalName.slice(0, 200) || `video.${ext}`,
      mimeType,
      size,
      fileName,
      privacy: "public",
      madeForKids: true,
    });
    return id.toString();
  } catch (err) {
    await rm(tempPath, { force: true });
    if (err instanceof IngestError) throw err;
    console.error("[ingest] failed to store video", err);

    const error = err as NodeJS.ErrnoException;
    if (error?.code === "EROFS") {
      throw new IngestError(
        "Server storage directory is read-only (EROFS). Serverless platforms (like Vercel) have a read-only filesystem. Set UPLOAD_DIR=/tmp or host on a persistent server (VPS, Railway, Render).",
        500,
      );
    }
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      throw new IngestError(
        `Server storage permission denied at "${uploadDir()}". Ensure the server process has write access.`,
        500,
      );
    }
    if (error?.code === "ENOSPC") {
      throw new IngestError("Server storage is out of disk space (ENOSPC).", 500);
    }

    const detail = err instanceof Error ? err.message : String(err);
    throw new IngestError(`Saving the video failed: ${detail}`, 500);
  }
}
