// The broker's own name and contact details, shown across the app. Keep in step with
// backend/src/shared/company.js, which prints the same details on every generated document.
export const COMPANY = {
  name: "Green Pacific Insurance Brokers Ltd",
  address: "Plot 2b, Oyinkan Abayomi Drive, Ikoyi, Lagos",
  mobiles: ["08148321964", "08118162031"],
  email: "enquiries@greenpacificng.com",
} as const;
