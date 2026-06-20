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
  /** Owner or Admin — may see/manage privileged settings (key, favorite models, users). */
  isPrivileged: boolean;
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
  const isPrivileged = isOwner || isAdmin;

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, isOwner, isPrivileged, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
