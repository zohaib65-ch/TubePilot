import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PromptsSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 animate-pulse" /> Writing today&apos;s prompts with Gemini…
      </p>
      {[1, 2, 3].map((i) =>
        compact ? (
          <Skeleton key={i} className="h-12 w-full" />
        ) : (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-28 w-full" />
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
