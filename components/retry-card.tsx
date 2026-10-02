"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown when a server-side step (e.g. prompt generation) fails, with a retry. */
export function RetryCard({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <TriangleAlert className="size-8 text-amber-500" />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
