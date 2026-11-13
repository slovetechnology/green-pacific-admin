import "@/shared/styles/executive.css";

// A search box for list pages. With useRowSearch it filters a list that is loaded whole; a paginated
// list passes value/onChange and sends the text to its own endpoint instead.
export function ListSearch({
  value, onChange, placeholder = "Search…", shown, total, label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** With total, shows "N of M" while a search is typed. */
  shown?: number;
  total?: number;
  label?: string;
}) {
  return (
    <div className="exec-filters list-search" role="search" style={{ marginBottom: "0.75rem" }}>
      <label className="exec-search">
        <span>{label}</span>
        <input type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {value && shown !== undefined && total !== undefined && (
        <span style={{ alignSelf: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          {shown} of {total} shown
        </span>
      )}
      {value && (
        <button type="button" className="exec-filter-clear" onClick={() => onChange("")}>
          Clear search
        </button>
      )}
    </div>
  );
}
