import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState, type Updater } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Pagination } from "@/shared/components/Pagination";
import type { useServerTable } from "../hooks/useServerTable";

type TableState<T> = ReturnType<typeof useServerTable<T>>;

interface ColMeta {
  num?: boolean;
}

// A dense, server-driven grid: paging, multi-column sorting (click a header; shift-click adds a column) and
// the filters in `toolbar` all go to the API through useServerTable. Column ids must be sort keys the API
// accepts; give a column `enableSorting: false` when it has none.
export function ServerTable<T>({
  table, columns, toolbar, getRowKey, emptyMessage = "Nothing found.", rowClassName,
}: {
  table: TableState<T>;
  columns: ColumnDef<T, unknown>[];
  toolbar?: ReactNode;
  getRowKey: (row: T) => string | number;
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  const rows = table.data?.rows ?? [];
  const instance = useReactTable({
    data: rows,
    columns,
    state: { sorting: table.sorting },
    onSortingChange: (updater: Updater<SortingState>) => table.setSorting(typeof updater === "function" ? updater(table.sorting) : updater),
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: true,
    getRowId: (row) => String(getRowKey(row)),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="hr-grid">
      <div className="hr-toolbar">
        <input type="search" className="hr-search" placeholder="Search…" aria-label="Search" value={table.typed} onChange={(e) => table.setTyped(e.target.value)} />
        {toolbar}
        <span className="hr-count" aria-live="polite">
          {table.isFetching ? "Loading…" : `${table.data?.total ?? 0} record${table.data?.total === 1 ? "" : "s"}`}
        </span>
      </div>
      {table.isError && <div className="flash flash-error">Could not load this list.</div>}
      <div className="exec-table-wrap table-wrap">
        <table className="exec-table is-static hr-table">
          <thead>
            {instance.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const meta = h.column.columnDef.meta as ColMeta | undefined;
                  return (
                    <th key={h.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className={meta?.num ? "num" : undefined}>
                      {h.column.getCanSort() ? (
                        <button type="button" className="hr-sort" onClick={h.column.getToggleSortingHandler()} title="Click to sort; Shift+click to add a column">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden="true">{sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}</span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.isLoading && (
              <tr><td colSpan={columns.length}>Loading…</td></tr>
            )}
            {!table.isLoading && rows.length === 0 && (
              <tr><td colSpan={columns.length} className="empty-state">{emptyMessage}</td></tr>
            )}
            {instance.getRowModel().rows.map((row) => (
              <tr key={row.id} className={rowClassName?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={(cell.column.columnDef.meta as ColMeta | undefined)?.num ? "num" : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hr-pager">
        <label>
          Rows{" "}
          <select value={table.perPage} onChange={(e) => table.setPerPage(Number(e.target.value))} aria-label="Rows per page">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Pagination page={table.data?.page ?? 1} totalPages={table.data?.totalPages ?? 1} total={table.data?.total ?? 0} onPageChange={table.setPage} />
      </div>
    </div>
  );
}
