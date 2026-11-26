import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import type { HrMeta, PersonProfile, RegistrySummary } from "../lib/types";

export const hrKeys = {
  all: ["hr"] as const,
  meta: ["hr", "meta"] as const,
  summary: ["hr", "summary"] as const,
  me: ["hr", "me"] as const,
};

export function useHrMeta(enabled = true) {
  return useQuery({ queryKey: hrKeys.meta, queryFn: () => api.get<HrMeta>("/api/hr/meta"), enabled, staleTime: 60_000 });
}

export function useRegistrySummary(enabled = true) {
  return useQuery({ queryKey: hrKeys.summary, queryFn: () => api.get<RegistrySummary>("/api/hr/summary"), enabled });
}

export function useMyFile() {
  return useQuery({ queryKey: hrKeys.me, queryFn: () => api.get<{ profile: PersonProfile | null }>("/api/hr/me") });
}

export const errorText = (err: unknown, fallback = "Something went wrong.") => (err instanceof ApiError ? err.message : fallback);

export interface Notice {
  kind: "success" | "error";
  text: string;
}

// One place for the save / delete / action pattern: run it, show the outcome, refresh everything under the
// "hr" query key (tables, summary strip and the person's own file all read from it).
export function useAction() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success: string): Promise<T | undefined> => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await fn();
        setNotice({ kind: "success", text: success });
        await queryClient.invalidateQueries({ queryKey: hrKeys.all });
        return result;
      } catch (err) {
        setNotice({ kind: "error", text: errorText(err, "Could not save.") });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [queryClient]
  );
  return { run, notice, busy, clear: () => setNotice(null) };
}

// Plain mutation for places that want the loading state from react-query.
export function useHrMutation<TBody, TResult = unknown>(method: "post" | "put" | "delete", path: (body: TBody) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => (method === "delete" ? api.delete<TResult>(path(body)) : api[method]<TResult>(path(body), body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: hrKeys.all }),
  });
}
