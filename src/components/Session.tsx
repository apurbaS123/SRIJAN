"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import type { Role } from "@/lib/domain/types";

export interface SessionData {
  user: { id: string; role: Role; name: string; phone?: string; email?: string } | null;
  creator?: (CreatorPublic & { upiId?: string; kyc: { aadhaar: boolean; pan: boolean } }) | null;
  demoUsers: { id: string; role: Role; name: string; note: string }[];
}

const Ctx = createContext<{ session?: SessionData; loading: boolean; refresh: () => Promise<void> }>({
  loading: true,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useData<SessionData>("/api/session");
  return <Ctx.Provider value={{ session: data, loading, refresh: reload }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
