import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Film, Pencil, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { VideoStatusBadge } from "@/components/video-status-badge";
import { PRIVACY_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { listVideos, youtubeThumbnail, youtubeUrl } from "@/lib/videos";

export const metadata: Metadata = { title: "Upload History" };

export default async function HistoryPage() {
  const user = await requireUser();
  const videos = await listVideos(user, { limit: 200 });
  const tz = user.settings.timezone;

  return (
    <>
      <PageHeader title="Upload History" description="Every video you've uploaded, plus drafts waiting for review.">
        <Button asChild>
          <Link href="/upload">
            <Upload /> Upload video
          </Link>
        </Button>
      </PageHeader>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <Film className="size-10" />
            <p>No videos yet. Upload your first Google Flow video to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {videos.map((v) => (
              <li key={v.id} className="flex items-center gap-4 p-4">
                <div className="relative hidden aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
                  {v.youtubeId ? (
                    <Image src={youtubeThumbnail(v.youtubeId)} alt="" fill sizes="128px" className="object-cover" />
                  ) : (
                    <Film className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <VideoStatusBadge status={v.status} />
                    {v.status === "uploaded" && (
                      <span className="text-xs text-muted-foreground">{PRIVACY_LABELS[v.privacy]}</span>
                    )}
                  </div>
                  <p className="truncate font-medium">{v.title || v.originalName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.uploadedAt
                      ? `Uploaded ${formatDateTime(v.uploadedAt, tz)}`
                      : `Added ${formatDateTime(v.createdAt, tz)}`}
                    {v.status === "failed" && v.error && ` · ${v.error}`}
                  </p>
                </div>
                {v.status === "uploaded" ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={youtubeUrl(v.youtubeId)} target="_blank" rel="noreferrer">
                      <ExternalLink /> <span className="hidden sm:inline">View on YouTube</span>
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/upload/${v.id}`}>
                      <Pencil /> <span className="hidden sm:inline">Review</span>
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
