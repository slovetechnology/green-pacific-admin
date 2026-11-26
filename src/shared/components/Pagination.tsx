export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className={`pagination-btn${page <= 1 ? " disabled" : ""}`}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        ← Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages} ({total} total)
      </span>
      <button
        type="button"
        className={`pagination-btn${page >= totalPages ? " disabled" : ""}`}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next →
      </button>
    </div>
  );
}
