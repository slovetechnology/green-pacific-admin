import type { ReactNode } from "react";

// Anchored, bordered region of the dashboard grid. Deliberately flat: no
// shadow, no outer margin. Spacing between panels comes from the grid gap.
export function Panel({
  eyebrow,
  title,
  actions,
  children,
  flush = false,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  // Table panels run edge to edge; everything else gets body padding.
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`exec-panel ${className}`.trim()}>
      <header className="exec-panel-head">
        <div className="exec-panel-titles">
          {eyebrow && <span className="exec-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="exec-panel-actions">{actions}</div>}
      </header>
      <div className={flush ? "exec-panel-body is-flush" : "exec-panel-body"}>{children}</div>
    </section>
  );
}
