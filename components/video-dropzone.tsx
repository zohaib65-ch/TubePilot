"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ACCEPT = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo"];

type State =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; previewUrl: string; percent: number }
  | { phase: "error"; message: string };

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function VideoDropzone({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<State>({ phase: "idle" });

  const previewUrl = state.phase === "uploading" ? state.previewUrl : null;
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  function start(file: File) {
    if (!ACCEPT.includes(file.type)) {
      setState({ phase: "error", message: "That isn't a supported video. Use MP4, MOV or WebM." });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setState({ phase: "error", message: `Video is larger than the ${maxMb} MB limit.` });
      return;
    }

    const url = URL.createObjectURL(file);
    setState({ phase: "uploading", file, previewUrl: url, percent: 0 });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/videos");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setState((s) => (s.phase === "uploading" ? { ...s, percent } : s));
      }
    };
    xhr.onload = () => {
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && body.id) {
        router.push(`/upload/${body.id}`);
      } else {
        setState({ phase: "error", message: body.error ?? "Upload failed. Please try again." });
      }
    };
    xhr.onerror = () => setState({ phase: "error", message: "Network error. Check your connection and try again." });
    xhr.send(file);
  }

  function cancel() {
    xhrRef.current?.abort();
    setState({ phase: "idle" });
  }

  if (state.phase === "uploading") {
    const done = state.percent >= 100;
    return (
      <Card>
        <CardContent className="space-y-4">
          <video
            src={state.previewUrl}
            className="mx-auto max-h-[60vh] w-full rounded-lg bg-black object-contain"
            controls
            muted
            playsInline
          />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate font-medium">{state.file.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {done ? "Processing…" : `${state.percent}%`} · {formatSize(state.file.size)}
                </span>
              </div>
              <Progress value={state.percent} className="h-2" />
            </div>
            {done ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Button variant="ghost" size="icon" onClick={cancel} aria-label="Cancel upload">
                <X />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) start(file);
        }}
        className={cn(
          "flex min-h-80 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/40",
        )}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-muted">
          <CloudUpload className="size-8 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-medium">
            Drop your video here or <span className="text-primary underline underline-offset-4">Browse</span>
          </p>
          <p className="text-sm text-muted-foreground">MP4, MOV or WebM · up to {maxMb} MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) start(file);
          }}
        />
      </div>
      {state.phase === "error" && <p className="text-sm text-destructive">{state.message}</p>}
    </div>
  );
}
