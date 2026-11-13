import { useEffect, useRef, type ReactNode } from "react";

// Non-modal detail drawer. It sits over the right edge but leaves the list
// interactive, so the user keeps their filters, tab and scroll position while
// drilling in. Esc closes it and focus returns to whatever opened it.
export function SideDrawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    closeRef.current?.focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open, onClose]);

  return (
    <aside className={open ? "exec-drawer is-open" : "exec-drawer"} aria-label={title} aria-hidden={!open} inert={!open}>
      <header className="exec-drawer-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button ref={closeRef} type="button" className="exec-drawer-close" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </header>
      <div className="exec-drawer-body">{children}</div>
      {footer && <footer className="exec-drawer-foot">{footer}</footer>}
    </aside>
  );
}
