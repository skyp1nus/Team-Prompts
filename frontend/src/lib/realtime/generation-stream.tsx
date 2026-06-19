"use client";

import * as signalR from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GenerationResultDto } from "@/api/model";
import { MOCK } from "@/lib/api/mock";
import { useAuth } from "@/lib/auth/auth-context";
import { invalidatePath } from "@/lib/query/invalidate";

export type LiveSession = {
  status: string;
  error: string | null;
  /** Accumulated streamed text per variant index (before it's persisted). */
  deltas: Record<number, string>;
};

type LiveMap = Record<string, LiveSession>;

type StreamValue = {
  live: LiveMap;
  subscribeScript: (scriptId: string) => void;
};

const StreamContext = createContext<StreamValue | null>(null);
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function GenerationStreamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveMap>({});
  const connRef = useRef<signalR.HubConnection | null>(null);
  const currentScript = useRef<string | null>(null);

  const upsert = useCallback(
    (sessionId: string, patch: (s: LiveSession) => LiveSession) =>
      setLive((prev) => {
        const cur = prev[sessionId] ?? { status: "Queued", error: null, deltas: {} };
        return { ...prev, [sessionId]: patch(cur) };
      }),
    [],
  );

  useEffect(() => {
    if (!user || MOCK) return; // mock mode has no SignalR backend

    const invalidateActive = () => {
      const sid = currentScript.current;
      if (sid) invalidatePath(qc, `/api/scripts/${sid}/sessions`, `/api/scripts/${sid}/tray`);
    };

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/api/hubs/generation`, { withCredentials: true })
      .withAutomaticReconnect()
      .build();
    connRef.current = conn;

    conn.on("SessionStarted", () => invalidateActive());
    conn.on("SessionStatusChanged", (sessionId: string, status: string, error: string | null) => {
      upsert(sessionId, (s) => ({ ...s, status, error }));
      if (status === "Completed" || status === "Failed") invalidateActive();
    });
    conn.on("ResultDelta", (sessionId: string, index: number, delta: string) => {
      upsert(sessionId, (s) => ({
        ...s,
        deltas: { ...s.deltas, [index]: (s.deltas[index] ?? "") + delta },
      }));
    });
    conn.on("ResultFinalized", (_sessionId: string, _result: GenerationResultDto) => invalidateActive());
    conn.on("SessionCompleted", () => invalidateActive());

    conn
      .start()
      .then(() => {
        if (currentScript.current) conn.invoke("SubscribeToScript", currentScript.current).catch(() => {});
      })
      .catch(() => {});

    return () => {
      conn.stop().catch(() => {});
      connRef.current = null;
    };
  }, [user, qc, upsert]);

  const subscribeScript = useCallback((scriptId: string) => {
    const prev = currentScript.current;
    if (prev === scriptId) return;
    currentScript.current = scriptId;
    setLive({}); // drop the previous script's accumulated live deltas

    const conn = connRef.current;
    if (conn && conn.state === signalR.HubConnectionState.Connected) {
      if (prev) conn.invoke("UnsubscribeFromScript", prev).catch(() => {});
      conn.invoke("SubscribeToScript", scriptId).catch(() => {});
    }
  }, []);

  return (
    <StreamContext.Provider value={{ live, subscribeScript }}>{children}</StreamContext.Provider>
  );
}

export function useGenerationStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useGenerationStream must be used within GenerationStreamProvider");
  return ctx;
}
