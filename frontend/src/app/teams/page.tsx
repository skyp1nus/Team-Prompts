"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  getGetApiUsersQueryKey,
  useGetApiUsers,
  usePostApiUsers,
} from "@/api/endpoints/users/users";
import type { UserDto } from "@/api/model";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/auth-context";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_RANK: Record<string, number> = { Owner: 0, Admin: 1, Member: 2 };
const topRole = (roles: string[]) =>
  [...roles].sort((a, b) => (ROLE_RANK[a] ?? 9) - (ROLE_RANK[b] ?? 9))[0] ?? "Member";

export default function TeamsPage() {
  const { isPrivileged } = useAuth();
  const { data: users, isLoading } = useGetApiUsers({
    query: { enabled: isPrivileged, retry: false },
  });
  const ownerExists = (users ?? []).some((u) => u.roles.includes("Owner"));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-[22px] font-[650] tracking-tight">Team &amp; Access</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Manage who can use Team Prompts and what they can do.
          </p>
        </div>
        {isPrivileged && <CreateUserSheet ownerExists={ownerExists} />}
      </div>

      {!isPrivileged ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13.5px] text-muted-foreground">
          Only an Owner or Admin can manage team access.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead>Member</TableHead>
                  <TableHead className="w-[160px]">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-faint">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (users ?? []).map((u) => <UserRow key={u.id} user={u} />)}
                {!isLoading && (users ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-faint">
                      No users.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-faint">
            Roles — <b className="text-muted-foreground">Owner</b> top control, exactly one ·{" "}
            <b className="text-muted-foreground">Admin</b> manages users, key &amp; models ·{" "}
            <b className="text-muted-foreground">Member</b> uses prompts &amp; generates.
          </p>
        </>
      )}
    </div>
  );
}

function UserRow({ user }: { user: UserDto }) {
  const role = topRole(user.roles);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-[11px] text-muted-foreground">
              {initials(user.displayName || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium">{user.displayName || "—"}</div>
            <div className="truncate text-xs text-faint">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={role === "Member" ? "secondary" : "default"}
          className={cn("gap-1", role === "Owner" && "bg-primary text-primary-foreground")}
        >
          {role === "Owner" && <ShieldCheck className="size-3" />}
          {role}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

/* ---------------- create user (Owner is a singleton) ---------------- */
const USER_ROLES = ["Owner", "Admin", "Member"] as const;
const createUserSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(200),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
  role: z.enum(USER_ROLES),
});
type CreateUserValues = z.infer<typeof createUserSchema>;

const EMPTY: CreateUserValues = { displayName: "", email: "", password: "", role: "Member" };

function CreateUserSheet({ ownerExists }: { ownerExists: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const create = usePostApiUsers();
  const form = useForm<CreateUserValues>({ resolver: zodResolver(createUserSchema), defaultValues: EMPTY });

  // Owner can only be created when none exists yet.
  const roleOptions = ownerExists ? (["Admin", "Member"] as const) : USER_ROLES;

  const onSubmit = (v: CreateUserValues) =>
    create.mutate(
      { data: v },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetApiUsersQueryKey() });
          toast.success("User created");
          setOpen(false);
          form.reset(EMPTY);
        },
        onError: (err) => {
          const data = (err as { response?: { data?: unknown } })?.response?.data;
          toast.error(
            typeof data === "string" && data ? data : "Could not create user (check email/password)",
          );
        },
      },
    );

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) form.reset(EMPTY); }}>
      <SheetTrigger render={<Button className="gap-1.5" />}>
        <Plus className="size-4" /> Create user
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Create user</SheetTitle>
          <SheetDescription>
            Accounts are created directly — no email invite.
            {!ownerExists && " The Owner can be set once, here."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="name@studio.tv" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="At least 6 characters" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <SheetFooter className="flex-row justify-end border-t border-border">
              <SheetClose render={<Button type="button" variant="ghost" />}>Cancel</SheetClose>
              <Button type="submit" disabled={create.isPending}>Create user</Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
