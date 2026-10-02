import "server-only";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { generateFlowPrompts } from "@/lib/gemini";
import { PROMPTS_PER_DAY } from "@/lib/constants";
import { Prompt, type PromptDoc } from "@/lib/models/Prompt";
import type { UserDoc } from "@/lib/models/User";

export type PromptView = {
  id: string;
  day: string;
  slot: number;
  topic: string;
  prompt: string;
  used: boolean;
};

export function toPromptView(p: PromptDoc): PromptView {
  return {
    id: p._id.toString(),
    day: p.day,
    slot: p.slot,
    topic: p.topic,
    prompt: p.prompt,
    used: Boolean(p.usedAt),
  };
}

const STOP_WORDS = new Set(["a", "an", "the", "of", "and", "in", "on", "at", "to", "s"]);

/** Normalizes a topic so trivially different wordings count as the same idea. */
export function topicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(" ");
}

function isDuplicateKeyError(err: unknown) {
  return (err as { code?: number })?.code === 11000;
}

type Candidate = { topic: string; topicKey: string; prompt: string };

/** Asks Gemini for `count` prompts whose topics have never been used before. */
async function generateUniqueCandidates(
  user: UserDoc,
  count: number,
  extraAvoid: string[] = [],
): Promise<Candidate[]> {
  const history = await Prompt.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .select({ topic: 1, topicKey: 1 })
    .lean();
  const usedKeys = new Set(history.map((p) => p.topicKey));
  const recentTopics = history.slice(0, 150).map((p) => p.topic);

  const picked: Candidate[] = [];
  const rejected: string[] = [];
  for (let attempt = 0; attempt < 3 && picked.length < count; attempt++) {
    const generated = await generateFlowPrompts({
      count: count - picked.length,
      channelNiche: user.settings.channelNiche,
      avoidTopics: recentTopics,
      avoidAlso: [...extraAvoid, ...rejected, ...picked.map((p) => p.topic)],
    });
    for (const g of generated) {
      const key = topicKey(g.topic);
      if (!key || usedKeys.has(key)) {
        rejected.push(g.topic);
        continue;
      }
      usedKeys.add(key);
      picked.push({ topic: g.topic, topicKey: key, prompt: g.prompt });
      if (picked.length === count) break;
    }
  }
  if (picked.length < count) {
    throw new Error("Couldn't come up with enough new, unique prompts. Please try again.");
  }
  return picked;
}

// Prevents duplicate Gemini calls when the same day is requested concurrently.
const inflight = new Map<string, Promise<void>>();

async function fillMissingSlots(user: UserDoc, day: string, missing: number[]) {
  const candidates = await generateUniqueCandidates(user, missing.length);
  for (const [i, slot] of missing.entries()) {
    try {
      await Prompt.create({ userId: user._id, day, slot, ...candidates[i] });
    } catch (err) {
      // Another request already filled this slot.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}

/** Today's 3 prompts, generating any that don't exist yet. */
export async function getTodayPrompts(user: UserDoc): Promise<PromptView[]> {
  await connectDB();
  const day = dayKey(user.settings.timezone);
  const load = () =>
    Prompt.find({ userId: user._id, day, status: "active" }).sort({ slot: 1 }).lean<PromptDoc[]>();

  let prompts = await load();
  const missing = Array.from({ length: PROMPTS_PER_DAY }, (_, i) => i + 1).filter(
    (slot) => !prompts.some((p) => p.slot === slot),
  );
  if (missing.length) {
    const lockKey = `${user._id}:${day}`;
    let job = inflight.get(lockKey);
    if (!job) {
      job = fillMissingSlots(user, day, missing).finally(() => inflight.delete(lockKey));
      inflight.set(lockKey, job);
    }
    await job;
    prompts = await load();
  }
  return prompts.map(toPromptView);
}

/** Replaces one of today's prompts with a brand-new one. The old one is kept as "replaced". */
export async function regeneratePrompt(user: UserDoc, promptId: string): Promise<PromptView> {
  await connectDB();
  const current = await Prompt.findOne({ _id: promptId, userId: user._id, status: "active" }).lean<PromptDoc>();
  if (!current) throw new Error("Prompt not found.");
  if (current.day !== dayKey(user.settings.timezone)) {
    throw new Error("Only today's prompts can be regenerated.");
  }

  const [candidate] = await generateUniqueCandidates(user, 1, [current.topic]);

  await Prompt.updateOne({ _id: current._id }, { $set: { status: "replaced" } });
  try {
    const created = await Prompt.create({
      userId: user._id,
      day: current.day,
      slot: current.slot,
      ...candidate,
    });
    return toPromptView(created.toObject() as PromptDoc);
  } catch (err) {
    await Prompt.updateOne({ _id: current._id }, { $set: { status: "active" } }).catch(() => {});
    throw err;
  }
}

export async function markPromptUsed(userId: Types.ObjectId, promptId: Types.ObjectId | null | undefined) {
  if (!promptId) return;
  await Prompt.updateOne({ _id: promptId, userId, usedAt: null }, { $set: { usedAt: new Date() } });
}
