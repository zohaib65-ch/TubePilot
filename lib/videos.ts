import "server-only";
import { connectDB } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { Video, type VideoDoc, type VideoStatus } from "@/lib/models/Video";
import type { UserDoc } from "@/lib/models/User";
import type { Privacy } from "@/lib/constants";

export type VideoView = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  hasFile: boolean;
  promptId: string | null;
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  madeForKids: boolean;
  status: VideoStatus;
  error: string;
  youtubeId: string;
  createdAt: string;
  uploadedAt: string | null;
};

export function youtubeUrl(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

export function youtubeThumbnail(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

// An upload that has been "uploading" this long almost certainly died with the server.
export const STALE_UPLOAD_MS = 30 * 60 * 1000;

export function toVideoView(v: VideoDoc): VideoView {
  const stale =
    v.status === "uploading" &&
    (!v.uploadStartedAt || Date.now() - new Date(v.uploadStartedAt).getTime() > STALE_UPLOAD_MS);
  return {
    id: v._id.toString(),
    originalName: v.originalName,
    mimeType: v.mimeType,
    size: v.size,
    hasFile: Boolean(v.fileName),
    promptId: v.promptId ? v.promptId.toString() : null,
    title: v.title,
    description: v.description,
    tags: v.tags,
    privacy: v.privacy as Privacy,
    madeForKids: v.madeForKids,
    status: stale ? "failed" : (v.status as VideoStatus),
    error: stale ? "The upload was interrupted. Please try again." : v.error,
    youtubeId: v.youtubeId,
    createdAt: new Date(v.createdAt).toISOString(),
    uploadedAt: v.uploadedAt ? new Date(v.uploadedAt).toISOString() : null,
  };
}

export async function getVideo(user: UserDoc, id: string): Promise<VideoDoc | null> {
  await connectDB();
  return Video.findOne({ _id: id, userId: user._id }).lean<VideoDoc>();
}

export async function listVideos(user: UserDoc, opts: { limit?: number; uploadedOnly?: boolean } = {}) {
  await connectDB();
  const query = Video.find({ userId: user._id, ...(opts.uploadedOnly ? { status: "uploaded" } : {}) }).sort(
    opts.uploadedOnly ? { uploadedAt: -1 } : { createdAt: -1 },
  );
  if (opts.limit) query.limit(opts.limit);
  const docs = await query.lean<VideoDoc[]>();
  return docs.map(toVideoView);
}

export async function getUploadStats(user: UserDoc) {
  await connectDB();
  const today = dayKey(user.settings.timezone);
  const [uploadedToday, totalUploaded, drafts] = await Promise.all([
    Video.countDocuments({ userId: user._id, status: "uploaded", uploadedDay: today }),
    Video.countDocuments({ userId: user._id, status: "uploaded" }),
    Video.countDocuments({ userId: user._id, status: { $in: ["draft", "failed"] } }),
  ]);
  return { uploadedToday, totalUploaded, drafts };
}
