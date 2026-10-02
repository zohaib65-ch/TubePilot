"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { regeneratePromptAction } from "@/lib/actions/prompts";
import type { PromptView } from "@/lib/prompts";

export function PromptCards({ initialPrompts }: { initialPrompts: PromptView[] }) {
  const [prompts, setPrompts] = useState(initialPrompts);

  return (
    <div className="space-y-6">
      {prompts.map((p) => (
        <PromptCard
          key={p.id}
          prompt={p}
          onReplaced={(next) => setPrompts((all) => all.map((x) => (x.slot === next.slot ? next : x)))}
        />
      ))}
    </div>
  );
}

function PromptCard({ prompt, onReplaced }: { prompt: PromptView; onReplaced: (p: PromptView) => void }) {
  const [pending, startTransition] = useTransition();

  const regenerate = () =>
    startTransition(async () => {
      const res = await regeneratePromptAction(prompt.id);
      if (res.ok) {
        onReplaced(res.data);
        toast.success(`New prompt #${prompt.slot} ready`);
      } else {
        toast.error(res.error);
      }
    });

  return (
    <Card className={pending ? "opacity-70 transition-opacity" : undefined}>
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Today&apos;s Prompt #{prompt.slot}
        </p>
        <CardTitle className="text-lg">
          <span className="text-muted-foreground font-normal">Topic:</span> {prompt.topic}
        </CardTitle>
        {prompt.used && (
          <CardAction>
            <Badge variant="secondary">
              <CircleCheck /> Uploaded
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">Google Flow Prompt</p>
        <div className="rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap select-all">
          {prompt.prompt}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/30 py-3">
        <CopyButton text={prompt.prompt} />
        <Button variant="outline" onClick={regenerate} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {pending ? "Generating…" : "Regenerate"}
        </Button>
      </CardFooter>
    </Card>
  );
}
