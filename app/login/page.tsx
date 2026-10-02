import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SquarePlay, Sparkles, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center gap-3 text-center">
          <Logo className="justify-center" />
          <CardTitle className="text-xl">Connect your YouTube channel</CardTitle>
          <CardDescription>
            Sign in with the Google account that owns your channel. TubePilot never publishes anything
            without your confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {typeof error === "string" && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <Sparkles className="size-4 text-foreground" /> 3 fresh Google Flow prompts every day
            </li>
            <li className="flex items-center gap-3">
              <Upload className="size-4 text-foreground" /> AI-written titles, descriptions and tags
            </li>
            <li className="flex items-center gap-3">
              <SquarePlay className="size-4 text-foreground" /> Review, then upload to YouTube in one click
            </li>
          </ul>
          <SignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
