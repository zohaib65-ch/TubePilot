"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { importFromLinkAction } from "@/lib/actions/videos";

export function ImportFromLink() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");
    startTransition(async () => {
      try {
        const res = await importFromLinkAction(url);
        if (res.ok) {
          router.push(`/upload/${res.data.id}`);
        } else {
          console.error("[TubePilot Import Error]", res.error);
          setError(res.error);
        }
      } catch (err) {
        console.error("[TubePilot Import Exception]", err);
        setError(err instanceof Error ? err.message : "Failed to import video.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" /> Import from a Google Flow link
        </CardTitle>
        <CardDescription>
          In Google Flow, click <strong>Share</strong> on your video and paste the link here. TubePilot downloads that
          exact video.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://flow.google.com/shared/video/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending}
            aria-invalid={Boolean(error)}
            className="h-10"
          />
          <Button type="submit" size="lg" className="h-10 shrink-0" disabled={pending || !url.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {pending ? "Importing…" : "Import video"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
