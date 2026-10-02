import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PromptCards } from "@/components/prompt-cards";
import { PromptsSkeleton } from "@/components/prompts-skeleton";
import { RetryCard } from "@/components/retry-card";
import { dayKey, formatDay } from "@/lib/dates";
import { getTodayPrompts, type PromptView } from "@/lib/prompts";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Daily Prompts" };

export default async function PromptsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Daily Prompts"
        description={`${formatDay(dayKey(user.settings.timezone))} · Copy a prompt into Google Labs Flow to create today's video.`}
      />
      <Suspense fallback={<PromptsSkeleton />}>
        <TodayPrompts />
      </Suspense>
    </>
  );
}

async function TodayPrompts() {
  const user = await requireUser();
  let prompts: PromptView[];
  try {
    prompts = await getTodayPrompts(user);
  } catch (err) {
    console.error("[prompts] daily generation failed", err);
    return (
      <RetryCard
        title="Couldn't generate today's prompts"
        message={err instanceof Error ? err.message : "Gemini is unavailable right now."}
      />
    );
  }
  return <PromptCards initialPrompts={prompts} />;
}
