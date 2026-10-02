"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <TriangleAlert className="size-8 text-amber-500" />
        <div className="space-y-1">
          <p className="font-medium">Something went wrong</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Check that MongoDB is reachable and your environment variables are set, then try again.
          </p>
        </div>
        <Button variant="outline" onClick={() => retry()}>
          <RefreshCw /> Try again
        </Button>
      </CardContent>
    </Card>
  );
}
