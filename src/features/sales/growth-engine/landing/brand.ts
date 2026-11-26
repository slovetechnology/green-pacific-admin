// The name shown on the public quote pages.
export const COMPANY_SHORT = "Green Pacific Insurance Brokers";

/** Opens a tab synchronously (so pop-up blockers allow it) that is pointed at WhatsApp once the lead exists. */
export function openPendingTab(): Window | null {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null; // the WhatsApp page gets no handle back to this one
  return tab;
}
