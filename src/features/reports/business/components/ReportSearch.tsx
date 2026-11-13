import { useState } from "react";

/** The search box the report pages share; the text goes in the `q` query parameter and the server filters on it. */
export function ReportSearch({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [input, setInput] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(input.trim());
      }}
      style={{ display: "flex", gap: "0.5rem" }}
    >
      <input type="search" placeholder="Search…" value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit" className="btn-secondary btn">
        Search
      </button>
    </form>
  );
}
