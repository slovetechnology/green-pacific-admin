// A thin wrapper over window.confirm — matches the Flask templates' plain
// JS confirm() dialogs on destructive actions rather than introducing a
// custom modal component for a one-line behavior.
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}
