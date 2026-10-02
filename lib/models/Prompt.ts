import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PromptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Calendar day in the user's timezone, e.g. "2026-10-02". */
    day: { type: String, required: true },
    /** Position on the day's list: 1, 2 or 3. */
    slot: { type: Number, required: true, min: 1, max: 3 },
    topic: { type: String, required: true },
    /** Normalized topic used to prevent the same idea from being generated twice. */
    topicKey: { type: String, required: true },
    prompt: { type: String, required: true },
    /** "replaced" prompts are kept so they are never generated again. */
    status: { type: String, enum: ["active", "replaced"], default: "active" },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Exactly one active prompt per slot per day.
PromptSchema.index(
  { userId: 1, day: 1, slot: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
// Never store the same topic twice for a user.
PromptSchema.index({ userId: 1, topicKey: 1 }, { unique: true });

export type PromptDoc = InferSchemaType<typeof PromptSchema> & { _id: mongoose.Types.ObjectId };

export const Prompt: Model<InferSchemaType<typeof PromptSchema>> =
  mongoose.models.Prompt ?? mongoose.model("Prompt", PromptSchema);
