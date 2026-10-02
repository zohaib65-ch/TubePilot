"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "@/lib/actions/settings";
import { YOUTUBE_CATEGORIES } from "@/lib/constants";
import type { SettingsInput } from "@/lib/schemas";

export function SettingsForm({ initial, timezones }: { initial: SettingsInput; timezones: string[] }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const res = await saveSettingsAction(values);
      if (res.ok) toast.success("Settings saved");
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content &amp; Defaults</CardTitle>
        <CardDescription>Used when generating prompts and as defaults for every new upload.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="niche">About your channel</Label>
          <Textarea
            id="niche"
            rows={3}
            value={values.channelNiche}
            onChange={(e) => set("channelNiche", e.target.value)}
            placeholder="e.g. Cute, funny animal stories and magical cartoon worlds for families."
          />
          <p className="text-xs text-muted-foreground">
            Gemini uses this to write daily prompts that fit your channel.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">YouTube category</Label>
            <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YOUTUBE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={values.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger id="timezone" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">New daily prompts are generated at midnight in this timezone.</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t bg-muted/30 py-3">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Save settings
        </Button>
      </CardFooter>
    </Card>
  );
}
