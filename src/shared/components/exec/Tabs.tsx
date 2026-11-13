import { useRef, type KeyboardEvent } from "react";

export interface TabDef {
  id: string;
  label: string;
  count?: number | string;
}

// WAI-ARIA tabs: roving tabindex, Left/Right/Home/End. Consumers render the
// matching `role="tabpanel"` with id `${idPrefix}-panel-${id}`.
export function Tabs({
  tabs,
  active,
  onChange,
  idPrefix,
  label,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  idPrefix: string;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div className="exec-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={selected ? "exec-tab is-active" : "exec-tab"}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className="exec-tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
