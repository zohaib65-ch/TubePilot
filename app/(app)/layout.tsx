import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar channel={{ title: user.channel.title, thumbnail: user.channel.thumbnail }} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <SidebarTrigger />
          <Logo />
        </header>
        <div className=" w-full px-4 py-6 md:px-8 md:py-10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
