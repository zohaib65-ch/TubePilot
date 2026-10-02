import Image from "next/image";
import { ExternalLink, Film } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { PRIVACY_LABELS } from "@/lib/constants";
import { youtubeThumbnail, youtubeUrl, type VideoView } from "@/lib/videos";

export function RecentUploads({ videos, timezone }: { videos: VideoView[]; timezone: string }) {
  if (!videos.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <Film className="size-8" />
        No uploads yet. Your YouTube uploads will show up here.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {videos.map((v) => (
        <li key={v.id}>
          <a
            href={youtubeUrl(v.youtubeId)}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-muted/50"
          >
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={youtubeThumbnail(v.youtubeId)}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:underline">{v.title}</p>
              <p className="text-xs text-muted-foreground">
                {v.uploadedAt && formatDateTime(v.uploadedAt, timezone)} · {PRIVACY_LABELS[v.privacy]}
              </p>
            </div>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}
