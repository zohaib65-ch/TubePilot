import { Badge } from "@/components/ui/badge";
import type { VideoStatus } from "@/lib/models/Video";

const STYLES: Record<VideoStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  uploading: { label: "Uploading", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  uploaded: { label: "Uploaded", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  const s = STYLES[status];
  return (
    <Badge variant="secondary" className={s.className}>
      {s.label}
    </Badge>
  );
}
