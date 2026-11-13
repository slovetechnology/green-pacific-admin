import type { DealDetail, FormOptions } from "../../lib/types";

// What every tab of the deal page is handed.
export interface TabProps {
  detail: DealDetail;
  options: FormOptions | undefined;
  canWrite: boolean;
  isAdmin: boolean;
  // Reload the deal after a change.
  refresh: () => Promise<void>;
  // Open the "mark as won" dialog.
  onWin: () => void;
  // Jump to another tab.
  goTo: (tab: string) => void;
  // Set by the "Next" card's button: the gate item to bring into view (n changes on every click).
  focus?: { code: string; n: number } | null;
}

export function isClosed(detail: DealDetail): boolean {
  return detail.deal.stage === "Won" || detail.deal.stage === "Lost" || Boolean(detail.deal.archived_at);
}
