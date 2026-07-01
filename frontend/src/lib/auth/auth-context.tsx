"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGetApiAuthMe } from "@/api/endpoints/auth/auth";
import type { UserDto } from "@/api/model";

type AuthValue = {
  user: UserDto | undefined;
  isLoading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isPromptEditor: boolean;
  isMember: boolean;
  isViewer: boolean;
  /** Owner or Admin — may manage settings (key, favorite models), users, workspaces, and every delete. */
  isPrivileged: boolean;
  /** Owner/Admin/PromptEditor — may view + edit prompt content and pick the generation model. */
  canEditPrompts: boolean;
  /** Same set as {@link canEditPrompts}: who may choose/override the AI model (others get the default). */
  canChooseModel: boolean;
  /** Everyone except Viewer — may upload, run generations, edit scripts and see prompt names. */
  canGenerate: boolean;
  refetch: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const PUBLIC_ROUTES = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, refetch } = useGetApiAuthMe({
    query: { retry: false },
  });

  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!user && !isPublic) router.replace("/login");
    if (user && isPublic) router.replace("/");
  }, [user, isLoading, pathname, router]);

  const roles = user?.roles ?? [];
  const isOwner = roles.includes("Owner");
  const isAdmin = roles.includes("Admin");
  const isPromptEditor = roles.includes("PromptEditor");
  const isMember = roles.includes("Member");
  const isPrivileged = isOwner || isAdmin;
  const canEditPrompts = isPrivileged || isPromptEditor;
  const canGenerate = canEditPrompts || isMember;
  // Viewer = an authenticated user with none of the above capabilities (the read-only floor).
  const isViewer = !!user && !canGenerate;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        isOwner,
        isPromptEditor,
        isMember,
        isViewer,
        isPrivileged,
        canEditPrompts,
        canChooseModel: canEditPrompts,
        canGenerate,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
