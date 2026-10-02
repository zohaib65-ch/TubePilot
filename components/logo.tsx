import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
        <Clapperboard className="size-4" />
      </span>
      <span className="text-base">TubePilot</span>
    </div>
  );
}
