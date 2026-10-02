import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PRIVACY_OPTIONS } from "@/lib/constants";

export const VIDEO_STATUSES = ["draft", "uploading", "uploaded", "failed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

const VideoSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    /** File name inside UPLOAD_DIR. Cleared once the file is deleted after upload. */
    fileName: { type: String, default: "" },
    promptId: { type: Schema.Types.ObjectId, ref: "Prompt", default: null },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    tags: { type: [String], default: [] },
    privacy: { type: String, enum: PRIVACY_OPTIONS, default: "public" },
    madeForKids: { type: Boolean, default: true },
    status: { type: String, enum: VIDEO_STATUSES, default: "draft" },
    error: { type: String, default: "" },
    uploadStartedAt: { type: Date, default: null },
    youtubeId: { type: String, default: "" },
    uploadedAt: { type: Date, default: null },
    /** Calendar day of the YouTube upload in the user's timezone. */
    uploadedDay: { type: String, default: "" },
  },
  { timestamps: true },
);

VideoSchema.index({ userId: 1, status: 1, uploadedDay: 1 });
VideoSchema.index({ userId: 1, createdAt: -1 });

export type VideoDoc = InferSchemaType<typeof VideoSchema> & { _id: mongoose.Types.ObjectId };

export const Video: Model<InferSchemaType<typeof VideoSchema>> =
  mongoose.models.Video ?? mongoose.model("Video", VideoSchema);
