import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { PageHeader } from "@/components/page-header";
import { VideoEditor } from "@/components/video-editor";
import { requireUser } from "@/lib/session";
import { getVideo, toVideoView } from "@/lib/videos";

export const metadata: Metadata = { title: "Review & Upload" };

export default async function ReviewPage({ params }: PageProps<"/upload/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const doc = isValidObjectId(id) ? await getVideo(user, id) : null;
  if (!doc) notFound();

  const video = toVideoView(doc);

  return (
    <>
      <PageHeader
        title={video.status === "uploaded" ? "Uploaded" : "Review & Upload"}
        description={video.originalName}
      />
      <VideoEditor video={video} channelTitle={user.channel.title} />
    </>
  );
}
