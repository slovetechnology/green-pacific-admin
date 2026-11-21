import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

// The app's own confirm / prompt / alert dialogs, in place of the browser's native ones (which show the site's
// address, can't be styled and block the page). Call them from anywhere, including outside React:
//
//   if (!(await confirmDialog("Delete this client? This cannot be undone."))) return;
//   const reason = await promptDialog({ message: "Why void this statement?", required: true });  // null = cancelled
//   void alertDialog("3 recipients added.");
//
// <DialogHost /> (mounted once in root.tsx) shows them one at a time, in the order they were asked. They are
// native <dialog> modals: focus is trapped, Esc cancels, and focus goes back to the button that opened them.

type Base = { title?: string; message: string };
export type ConfirmOptions = Base & { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
export type PromptOptions = Base & {
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** The OK button stays disabled until something is typed. */
  required?: boolean;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};
export type AlertOptions = Base & { okLabel?: string };

type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }
  | { id: number; kind: "alert"; options: AlertOptions; resolve: () => void };

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const current = () => queue[0] ?? null;

function enqueue(request: Request) {
  queue = [...queue, request];
  emit();
}
function settle(id: number) {
  queue = queue.filter((r) => r.id !== id);
  emit();
}

// Words that make a confirmation destructive (a red button), and the verb used as its label.
const DANGER = /^(delete|remove|void|terminate|discard|archive|detach|retire|reverse|cancel|deactivate|decline|reject)\b/i;
const VERB = /^(delete|remove|void|terminate|discard|archive|detach|retire|reverse|close|reopen|renew|import|approve|activate|deactivate|issue|load|move|pay|execute|send|sign off|accept|rewrite|collect)\b/i;

function labelFor(message: string) {
  const verb = message.trim().match(VERB)?.[1];
  return verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : "Confirm";
}

const asOptions = <T extends Base>(input: string | T): T => (typeof input === "string" ? ({ message: input } as T) : input);

/** Asks the user to confirm. Resolves true for the confirm button, false for Cancel / Esc / the backdrop. */
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const options = asOptions<ConfirmOptions>(input);
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "confirm", options, resolve }));
}

/** Asks the user for text. Resolves the text typed (possibly ""), or null when cancelled. */
export function promptDialog(input: string | PromptOptions): Promise<string | null> {
  const options = asOptions<PromptOptions>(input);
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "prompt", options, resolve }));
}

/** Tells the user something. Resolves when they close it. */
export function alertDialog(input: string | AlertOptions): Promise<void> {
  const options = asOptions<AlertOptions>(input);
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "alert", options, resolve }));
}

/** Shows the dialogs asked for with confirmDialog / promptDialog / alertDialog. Mount once, at the root. */
export function DialogHost() {
  const request = useSyncExternalStore(subscribe, current, () => null);
  return request ? <DialogView key={request.id} request={request} /> : null;
}

function DialogView({ request }: { request: Request }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  // Where the pointer went down: a drag that starts in the input and ends on the backdrop is not a backdrop click.
  const downOnBackdrop = useRef(false);
  const { options } = request;
  const [value, setValue] = useState(request.kind === "prompt" ? (request.options.defaultValue ?? "") : "");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Typing goes straight into a prompt; a confirm or alert starts on its main button, so Enter accepts.
    (request.kind === "prompt" ? inputRef.current : confirmRef.current)?.focus();
    if (request.kind === "prompt") inputRef.current?.select();
  }, [request.kind]);

  function finish(accepted: boolean) {
    if (done.current) return;
    done.current = true;
    ref.current?.close();
    if (request.kind === "confirm") request.resolve(accepted);
    else if (request.kind === "prompt") request.resolve(accepted ? value : null);
    else request.resolve();
    settle(request.id);
  }

  const promptBlocked = request.kind === "prompt" && !!request.options.required && !value.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!promptBlocked) finish(true);
  }

  const title = options.title ?? (request.kind === "alert" ? "Notice" : request.kind === "prompt" ? "Please enter" : "Please confirm");
  let confirmLabel = "OK";
  let danger = false;
  if (request.kind === "confirm") {
    confirmLabel = request.options.confirmLabel ?? labelFor(options.message);
    danger = request.options.danger ?? DANGER.test(options.message.trim());
  } else if (request.kind === "prompt") {
    confirmLabel = request.options.confirmLabel ?? "OK";
  } else {
    confirmLabel = request.options.okLabel ?? "OK";
  }
  const cancelLabel = request.kind === "alert" ? null : (request.options.cancelLabel ?? "Cancel");
  const fieldId = `dialog-input-${request.id}`;

  return (
    <dialog
      ref={ref}
      className="pl-modal app-dialog"
      role={request.kind === "alert" ? "alertdialog" : "dialog"}
      aria-labelledby={`dialog-title-${request.id}`}
      aria-describedby={`dialog-message-${request.id}`}
      onCancel={(e) => {
        // Esc: cancel (an alert just closes).
        e.preventDefault();
        finish(false);
      }}
      // If the browser closes the dialog itself (e.g. a repeated Esc), still settle it so the caller and queue move on.
      onClose={() => finish(false)}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) finish(false); // a click on the backdrop
      }}
    >
      <form className="pl-modal-body" onSubmit={submit}>
        <header className="pl-modal-head">
          <h2 id={`dialog-title-${request.id}`}>{title}</h2>
          <button type="button" className="exec-drawer-close" onClick={() => finish(false)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="pl-modal-content">
          <p id={`dialog-message-${request.id}`} className="app-dialog-message">{options.message}</p>
          {request.kind === "prompt" && (
            <div className="field">
              {request.options.label && <label htmlFor={fieldId}>{request.options.label}</label>}
              {request.options.multiline ? (
                <textarea id={fieldId} ref={inputRef} rows={4} value={value} placeholder={request.options.placeholder} onChange={(e) => setValue(e.target.value)} aria-label={request.options.label ?? options.message} />
              ) : (
                <input id={fieldId} ref={inputRef} value={value} placeholder={request.options.placeholder} onChange={(e) => setValue(e.target.value)} aria-label={request.options.label ?? options.message} />
              )}
            </div>
          )}
        </div>
        <footer className="pl-modal-foot">
          {cancelLabel && (
            <button type="button" className="btn-secondary btn" onClick={() => finish(false)}>
              {cancelLabel}
            </button>
          )}
          <button type="submit" ref={confirmRef} className={danger ? "btn btn-danger" : "btn"} disabled={promptBlocked}>
            {confirmLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
