"use server";

import { revalidatePath } from "next/cache";
import { isValidObjectId } from "mongoose";
import { requireUser } from "@/lib/session";
import { regeneratePrompt, type PromptView } from "@/lib/prompts";
import { errorMessage, type ActionResult } from "@/lib/actions/result";

export async function regeneratePromptAction(promptId: string): Promise<ActionResult<PromptView>> {
  const user = await requireUser();
  if (!isValidObjectId(promptId)) return { ok: false, error: "Prompt not found." };
  try {
    const prompt = await regeneratePrompt(user, promptId);
    revalidatePath("/");
    revalidatePath("/prompts");
    return { ok: true, data: prompt };
  } catch (err) {
    console.error("[prompts] regenerate failed", err);
    return { ok: false, error: errorMessage(err, "Couldn't generate a new prompt. Please try again.") };
  }
}
