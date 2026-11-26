import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { findSchedule } from "./resolveSchedule";
import type { ScheduleSpec } from "./types";

// The specs are static per deploy, so they are fetched once and never refetched.
export function useScheduleSpecs() {
  return useQuery({
    queryKey: ["transactions", "meta", "schedules"],
    queryFn: () => api.get<{ schedules: ScheduleSpec[] }>("/api/transactions/meta/schedules").then((r) => r.schedules),
    staleTime: Infinity,
  });
}

export function useScheduleSpec(classOfBusiness: string): ScheduleSpec | null {
  const { data } = useScheduleSpecs();
  return findSchedule(data, classOfBusiness);
}
