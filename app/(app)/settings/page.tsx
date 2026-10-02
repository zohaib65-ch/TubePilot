import type { Metadata } from "next";
import { LogOut, Unplug } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SignInButton } from "@/components/sign-in-button";
import { disconnectYouTubeAction, signOutAction } from "@/lib/actions/settings";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const s = user.settings;
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(s.timezone)) timezones.unshift(s.timezone);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>YouTube Channel</CardTitle>
            <CardDescription>Videos are uploaded to this channel, only after you confirm each upload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-12">
                <AvatarImage src={user.channel.thumbnail} alt="" referrerPolicy="no-referrer" />
                <AvatarFallback>{user.channel.title.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{user.channel.title}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="w-full sm:w-auto">
                <SignInButton label="Reconnect channel" />
              </div>
              <form action={signOutAction}>
                <Button variant="outline" size="lg" className="h-10">
                  <LogOut /> Sign out
                </Button>
              </form>
              <form action={disconnectYouTubeAction}>
                <Button variant="destructive" size="lg" className="h-10">
                  <Unplug /> Disconnect YouTube
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <SettingsForm
          timezones={timezones}
          initial={{
            channelNiche: s.channelNiche,
            timezone: s.timezone,
            categoryId: s.categoryId,
          }}
        />
      </div>
    </>
  );
}
