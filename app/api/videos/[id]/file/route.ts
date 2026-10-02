import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getVideo } from "@/lib/videos";
import { videoPath } from "@/lib/storage";

/** Streams a stored video with HTTP Range support so the <video> preview can seek. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { id } = await ctx.params;
  const video = isValidObjectId(id) ? await getVideo(user, id) : null;
  if (!video?.fileName) return new Response("Not found", { status: 404 });

  const filePath = videoPath(video.fileName);
  const { size } = await stat(filePath).catch(() => ({ size: -1 }));
  if (size < 0) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": video.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { headers });
}
