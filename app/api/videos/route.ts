import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ALLOWED_VIDEO_TYPES } from "@/lib/storage";
import { IngestError, ingestVideo, maxUploadBytes, tooLargeError } from "@/lib/ingest";

/**
 * Receives a video as the raw request body (not multipart) and streams it to disk,
 * so large files never sit in memory.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_VIDEO_TYPES[mimeType]) {
    return NextResponse.json({ error: "Unsupported file type. Upload an MP4, MOV or WebM video." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxUploadBytes()) {
    return NextResponse.json({ error: tooLargeError().message }, { status: 413 });
  }
  if (!request.body) return NextResponse.json({ error: "No file received." }, { status: 400 });

  try {
    const id = await ingestVideo(user, {
      body: request.body,
      mimeType,
      originalName: decodeURIComponent(request.headers.get("x-file-name") ?? ""),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const e = err instanceof IngestError ? err : new IngestError("Upload failed. Please try again.", 500);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
