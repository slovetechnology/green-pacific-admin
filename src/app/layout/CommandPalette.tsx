import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

export interface CommandItem {
  to: string;
  label: string;
  group?: string;
}

export function CommandPalette({
  items,
  open,
  onClose,
}: {
  items: CommandItem[];
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    return items
      .filter((item) => item.label.toLowerCase().includes(q) || item.group?.toLowerCase().includes(q))
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!open) return null;

  function go(item: CommandItem) {
    navigate(item.to);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) go(chosen);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="command-palette-overlay" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Jump to a page… (e.g. clients, renewals, reports)"
          aria-label="Quick navigation"
        />
        <ul className="command-palette-results">
          {results.length === 0 && <li className="command-palette-empty">No matches</li>}
          {results.map((item, idx) => (
            <li key={item.to}>
              <button
                type="button"
                className={idx === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => go(item)}
              >
                <span>{item.label}</span>
                {item.group && <span className="command-palette-group">{item.group}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
