import { z } from "zod";
import { DESCRIPTION_MAX, TAGS_TOTAL_MAX, TITLE_MAX, tagsLength } from "@/lib/constants";

// ---- Gemini responses ----

export const GeneratedPromptSchema = z.object({
  topic: z.string().trim().min(3).max(80).describe("Short topic label, 2-6 words"),
  prompt: z
    .string()
    .trim()
    .min(200)
    .max(3000)
    .describe("The complete Google Flow video-generation prompt"),
});

export const GeneratedPromptsSchema = z.object({
  prompts: z.array(GeneratedPromptSchema).min(1),
});

/** What Gemini must return for YouTube metadata. */
export const MetadataSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  tags: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
});
export type Metadata = z.infer<typeof MetadataSchema>;

// ---- User input ----

// YouTube rejects "<" and ">" in titles, descriptions and tags.
const noAngleBrackets = (s: string) => !/[<>]/.test(s);

export const PublishSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or less`)
    .refine(noAngleBrackets, "Title can't contain < or >"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or less`)
    .refine(noAngleBrackets, "Description can't contain < or >"),
  tags: z
    .array(z.string().trim().min(1).refine(noAngleBrackets, "Tags can't contain < or >"))
    .refine((t) => tagsLength(t) <= TAGS_TOTAL_MAX, `Tags must total ${TAGS_TOTAL_MAX} characters or less`),
  madeForKids: z.boolean(),
  /** Must be explicitly true — set only by the confirmation dialog. */
  confirmed: z.literal(true, "Upload must be confirmed"),
});
export type PublishInput = z.infer<typeof PublishSchema>;

/** Newline-delimited JSON events streamed by POST /api/videos/[id]/publish. */
export type PublishEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; youtubeId: string; url: string }
  | { type: "error"; message: string };

export const DraftSchema = PublishSchema.omit({ confirmed: true }).extend({
  title: z.string().trim().max(TITLE_MAX),
});
export type DraftInput = z.infer<typeof DraftSchema>;

export const SettingsSchema = z.object({
  channelNiche: z.string().trim().min(10, "Describe your channel in a sentence or two").max(1000),
  timezone: z.string().trim().min(1),
  categoryId: z.string().regex(/^\d+$/),
});
export type SettingsInput = z.infer<typeof SettingsSchema>;
