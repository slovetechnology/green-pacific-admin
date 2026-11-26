import { isValidElement, type CSSProperties, type ReactNode } from "react";
import { Pagination } from "./Pagination";
import "../styles/executive.css";

export interface DataGridColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export interface DataGridPaging {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** The plain text of a column header, used as the label on each cell when rows stack into cards on a phone. */
function headerText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headerText).join("").trim();
  if (isValidElement<{ children?: ReactNode }>(node)) return headerText(node.props.children);
  return "";
}

// Shared table shell for list pages: column config in, consistent loading/empty
// rows and pagination wiring out — so a table-wide fix only needs to happen here.
export function DataGrid<T>({
  columns,
  rows,
  isLoading,
  getRowKey,
  getRowStyle,
  onRowClick,
  isRowSelected,
  emptyMessage = "No records found.",
  paging,
  footer,
}: {
  columns: DataGridColumn<T>[];
  rows: T[] | undefined;
  isLoading: boolean;
  getRowKey: (row: T) => string | number;
  getRowStyle?: (row: T) => CSSProperties | undefined;
  // Optional drill-in. A click anywhere on the row opens it, except on a link or
  // button inside the row, which keep their own behaviour. Pair it with an
  // explicit button column so keyboard users have a way in too.
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  emptyMessage?: ReactNode;
  paging?: DataGridPaging;
  footer?: ReactNode;
}) {
  const colCount = columns.length;
  const labels = columns.map((col) => headerText(col.header));

  return (
    <>
      <div className="exec-panel data-grid-card">
        <div className="exec-table-wrap table-wrap">
          <table className="exec-table is-static data-grid-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.align === "right" ? "num" : undefined}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colCount}>Loading…</td>
                </tr>
              )}
              {!isLoading && (!rows || rows.length === 0) && (
                <tr>
                  <td colSpan={colCount} className="empty-state">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows?.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    style={getRowStyle?.(row)}
                    className={[onRowClick ? "is-clickable" : "", isRowSelected?.(row) ? "is-selected" : ""].filter(Boolean).join(" ") || undefined}
                    onClick={
                      onRowClick
                        ? (e) => {
                            if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                  >
                    {columns.map((col, i) => (
                      <td key={col.key} className={col.align === "right" ? "num" : undefined} data-label={labels[i] || undefined}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
            {footer && <tfoot>{footer}</tfoot>}
          </table>
        </div>
      </div>

      {paging && (
        <Pagination
          page={paging.page}
          totalPages={paging.totalPages}
          total={paging.total}
          onPageChange={paging.onPageChange}
        />
      )}
    </>
  );
}
