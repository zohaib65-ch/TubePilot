import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ImportFromLink } from "@/components/import-from-link";
import { VideoDropzone } from "@/components/video-dropzone";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Upload Video" };

export default async function UploadPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Upload Video"
        description="Upload the video you made in Google Flow, or paste its link. You'll review everything before it goes to YouTube."
      />
      <div className="space-y-6">
        <VideoDropzone maxMb={env().MAX_UPLOAD_MB} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <ImportFromLink />
      </div>
    </>
  );
}
