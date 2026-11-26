import { useMemo } from "react";
import { useSearchParams } from "react-router";

// Every word typed must appear somewhere in the row's text (any order, any case).
export function matchesSearch(text: string, query: string): boolean {
  const hay = text.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

// Filters rows on the page by the words typed, for lists that are loaded whole (pair it with ListSearch).
// The text is kept in the address (?search=) so going back to the list keeps the search. textOf returns
// the searchable text of a row (names, numbers, emails...).
export function useRowSearch<T>(rows: T[] | undefined, textOf: (row: T) => (string | number | null | undefined)[]) {
  const [params, setParams] = useSearchParams();
  const query = params.get("search") || "";
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value);
    else next.delete("search");
    setParams(next, { replace: true });
  };
  const filtered = useMemo(() => {
    if (!rows || !query.trim()) return rows;
    return rows.filter((row) => matchesSearch(textOf(row).filter((v) => v !== null && v !== undefined).join(" "), query));
    // textOf is a fresh function each render; the rows and the query decide the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);
  return { query, setQuery, filtered, total: rows?.length ?? 0, shown: filtered?.length ?? 0 };
}
