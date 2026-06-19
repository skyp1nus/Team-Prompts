import type { UserRef } from "@/api/model";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserBadge({ user, className }: { user: UserRef; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Avatar className="size-4">
        <AvatarFallback className="text-[8px]">{initials(user.displayName)}</AvatarFallback>
      </Avatar>
      {user.displayName}
    </span>
  );
}
