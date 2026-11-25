import { useEffect, useRef, type ReactNode } from "react";

// A modal dialog on the native <dialog> element: the browser traps focus, Esc
// closes it, and focus returns to the opener. Children are only mounted while it
// is open, so a form inside always starts fresh.
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
  xwide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Extra wide: wizards with a side-by-side preview. */
  xwide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={xwide ? "pl-modal is-xwide" : wide ? "pl-modal is-wide" : "pl-modal"}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="pl-modal-body">
          <header className="pl-modal-head">
            <h2>{title}</h2>
            <button type="button" className="exec-drawer-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>
          <div className="pl-modal-content">{children}</div>
          {footer && <footer className="pl-modal-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
