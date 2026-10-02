import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DEFAULT_CHANNEL_NICHE } from "@/lib/constants";

const UserSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    name: { type: String, default: "" },
    picture: { type: String, default: "" },
    channel: {
      id: { type: String, default: "" },
      title: { type: String, default: "" },
      thumbnail: { type: String, default: "" },
    },
    // OAuth tokens, encrypted at rest (see lib/crypto.ts).
    tokens: {
      refreshToken: { type: String, default: "" },
      accessToken: { type: String, default: "" },
      expiryDate: { type: Number, default: 0 },
      scope: { type: String, default: "" },
    },
    settings: {
      channelNiche: { type: String, default: DEFAULT_CHANNEL_NICHE },
      timezone: { type: String, default: "UTC" },
      categoryId: { type: String, default: "24" },
    },
  },
  { timestamps: true },
);

type UserFields = InferSchemaType<typeof UserSchema>;

// Nested paths always receive their defaults, so these objects are never missing.
export type UserDoc = Omit<UserFields, "settings" | "channel" | "tokens"> & {
  _id: mongoose.Types.ObjectId;
  settings: NonNullable<UserFields["settings"]>;
  channel: NonNullable<UserFields["channel"]>;
  tokens: NonNullable<UserFields["tokens"]>;
};

export const User: Model<UserFields> =
  mongoose.models.User ?? mongoose.model("User", UserSchema);
