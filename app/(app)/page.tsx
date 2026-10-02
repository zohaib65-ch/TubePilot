import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarCheck, Clapperboard, FileClock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { PromptsSkeleton } from "@/components/prompts-skeleton";
import { RecentUploads } from "@/components/recent-uploads";
import { RetryCard } from "@/components/retry-card";
import { dayKey, formatDay } from "@/lib/dates";
import { getTodayPrompts, type PromptView } from "@/lib/prompts";
import { requireUser } from "@/lib/session";
import { getUploadStats, listVideos } from "@/lib/videos";

const CIRCLED = ["①", "②", "③"];

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, recent] = await Promise.all([
    getUploadStats(user),
    listVideos(user, { uploadedOnly: true, limit: 5 }),
  ]);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hi, ${firstName} 👋` : "Dashboard"}
        description={formatDay(dayKey(user.settings.timezone))}
      >
        <Button asChild>
          <Link href="/upload">
            <Upload /> Upload video
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Videos Today" value={stats.uploadedToday} icon={CalendarCheck} />
        <StatCard label="Total Uploaded" value={stats.totalUploaded} icon={Clapperboard} />
        <StatCard label="Drafts Waiting" value={stats.drafts} icon={FileClock} href="/history" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Today&apos;s Prompts</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/prompts">
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<PromptsSkeleton compact />}>
              <TodayPromptList />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/history">
                  History <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <RecentUploads videos={recent} timezone={user.settings.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function TodayPromptList() {
  const user = await requireUser();
  let prompts: PromptView[];
  try {
    prompts = await getTodayPrompts(user);
  } catch (err) {
    return (
      <RetryCard
        title="Couldn't generate today's prompts"
        message={err instanceof Error ? err.message : "Gemini is unavailable right now."}
      />
    );
  }

  return (
    <ul className="divide-y">
      {prompts.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="text-xl leading-none text-muted-foreground">{CIRCLED[p.slot - 1]}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p.topic}</p>
            <p className="truncate text-xs text-muted-foreground">{p.prompt}</p>
          </div>
          <CopyButton text={p.prompt} label="Copy" size="sm" variant="outline" />
        </li>
      ))}
    </ul>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const body = (
    <Card className={href ? "transition-colors hover:bg-muted/40" : undefined}>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </span>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
