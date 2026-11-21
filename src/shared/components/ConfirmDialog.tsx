import { confirmDialog } from "./Dialogs";

// Asks the user to confirm an action in the app's own dialog (see Dialogs.tsx). Resolves true when confirmed.
export function confirmAction(message: string): Promise<boolean> {
  return confirmDialog(message);
}
