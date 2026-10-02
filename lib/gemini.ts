import "server-only";
import { ApiError, GoogleGenAI, FileState, createPartFromUri, createUserContent } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import { TAGS_TOTAL_MAX, tagsLength } from "@/lib/constants";
import { GeneratedPromptsSchema, MetadataSchema, type Metadata } from "@/lib/schemas";

let client: GoogleGenAI | undefined;
function ai() {
  return (client ??= new GoogleGenAI({ apiKey: env().GEMINI_API_KEY }));
}

/** Overloaded, rate-limited or briefly unavailable — worth retrying. */
function isTransient(err: unknown): boolean {
  return err instanceof ApiError && [429, 500, 502, 503, 504].includes(err.status);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries transient Gemini failures with backoff (about 1s, 3s, 7s). */
async function retryTransient<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || i >= attempts) throw err;
      const delay = 2 ** i * 500 + Math.random() * 500;
      console.warn(`[gemini] ${label}: ${(err as ApiError).status}, retrying in ${Math.round(delay)}ms (${i}/${attempts - 1})`);
      await pause(delay);
    }
  }
}

/** Converts Gemini API failures into messages that are safe and useful to show. */
function friendlyError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error(String(err));
  if (isTransient(err)) {
    console.warn("[gemini] gave up after retries:", err.status);
    return err.status === 429
      ? new Error("Gemini rate limit reached. Wait a minute and try again.")
      : new Error("Gemini is very busy right now. Please try again in a minute.");
  }
  console.error("[gemini]", err.message);
  if (err.message.includes("API_KEY_INVALID") || err.status === 401 || err.status === 403) {
    return new Error("Gemini rejected the API key. Check GEMINI_API_KEY in your environment.");
  }
  if (err.status === 404) return new Error(`Gemini model "${env().GEMINI_MODEL}" was not found. Check GEMINI_MODEL.`);
  return new Error("Gemini couldn't process the request. Please try again.");
}

type GenerateRequest = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/**
 * Calls the configured model, retrying when it's overloaded. If it stays overloaded,
 * tries GEMINI_FALLBACK_MODEL once before giving up.
 */
async function generateWithFallback(request: Omit<GenerateRequest, "model">) {
  const { GEMINI_MODEL, GEMINI_FALLBACK_MODEL } = env();
  try {
    return await retryTransient(GEMINI_MODEL, () => ai().models.generateContent({ ...request, model: GEMINI_MODEL }));
  } catch (err) {
    if (!isTransient(err) || !GEMINI_FALLBACK_MODEL || GEMINI_FALLBACK_MODEL === GEMINI_MODEL) throw err;
    console.warn(`[gemini] ${GEMINI_MODEL} is overloaded, falling back to ${GEMINI_FALLBACK_MODEL}`);
    try {
      return await retryTransient(GEMINI_FALLBACK_MODEL, () =>
        ai().models.generateContent({ ...request, model: GEMINI_FALLBACK_MODEL }),
      );
    } catch {
      throw err; // report the original model's failure
    }
  }
}

async function withFriendlyErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw friendlyError(err);
  }
}

function jsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Calls Gemini in JSON mode and validates the result with Zod.
 * Retries once, feeding the validation error back to the model.
 */
async function generateJson<T extends z.ZodType>(
  schema: T,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  systemInstruction: string,
  temperature: number,
): Promise<z.infer<T>> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateWithFallback({
      contents,
      config: {
        systemInstruction: lastError
          ? `${systemInstruction}\n\nYour previous answer was invalid: ${lastError}. Return valid JSON that matches the schema exactly.`
          : systemInstruction,
        temperature,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(schema),
      },
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text ?? "");
    } catch {
      lastError = "the response was not valid JSON";
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastError = z.prettifyError(result.error);
  }
  throw new Error(`Gemini returned an invalid response (${lastError}). Please try again.`);
}

// ---------------------------------------------------------------------------
// Daily Google Flow prompts
// ---------------------------------------------------------------------------

const PROMPT_SYSTEM = `You are a creative director for a YouTube Shorts channel. You write video-generation prompts that the creator pastes directly into Google Labs Flow (Veo) to generate a clip.

Every prompt you write must:
- Be self-contained, written in plain English prose, ready to paste into Google Flow with no edits.
- Describe ONE short, vertical (9:16) clip of about 8 seconds with a clear hook in the first second and a fun payoff at the end.
- Specify: the main character(s) and their look, the setting, the action beat by beat, camera framing and movement, lighting, color palette, visual style (e.g. Pixar-style 3D animation, photoreal, claymation), mood, and audio (sound effects, ambient sound, music style, and any short spoken line in quotes).
- Be entertaining, family-friendly, and original. No real people, celebrities, brands, logos, copyrighted characters, on-screen text, or anything violent or scary.
- Avoid markdown, bullet points, headings, and placeholders.

Each "topic" is a short 2-6 word label (e.g. "Kitten's first snowfall").`;

export async function generateFlowPrompts(opts: {
  count: number;
  channelNiche: string;
  avoidTopics: string[];
  avoidAlso?: string[];
}) {
  const avoid = [...opts.avoidTopics, ...(opts.avoidAlso ?? [])];
  const request = [
    `Channel description: ${opts.channelNiche}`,
    `Write exactly ${opts.count} new video prompt${opts.count > 1 ? "s" : ""} for this channel.`,
    opts.count > 1
      ? "Each prompt must have a clearly different concept, character, and setting from the others."
      : "",
    avoid.length
      ? `These topics were already used. Do NOT repeat them or make close variations:\n${avoid.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await withFriendlyErrors(() => generateJson(GeneratedPromptsSchema, request, PROMPT_SYSTEM, 1.1));
  return result.prompts;
}

// ---------------------------------------------------------------------------
// YouTube metadata from an uploaded video
// ---------------------------------------------------------------------------

const METADATA_SYSTEM = `You write YouTube metadata for short-form videos (YouTube Shorts). Watch the video carefully and base everything on what actually happens in it.

Return:
- "title": catchy, curiosity-driven, under 70 characters when possible (max 100), 1-2 fitting emoji are fine, no clickbait lies, no "<" or ">".
- "description": 2-4 short, friendly paragraphs: a hook line, what happens in the video, a call to subscribe. End with 3-5 relevant hashtags including #Shorts. No "<" or ">". Max 5000 characters.
- "tags": 10-20 relevant search tags, most specific first, without "#", each under 30 characters.`;

type MetadataOptions = { filePath: string; mimeType: string; channelNiche: string };

/** Uploads the video to Gemini, lets it watch the clip, and returns a title, description and tags. */
export function generateVideoMetadata(opts: MetadataOptions): Promise<Metadata> {
  return withFriendlyErrors(() => metadataFromVideo(opts));
}

async function metadataFromVideo(opts: MetadataOptions): Promise<Metadata> {
  const uploaded = await retryTransient("files.upload", () =>
    ai().files.upload({
      file: opts.filePath,
      config: { mimeType: opts.mimeType, displayName: "tubepilot-video" },
    }),
  );
  const name = uploaded.name;
  if (!name) throw new Error("Gemini file upload failed.");

  try {
    // Videos must finish processing before they can be used.
    let file = uploaded;
    const deadline = Date.now() + 3 * 60 * 1000;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) throw new Error("Gemini took too long to process the video.");
      await pause(2000);
      file = await retryTransient("files.get", () => ai().files.get({ name }));
    }
    if (file.state !== FileState.ACTIVE || !file.uri) {
      throw new Error("Gemini could not process this video file.");
    }

    const context = [
      `Channel description: ${opts.channelNiche}`,
      "Write the YouTube title, description and tags for this video.",
    ].join("\n\n");

    const metadata = await generateJson(
      MetadataSchema,
      createUserContent([createPartFromUri(file.uri, file.mimeType ?? opts.mimeType), context]),
      METADATA_SYSTEM,
      0.8,
    );
    return cleanMetadata(metadata);
  } finally {
    ai()
      .files.delete({ name })
      .catch(() => {});
  }
}

function cleanMetadata(m: Metadata): Metadata {
  const strip = (s: string) => s.replace(/[<>]/g, "").trim();
  const tags: string[] = [];
  for (const raw of m.tags) {
    const tag = strip(raw.replace(/^#/, ""));
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    if (tagsLength([...tags, tag]) > TAGS_TOTAL_MAX) break;
    tags.push(tag);
  }
  return { title: strip(m.title), description: strip(m.description), tags };
}
