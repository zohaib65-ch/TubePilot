"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { isValidTimezone } from "@/lib/dates";
import { oauthClient } from "@/lib/google";
import { SettingsSchema, type SettingsInput } from "@/lib/schemas";
import { clearSession, requireUser } from "@/lib/session";
import { User } from "@/lib/models/User";
import type { ActionResult } from "@/lib/actions/result";

export async function saveSettingsAction(input: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  if (!isValidTimezone(parsed.data.timezone)) return { ok: false, error: "Unknown timezone." };

  await connectDB();
  await User.updateOne({ _id: user._id }, { $set: { settings: parsed.data } });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function signOutAction() {
  await clearSession();
  redirect("/login");
}

/** Revokes TubePilot's access to the YouTube channel and signs out. */
export async function disconnectYouTubeAction() {
  const user = await requireUser();
  const refreshToken = decrypt(user.tokens?.refreshToken ?? "");
  if (refreshToken) {
    await oauthClient()
      .revokeToken(refreshToken)
      .catch((err) => console.error("[settings] token revoke failed", err));
  }
  await connectDB();
  await User.updateOne(
    { _id: user._id },
    { $set: { "tokens.refreshToken": "", "tokens.accessToken": "", "tokens.expiryDate": 0 } },
  );
  await clearSession();
  redirect("/login");
}
