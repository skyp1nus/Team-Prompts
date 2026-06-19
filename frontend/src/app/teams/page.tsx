"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { cn } from "@/lib/utils";
import { type Member, memberInitials, type Role, ROLES, SEED_MEMBERS } from "@/lib/demo/team-data";

export default function TeamsPage() {
  const [members, setMembers] = useState<Member[]>(SEED_MEMBERS);

  const changeRole = (id: string, role: Role) =>
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role } : m)));
  const remove = (id: string) => setMembers((ms) => ms.filter((m) => m.id !== id));
  const invite = (m: Member) => setMembers((ms) => [...ms, m]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-7">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-[22px] font-[650] tracking-tight">Team</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Manage who can use Team Prompts and what they can do.
          </p>
        </div>
        <InviteSheet onInvite={invite} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>Member</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-accent text-[11px] text-muted-foreground">
                        {memberInitials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium">{m.name}</div>
                      <div className="truncate text-xs text-faint">{m.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select value={m.role} onValueChange={(v) => v && changeRole(m.id, v as Role)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1.5 font-normal">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        m.status === "active" ? "bg-ok" : "bg-warn",
                      )}
                    />
                    {m.status === "active" ? "Active" : "Invited"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(m.id)}
                    aria-label="Remove member"
                  >
                    <X className="size-3.5 text-faint" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-faint">
        Roles — <b className="text-muted-foreground">Owner</b> full control &amp; billing ·{" "}
        <b className="text-muted-foreground">Admin</b> manages members &amp; prompts ·{" "}
        <b className="text-muted-foreground">Editor</b> creates prompts, branches, generates ·{" "}
        <b className="text-muted-foreground">Viewer</b> uses prompts, read-only.
      </p>
    </div>
  );
}

const inviteSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["Owner", "Admin", "Editor", "Viewer"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteSheet({ onInvite }: { onInvite: (m: Member) => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", role: "Viewer" },
  });

  const onSubmit = (v: InviteValues) => {
    onInvite({
      id: `m${Date.now()}`,
      name: v.name?.trim() || v.email.split("@")[0],
      email: v.email,
      role: v.role,
      status: "invited",
    });
    toast.success("Invite sent");
    setOpen(false);
    form.reset({ name: "", email: "", role: "Viewer" });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) form.reset({ name: "", email: "", role: "Viewer" }); }}>
      <SheetTrigger render={<Button className="gap-1.5" />}>
        <Plus className="size-4" /> Invite member
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Invite member</SheetTitle>
          <SheetDescription>They’ll get access with the role you choose.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name <span className="font-normal text-faint">(optional)</span></FormLabel>
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
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
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
              <Button type="submit">Send invite</Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
