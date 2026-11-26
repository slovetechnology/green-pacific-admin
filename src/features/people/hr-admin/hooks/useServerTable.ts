import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { api } from "@/shared/api/client";
import type { Paged } from "../lib/types";

// State for a server-paged table: page, page size, multi-column sort and free filters all live here and
// become the query string, so the server does the slicing and the cache key is the URL. Changing a filter
// or the sort goes back to page 1.
export function useServerTable<T>(endpoint: string, initialFilters: Record<string, string> = {}, initialSort: SortingState = []) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sorting, setSortingState] = useState<SortingState>(initialSort);
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  // The search box is typed into freely and applied after a short pause, so each keystroke is not a request.
  const [typed, setTyped] = useState(initialFilters.q ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === typed ? f : { ...f, q: typed }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("per_page", String(perPage));
    if (sorting.length) p.set("sort", sorting.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(","));
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p.toString();
  }, [page, perPage, sorting, filters]);

  const result = useQuery({
    queryKey: ["hr", "table", endpoint, query],
    queryFn: () => api.get<Paged<T>>(`${endpoint}?${query}`),
    placeholderData: keepPreviousData,
  });

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);
  const setSorting = useCallback((next: SortingState) => {
    setSortingState(next);
    setPage(1);
  }, []);

  return { ...result, page, setPage, perPage, setPerPage: (n: number) => { setPerPage(n); setPage(1); }, sorting, setSorting, filters, setFilter, typed, setTyped };
}
