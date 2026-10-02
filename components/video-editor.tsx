"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, Globe, Loader2, RefreshCw, Rocket, Sparkles, Trash2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag-input";
import { deleteVideoAction, generateMetadataAction, saveDraftAction } from "@/lib/actions/videos";
import { DESCRIPTION_MAX, TAGS_TOTAL_MAX, TITLE_MAX, tagsLength } from "@/lib/constants";
import type { PublishEvent } from "@/lib/schemas";
import type { VideoView } from "@/lib/videos";
import { cn } from "@/lib/utils";

type Phase =
  | { name: "editing" }
  | { name: "publishing"; percent: number }
  | { name: "done"; youtubeId: string; url: string };

export function VideoEditor({ video, channelTitle }: { video: VideoView; channelTitle: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [tags, setTags] = useState(video.tags);
  const [madeForKids, setMadeForKids] = useState(video.madeForKids);
  const [phase, setPhase] = useState<Phase>(
    video.status === "uploaded"
      ? { name: "done", youtubeId: video.youtubeId, url: `https://www.youtube.com/watch?v=${video.youtubeId}` }
      : { name: "editing" },
  );
  const [uploadError, setUploadError] = useState(video.status === "failed" ? video.error : "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();

  // A fresh upload has no details yet: Gemini fills them in automatically.
  const needsDetails =
    video.status === "draft" && video.hasFile && !video.title && !video.description && video.tags.length === 0;
  const [generating, setGenerating] = useState(needsDetails);
  const [generateError, setGenerateError] = useState("");
  const autoStarted = useRef(false);

  async function runGenerate() {
    const res = await generateMetadataAction(video.id);
    setGenerating(false);
    if (!res.ok) {
      setGenerateError(res.error);
      return;
    }
    setTitle(res.data.title);
    setDescription(res.data.description);
    setTags(res.data.tags);
    toast.success("Title, description and tags are ready — review before uploading");
  }

  function retryGenerate() {
    setGenerateError("");
    setGenerating(true);
    void runGenerate();
  }

  const startAutoGenerate = useEffectEvent(() => {
    if (!needsDetails || autoStarted.current) return;
    autoStarted.current = true;
    void runGenerate();
  });
  useEffect(() => startAutoGenerate(), []);

  // Another tab (or a previous visit) started an upload that hasn't finished yet.
  const uploadingElsewhere = video.status === "uploading" && phase.name === "editing";
  const editable = phase.name === "editing" && !uploadingElsewhere && !generating;
  const tagChars = tagsLength(tags);
  const problems = [
    !title.trim() && "Add a title",
    title.length > TITLE_MAX && `Title is over ${TITLE_MAX} characters`,
    description.length > DESCRIPTION_MAX && `Description is over ${DESCRIPTION_MAX} characters`,
    tagChars > TAGS_TOTAL_MAX && `Tags are over ${TAGS_TOTAL_MAX} characters in total`,
    /[<>]/.test(title + description) && "Title and description can't contain < or >",
  ].filter(Boolean) as string[];

  // Autosave edits as a draft so nothing is lost if the tab is closed.
  const draft = { title, description, tags, madeForKids };
  const draftKey = JSON.stringify(draft);
  const savedKey = useRef(draftKey);
  useEffect(() => {
    if (phase.name !== "editing" || draftKey === savedKey.current) return;
    const timer = setTimeout(async () => {
      const res = await saveDraftAction(video.id, JSON.parse(draftKey));
      if (res.ok) savedKey.current = draftKey;
    }, 1000);
    return () => clearTimeout(timer);
  }, [draftKey, phase.name, video.id]);

  async function publish() {
    setConfirmOpen(false);
    setUploadError("");
    setPhase({ name: "publishing", percent: 0 });

    const fail = (message: string) => {
      setUploadError(message);
      setPhase({ name: "editing" });
      toast.error("Upload failed");
    };

    try {
      const res = await fetch(`/api/videos/${video.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, confirmed: true }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        return fail(body.error ?? "Upload failed. Please try again.");
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as PublishEvent;
          if (event.type === "progress") setPhase({ name: "publishing", percent: event.percent });
          if (event.type === "error") {
            finished = true;
            fail(event.message);
          }
          if (event.type === "done") {
            finished = true;
            savedKey.current = draftKey;
            setPhase({ name: "done", youtubeId: event.youtubeId, url: event.url });
            router.refresh();
          }
        }
      }
      if (!finished) {
        fail("Lost connection during upload. Check Upload History before trying again.");
      }
    } catch {
      fail("Lost connection during upload. Check Upload History before trying again.");
    }
  }

  function discard() {
    startDeleting(async () => {
      const res = await deleteVideoAction(video.id);
      if (res.ok) {
        toast.success("Draft deleted");
        router.push("/upload");
      } else {
        toast.error(res.error);
      }
    });
  }

  if (phase.name === "done") {
    return <UploadSuccess url={phase.url} title={title} />;
  }

  const publishing = phase.name === "publishing";

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Left: preview */}
      <div className="space-y-4 lg:col-span-2">
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card className="py-0">
            {video.hasFile ? (
              <video
                src={`/api/videos/${video.id}/file`}
                className="max-h-[70vh] w-full bg-black object-contain"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">
                Video file is no longer available
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Right: editable details */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Video Details</CardTitle>
          <CardDescription>Written by AI from your video. Edit anything — changes are saved automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {generating && (
            <Alert>
              <Sparkles className="animate-pulse" />
              <AlertTitle>Writing your video details…</AlertTitle>
              <AlertDescription>
                Gemini is watching the video to write the title, description and tags. This usually takes under a
                minute.
              </AlertDescription>
            </Alert>
          )}
          {generateError && !generating && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Couldn&apos;t write the video details</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{generateError}</p>
                <Button variant="outline" size="sm" onClick={retryGenerate}>
                  <RefreshCw /> Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Field label="Title" htmlFor="title" count={title.length} max={TITLE_MAX}>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!editable}
              placeholder={generating ? "Generating…" : "Video title"}
              aria-invalid={title.length > TITLE_MAX}
            />
          </Field>

          <Field label="Description" htmlFor="description" count={description.length} max={DESCRIPTION_MAX}>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!editable}
              rows={8}
              className="min-h-40"
              aria-invalid={description.length > DESCRIPTION_MAX}
            />
          </Field>

          <Field label="Tags" htmlFor="tags" count={tagChars} max={TAGS_TOTAL_MAX}>
            <TagInput id="tags" value={tags} onChange={setTags} disabled={!editable} invalid={tagChars > TAGS_TOTAL_MAX} />
          </Field>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="size-4" /> Videos are published as <strong className="text-foreground">Public</strong>
          </p>

          <div className="rounded-lg border p-4">
            <ToggleRow
              id="kids"
              label="Made for kids"
              hint="On: the video is for kids. Off: the video is not for kids."
              checked={madeForKids}
              onChange={setMadeForKids}
              disabled={!editable}
            />
          </div>

          {uploadingElsewhere && (
            <Alert>
              <Loader2 className="animate-spin" />
              <AlertTitle>Upload in progress</AlertTitle>
              <AlertDescription>
                This video is already being uploaded. Check Upload History in a few minutes.
              </AlertDescription>
            </Alert>
          )}

          {uploadError && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {publishing ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin" />
                  {phase.percent >= 99 ? "Finishing up on YouTube…" : "Uploading to YouTube…"}
                </span>
                <span className="tabular-nums text-muted-foreground">{phase.percent}%</span>
              </div>
              <Progress value={phase.percent} className="h-2" />
              <p className="text-xs text-muted-foreground">Keep this tab open until the upload finishes.</p>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={discard} disabled={!editable || deleting} className="text-muted-foreground">
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Discard draft
              </Button>
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <Button
                  size="lg"
                  className="h-10 bg-red-600 px-5 text-white hover:bg-red-700"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!editable || problems.length > 0 || !video.hasFile}
                >
                  <Rocket /> Upload to YouTube
                </Button>
                {problems[0] && <p className="text-xs text-muted-foreground">{problems[0]}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload this video to YouTube?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  It will be published to <strong className="text-foreground">{channelTitle || "your channel"}</strong> as{" "}
                  <strong className="text-red-600">Public</strong> and visible to everyone immediately.
                </p>
                <p className="line-clamp-2 rounded-md bg-muted p-2 text-foreground">{title}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={publish} className="bg-red-600 text-white hover:bg-red-700">
              <Upload /> Yes, upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  count,
  max,
  children,
}: {
  label: string;
  htmlFor: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        <span className={cn("text-xs tabular-nums text-muted-foreground", count > max && "text-destructive")}>
          {count}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function UploadSuccess({ url, title }: { url: string; title: string }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15">
          <CircleCheck className="size-8 text-emerald-600" />
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Video uploaded successfully 🎉</h2>
          <p className="text-sm text-muted-foreground">
            “{title}” is now live on YouTube.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="lg" className="h-10 bg-red-600 text-white hover:bg-red-700">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> View on YouTube
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-10">
            <Link href="/upload">
              <Upload /> Upload another
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
