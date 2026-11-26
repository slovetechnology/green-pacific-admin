import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { useReinsuranceStatus } from "@/features/underwriting/reinsurance/lib/reinsurance";
import { PB_TABS, usePbAccess } from "@/features/underwriting/policy-bank/api/policyBank";
import { GL_TABS, useGlAccess } from "@/features/finance/ledger/api/ledger";
import { CommandPalette, type CommandItem } from "@/app/layout/CommandPalette";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { useSignedInTheme } from "@/shared/lib/theme";
import { appraisalAccess } from "@/features/people/appraisal/lib/appraisalTypes";
import { hrAccessFor } from "@/features/people/hr-admin/context/HrAccessContext";
import { CompanyContact } from "@/shared/components/CompanyContact";
import { fmtMoneyShort } from "@/shared/lib/format";
import { badgeFor, useNavSummary, type NavSummary } from "@/app/layout/useNavSummary";

function ChevronIcon() {
  return (
    <svg className="sidebar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6"></path>
    </svg>
  );
}

// Flat items: things visited constantly, or that don't fit a single business process.

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/analytics", label: "Analytics" },
  { to: "/tasks", label: "Tasks" },
  { to: "/faq", label: "FAQ" },
  { to: "/news", label: "Industry News" },
];

// Groups are organized around brokerage workflows (jobs-to-be-done) rather than
// mirroring individual database tables, so related work stays under one label.
// One journey, seven entries. Market submissions, X-date radar and quotes now live
// on the deal itself; segmentation, the coverage matrix and attribution are
// reached from the pages they belong with (Cross-sell and Pipeline KPIs).
const SALES_PIPELINE_ITEMS = [
  { to: "/deals", label: "Pipeline", end: true },
  { to: "/deals/dashboard", label: "Pipeline Dashboard" },
  { to: "/quote-requests", label: "Inbox: Quote Requests" },
  { to: "/kyc-submissions", label: "KYC Submissions" },
  { to: "/expiring-policies", label: "Expiring Elsewhere" },
  { to: "/markets", label: "Market Responses" },
  { to: "/cover-notes", label: "Cover Notes" },
  { to: "/producers", label: "Producers" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/crm/coverage-gaps", label: "Cross-sell" },
  { to: "/crm/bd-kpis", label: "Pipeline KPIs" },
];

const POLICIES_MONEY_ITEMS = [
  { to: "/transactions", label: "Transactions" },
  { to: "/receipts", label: "Receipts" },
  { to: "/premium-invoices", label: "Premium Invoices" },
  { to: "/commission-statements", label: "Commission Statements" },
  { to: "/sub-brokers", label: "Sub-Brokers" },
  { to: "/broking-slips", label: "Broking Slips" },
  { to: "/renewals", label: "Renewals" },
  { to: "/insurer-remittances", label: "Insurer Remittances" },
  { to: "/refund-vouchers", label: "Refunds & Endorsement Approvals" },
  { to: "/expenses", label: "Expenses" },
  { to: "/financials", label: "Financials Performance" },
  { to: "/chart-of-accounts", label: "Chart of Accounts" },
];

const SERVICE_CLAIMS_ITEMS = [
  { to: "/claims", label: "Claims" },
  { to: "/client-messages", label: "Client Messages" },
  { to: "/clause-library", label: "Clause Library" },
  { to: "/policy-templates", label: "Policy Templates" },
];

const REPORT_ITEMS = [
  { to: "/reports/remittance", label: "Remittance" },
  { to: "/reports/cash-receipt", label: "Cash Receipt" },
  { to: "/reports/monthly-production", label: "Monthly Production" },
  { to: "/reports/premium-age", label: "Premium Age Analysis" },
  { to: "/reports/client-business", label: "Client Business" },
  { to: "/reports/credit-notes", label: "Credit Notes" },
  { to: "/reports/debit-notes", label: "Debit Notes" },
  { to: "/reports/renewal-notices", label: "Renewal Notices" },
  { to: "/reports/upcoming-renewals", label: "Upcoming Renewals" },
  { to: "/reports/weekly-summary", label: "Weekly Summary" },
  { to: "/reports/weekly-business", label: "Weekly Business" },
  { to: "/reports/monthly-business", label: "Monthly Business" },
  { to: "/reports/annual-report", label: "Annual Business" },
  { to: "/reports/risk-matrix", label: "Risk Matrix" },
  { to: "/reports/loss-experience", label: "Loss Experience" },
  { to: "/compliance/reports", label: "NAICOM Statutory Reports" },
  { to: "/policy-compliance", label: "Policy Compliance" },
];

interface NavGroupItem {
  to: string;
  label: string;
  // Highlight on this exact path only, not on paths below it.
  end?: boolean;
}

interface NavArea {
  key: string;
  label: string;
  items: NavGroupItem[];
}

// Whether `pathname` is on or under a nav item's path ("/" only matches itself).
const onPath = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));

// The area whose page best matches the path (the longest matching link wins), or null for pages in no
// area such as /account.
function areaForPath(areas: NavArea[], pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const area of areas) {
    for (const item of area.items) {
      if (onPath(pathname, item.to) && (!best || item.to.length > best.len)) best = { key: area.key, len: item.to.length };
    }
  }
  return best?.key ?? null;
}

function useIsNarrow() {
  const query = "(max-width: 900px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function NavBadgeChip({ to, summary }: { to: string; summary: NavSummary | undefined }) {
  const badge = badgeFor(to, summary);
  return badge ? <span className={`sidebar-badge tone-${badge.tone}`}>{badge.text}</span> : null;
}

function SidebarLink({ item, summary }: { item: NavGroupItem; summary: NavSummary | undefined }) {
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
      <span className="nav-label">{item.label}</span>
      <NavBadgeChip to={item.to} summary={summary} />
    </NavLink>
  );
}

function StatsPanel({ summary }: { summary: NavSummary | undefined }) {
  if (!summary) return null;
  const heading = summary.stats.tier === "producer" ? "My book" : summary.stats.tier === "branch" ? "My branch" : "At a glance";
  return (
    <section className="sidebar-stats" aria-label={heading}>
      <h2>{heading}</h2>
      <dl>
        <div><dt>Premium this year</dt><dd>{fmtMoneyShort(summary.stats.gwpYtd)}</dd></div>
        <div><dt>Active policies</dt><dd>{summary.stats.activePolicies.toLocaleString()}</dd></div>
        <div><dt>Renewals due (60d)</dt><dd>{summary.renewals.total.toLocaleString()}</dd></div>
      </dl>
    </section>
  );
}

function HubChevron() {
  return (
    <svg className="hub-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6"></path>
    </svg>
  );
}

function TopbarHubs({ areas, activeAreaKey }: { areas: NavArea[]; activeAreaKey: string }) {
  const location = useLocation();
  const [openHub, setOpenHub] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    setOpenHub(null);
  }, [location.pathname]);

  // The tabs scroll sideways when they don't fit; the arrows show only when there is more to see.
  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    const onWheel = (e: WheelEvent) => {
      // A plain mouse wheel scrolls the tabs sideways.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [updateEdges, areas]);

  // Keep the active tab in view.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector<HTMLElement>(".hub-link.active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeAreaKey]);

  const scrollTabs = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  // The tab strip scrolls and fades its edges, which would hide anything drawn inside it, so a menu is
  // rendered on <body> (a portal) and placed under its tab.
  const [menuAt, setMenuAt] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<number | undefined>(undefined);
  const openMenu = (key: string, tab: HTMLElement) => {
    window.clearTimeout(closeTimer.current);
    const rect = tab.getBoundingClientRect();
    setMenuAt({ top: rect.bottom, left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)) });
    setOpenHub(key);
  };
  // A short delay lets the pointer cross from the tab into its menu without the menu closing.
  const closeMenuSoon = (key: string) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenHub((cur) => (cur === key ? null : cur)), 120);
  };
  const keepMenu = () => window.clearTimeout(closeTimer.current);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!openHub) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest(".hub, .hub-menu")) setOpenHub(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openHub]);

  return (
    <div className={`topbar-tabs-wrap${edges.left ? " more-left" : ""}${edges.right ? " more-right" : ""}`}>
    {edges.left && (
      <button type="button" className="hub-scroll hub-scroll-left" aria-label="Scroll menu left" tabIndex={-1} onClick={() => scrollTabs(-1)}>
        <HubChevron />
      </button>
    )}
    <nav
      className="topbar-tabs"
      aria-label="Hubs"
      ref={scrollerRef}
      onScroll={() => {
        updateEdges();
        setOpenHub(null);
      }}
    >
      {HUBS.map((hub) => {
        const hubAreas = hub.areaKeys.map((k) => areas.find((a) => a.key === k)).filter((a): a is NavArea => !!a && a.items.length > 0);
        if (!hubAreas.length) return null;
        const isActive = hubAreas.some((a) => a.key === activeAreaKey);
        if (!hub.menu) {
          return (
            <Link key={hub.key} to={hubAreas[0].items[0].to} className={`hub-link${isActive ? " active" : ""}`} aria-current={isActive ? "page" : undefined}>
              {hub.label}
            </Link>
          );
        }
        const isOpen = openHub === hub.key;
        return (
          <div key={hub.key} className="hub" onMouseEnter={(e) => openMenu(hub.key, e.currentTarget)} onMouseLeave={() => closeMenuSoon(hub.key)}>
            <button
              type="button"
              className={`hub-link${isActive ? " active" : ""}${isOpen ? " open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={(e) => (isOpen ? setOpenHub(null) : openMenu(hub.key, e.currentTarget.parentElement ?? e.currentTarget))}
            >
              {hub.label}
              <HubChevron />
            </button>
            {isOpen && createPortal(
              <div
                className="hub-menu"
                role="menu"
                style={{ top: menuAt.top, left: menuAt.left }}
                onMouseEnter={keepMenu}
                onMouseLeave={() => closeMenuSoon(hub.key)}
              >
                {hubAreas.map((area) => (
                  <Link key={area.key} role="menuitem" to={area.items[0].to} className={area.key === activeAreaKey ? "active" : ""}>
                    <span className="hub-menu-label">{area.label}</span>
                    <span className="hub-menu-sub">{area.items.length} {area.items.length === 1 ? "page" : "pages"}</span>
                  </Link>
                ))}
              </div>,
              document.body
            )}
          </div>
        );
      })}
    </nav>
    {edges.right && (
      <button type="button" className="hub-scroll hub-scroll-right" aria-label="Scroll menu right" tabIndex={-1} onClick={() => scrollTabs(1)}>
        <HubChevron />
      </button>
    )}
    </div>
  );
}

function SidebarGroup({
  groupKey,
  label,
  items,
  summary,
  isOpen,
  isActive,
  onToggle,
}: {
  groupKey: string;
  label: string;
  items: NavGroupItem[];
  summary: NavSummary | undefined;
  isOpen: boolean;
  isActive: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={`sidebar-group-toggle${isActive ? " active" : ""}${isOpen ? " open" : ""}`}
        onClick={() => onToggle(groupKey)}
        aria-expanded={isOpen}
      >
        <span className="nav-label">{label}</span>
        <ChevronIcon />
      </button>
      {isOpen && (
        <div className="sidebar-submenu">
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} summary={summary} />
          ))}
        </div>
      )}
    </>
  );
}

// Agent accounts get a short, flat nav: the only areas the backend lets them
// read (AGENT_ROUTES in backend/src/lib/scope.js). Keep the two in step.
const AGENT_NAV_ITEMS = [
  { to: "/", label: "My Dashboard", end: true },
  { to: "/clients", label: "My Clients" },
  { to: "/deals", label: "My Deals" },
  { to: "/transactions", label: "Policies" },
  { to: "/renewals", label: "Renewals" },
  { to: "/analytics", label: "Analytics" },
  { to: "/claims", label: "Claims" },
  { to: "/appraisal", label: "My Appraisal" },
  { to: "/appraisal/feedback", label: "Feedback Requests" },
  { to: "/appraisal/training", label: "My Training" },
  { to: "/hr/me", label: "My Compliance File" },
  { to: "/news", label: "Industry News" },
  { to: "/faq", label: "FAQ" },
];

// The top bar shows one tab per hub and the sidebar lists the active area's pages, so a page lives in
// exactly one area. The areas follow the backend domains (backend/src/modules): clients, sales,
// underwriting, partners, finance, reports and compliance. Reinsurance and Policy Bank belong to
// underwriting; People and Admin are added per user.
const POOL: NavGroupItem[] = [
  ...NAV_ITEMS,
  ...SALES_PIPELINE_ITEMS,
  ...POLICIES_MONEY_ITEMS,
  ...SERVICE_CLAIMS_ITEMS,
  ...REPORT_ITEMS,
  { to: "/clients", label: "Clients" },
  { to: "/insurers", label: "Insurers" },
  { to: "/loss-adjusters", label: "Loss Adjusters" },
  { to: "/renewal-rules", label: "Renewal Rules" },
];
const pick = (...paths: string[]): NavGroupItem[] =>
  paths.map((p) => {
    const item = POOL.find((i) => i.to === p);
    if (!item) throw new Error(`nav: unknown path ${p}`);
    return item;
  });
// The Lead Portal (features/sales/lead-portal): tenders and intent signals, the daily digest, and leads
// turned into pipeline deals. Every staff role sees it (the API decides who may change what); agents don't.
const LEAD_PORTAL_ITEMS: NavGroupItem[] = [
  { to: "/lead-portal", label: "Overview", end: true },
  { to: "/lead-portal/leads", label: "Leads" },
  { to: "/lead-portal/digests", label: "Digests" },
  { to: "/lead-portal/runs", label: "Runs" },
  { to: "/lead-portal/setup", label: "Setup" },
];
// The customer portal (a separate app customers use) seen from the staff side: their quote requests, the payments
// to confirm, how customers can pay, their cancellation requests, Contact Us enquiries and the portal's audit trail. Their KYC is reviewed on KYC Submissions.
const PORTAL_ITEMS: NavGroupItem[] = [
  { to: "/portal/quote-requests", label: "Portal Quote Requests" },
  { to: "/portal/payments", label: "Portal Payments" },
  { to: "/portal/payment-methods", label: "Payment Methods" },
  { to: "/portal/pricing-markup", label: "Pricing Markup" },
  { to: "/portal/insurer-products", label: "Insurer Products" },
  { to: "/portal/cancellations", label: "Policy Cancellations" },
  { to: "/portal/enquiries", label: "Contact Enquiries" }, // admins only: hidden from others below
  { to: "/portal/activity", label: "Portal Activity" },
];
const ADMIN_ONLY_PORTAL_PATHS = new Set(["/portal/enquiries"]);
const NAV_AREAS = [
  { key: "clients", label: "Clients & CRM", items: pick("/clients", "/crm/coverage-gaps", "/quote-requests", "/client-messages") },
  { key: "sales", label: "Business & Sales", items: pick("/deals", "/deals/dashboard", "/kyc-submissions", "/expiring-policies", "/markets", "/cover-notes", "/campaigns", "/crm/bd-kpis") },
  { key: "customer-portal", label: "Customer Portal", items: PORTAL_ITEMS },
  { key: "lead-portal", label: "Lead Portal", items: LEAD_PORTAL_ITEMS },
  {
    key: "underwriting",
    label: "Policies & Claims",
    items: pick("/transactions", "/renewals", "/renewal-rules", "/broking-slips", "/claims", "/clause-library", "/policy-templates"),
  },
  { key: "partners", label: "Business Partners", items: pick("/insurers", "/loss-adjusters", "/producers", "/sub-brokers") },
  {
    key: "finance",
    label: "Financials & Accounting",
    items: [
      ...pick("/receipts", "/premium-invoices", "/commission-statements", "/insurer-remittances", "/refund-vouchers", "/expenses", "/financials", "/chart-of-accounts"),
      { to: "/premium-statements", label: "Premium Statements" },
      { to: "/premium-statements/exceptions", label: "Reconciliation Exceptions" },
      { to: "/accounting-periods", label: "Accounting Periods" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    items: REPORT_ITEMS.filter((i) => !["/compliance/reports", "/policy-compliance", "/reports/risk-matrix"].includes(i.to)),
  },
  { key: "compliance", label: "Compliance & Reporting", items: pick("/policy-compliance", "/compliance/reports", "/reports/risk-matrix") },
];

// The top bar groups areas into hubs, one per business domain. A hub with several areas opens a dropdown;
// the rest are plain links. Areas missing for a user are skipped.
const HUBS = [
  { key: "overview", label: "Shared", areaKeys: ["overview"], menu: false },
  { key: "clients-sales", label: "Clients & Sales", areaKeys: ["clients", "sales", "customer-portal", "lead-portal"], menu: true },
  { key: "underwriting", label: "Underwriting Hub", areaKeys: ["underwriting", "reinsurance", "policy-bank"], menu: true },
  { key: "partners", label: "Partners & Market", areaKeys: ["partners"], menu: false },
  { key: "finance", label: "Financials", areaKeys: ["finance", "ledger"], menu: true },
  { key: "report-hub", label: "Report Hub", areaKeys: ["reports"], menu: false },
  { key: "people-hub", label: "People & Compliance", areaKeys: ["compliance", "people", "hr-admin"], menu: true },
];
const OVERVIEW_AREA: NavArea = { key: "overview", label: "Shared", items: NAV_ITEMS };
const ADMIN_ITEMS = [
  { to: "/users", label: "Users" },
  { to: "/branches", label: "Branches" },
  { to: "/document-types", label: "Document Types" },
  { to: "/team", label: "Our Team" },
  { to: "/testimonials", label: "Testimonials" },
  { to: "/audit-log", label: "Audit Log" },
  { to: "/coverage-gap-rules", label: "Coverage Gap Rules" },
];

// Path -> breadcrumb trail, built once from the nav config above so page titles
// stay in sync with the sidebar without every page having to declare its own.
const BREADCRUMB_TRAILS: Record<string, string[]> = {};
for (const item of NAV_ITEMS) BREADCRUMB_TRAILS[item.to] = [item.label];
for (const area of NAV_AREAS) {
  for (const item of area.items) BREADCRUMB_TRAILS[item.to] = [area.label, item.label];
}
for (const tab of PB_TABS) BREADCRUMB_TRAILS[tab.to] = ["Policy Bank", tab.label];
for (const tab of GL_TABS) BREADCRUMB_TRAILS[tab.to] = ["General Ledger", tab.label];
BREADCRUMB_TRAILS["/client-messages/new"] = ["Client Messages", "New message"];
BREADCRUMB_TRAILS["/client-messages/email-setup"] = ["Client Messages", "Email replies setup"];
BREADCRUMB_TRAILS["/users"] = ["Admin", "Users"];
BREADCRUMB_TRAILS["/coverage-gap-rules"] = ["Admin", "Coverage Gap Rules"];
BREADCRUMB_TRAILS["/branches"] = ["Admin", "Branches"];
BREADCRUMB_TRAILS["/document-types"] = ["Admin", "Document Types"];
BREADCRUMB_TRAILS["/team"] = ["Admin", "Our Team"];
BREADCRUMB_TRAILS["/testimonials"] = ["Admin", "Testimonials"];
BREADCRUMB_TRAILS["/audit-log"] = ["Admin", "Audit Log"];
BREADCRUMB_TRAILS["/appraisal"] = ["Performance", "Appraisal"];
BREADCRUMB_TRAILS["/appraisal/team"] = ["Performance", "My Team"];
BREADCRUMB_TRAILS["/appraisal/cycles"] = ["Performance", "Appraisal Cycles"];
BREADCRUMB_TRAILS["/appraisal/templates"] = ["Performance", "Role Templates"];
BREADCRUMB_TRAILS["/appraisal/conduct-flags"] = ["Performance", "Conduct Flags"];
BREADCRUMB_TRAILS["/appraisal/pips"] = ["Performance", "Improvement Plans"];
BREADCRUMB_TRAILS["/appraisal/reports"] = ["Performance", "Appraisal Reports"];
BREADCRUMB_TRAILS["/appraisal/queues"] = ["Performance", "Appeals & Adjustments"];
BREADCRUMB_TRAILS["/appraisal/audit-findings"] = ["Performance", "Audit Findings"];
BREADCRUMB_TRAILS["/appraisal/feedback"] = ["Performance", "Feedback Requests"];
BREADCRUMB_TRAILS["/appraisal/training"] = ["Performance", "Training"];
BREADCRUMB_TRAILS["/appraisal/board"] = ["Performance", "Board Summary"];
BREADCRUMB_TRAILS["/appraisal/retention"] = ["Performance", "Retention Review"];
BREADCRUMB_TRAILS["/appraisal/templates"] = ["Performance", "Form Builder"];
BREADCRUMB_TRAILS["/hr/me"] = ["HR & Admin", "My Compliance File"];
BREADCRUMB_TRAILS["/hr/licensing"] = ["HR & Admin", "Licensing & E&O"];
BREADCRUMB_TRAILS["/hr/assets"] = ["HR & Admin", "Corporate Assets"];
BREADCRUMB_TRAILS["/hr/pay"] = ["HR & Admin", "Commission & Bonus Tiers"];
BREADCRUMB_TRAILS["/hr/reassignments"] = ["HR & Admin", "Book Reassignment"];
BREADCRUMB_TRAILS["/org/employees"] = ["People & Org", "Employees"];
BREADCRUMB_TRAILS["/org/departments"] = ["People & Org", "Departments"];
BREADCRUMB_TRAILS["/org/attribution"] = ["People & Org", "Record Attribution"];
BREADCRUMB_TRAILS["/sub-brokers/reports"] = ["Business Partners", "Sub-Brokers", "Reports"];
BREADCRUMB_TRAILS["/sub-brokers/approvals"] = ["Business Partners", "Sub-Brokers", "Split approvals"];
BREADCRUMB_TRAILS["/sub-brokers/settings"] = ["Business Partners", "Sub-Brokers", "Settings"];
BREADCRUMB_TRAILS["/sub-brokers/payments"] = ["Business Partners", "Sub-Brokers", "Payments"];
BREADCRUMB_TRAILS["/reinsurance"] = ["Reinsurance", "Overview"];
BREADCRUMB_TRAILS["/reinsurance/placements"] = ["Reinsurance", "Placements"];
BREADCRUMB_TRAILS["/reinsurance/treaties"] = ["Reinsurance", "Treaties"];
BREADCRUMB_TRAILS["/reinsurance/renewals"] = ["Reinsurance", "Renewals due"];
BREADCRUMB_TRAILS["/reinsurance/claims"] = ["Reinsurance", "Claims"];
BREADCRUMB_TRAILS["/reinsurance/accounts"] = ["Reinsurance", "Accounts"];
BREADCRUMB_TRAILS["/reinsurance/billings"] = ["Reinsurance", "Billings"];
BREADCRUMB_TRAILS["/reinsurance/treaty-accounts"] = ["Reinsurance", "Treaty accounts"];
BREADCRUMB_TRAILS["/reinsurance/bordereaux"] = ["Reinsurance", "Bordereaux"];
BREADCRUMB_TRAILS["/reinsurance/ledger"] = ["Reinsurance", "Ledger"];
BREADCRUMB_TRAILS["/reinsurance/parties"] = ["Reinsurance", "Reinsurers & parties"];
BREADCRUMB_TRAILS["/reinsurance/approvals"] = ["Reinsurance", "Approvals"];
BREADCRUMB_TRAILS["/reinsurance/rules"] = ["Reinsurance", "Rules & approved list"];
BREADCRUMB_TRAILS["/reinsurance/admin"] = ["Reinsurance", "Administration"];
BREADCRUMB_TRAILS["/account"] = ["Account"];
BREADCRUMB_TRAILS["/transactions/import"] = ["Policies & Claims", "Transactions", "Import"];

const SUFFIX_LABELS: Record<string, string> = { new: "New", edit: "Edit", import: "Import", calibration: "Calibration", pay: "Pay commission", "directory-import": "Load directory" };

function useBreadcrumb(pathname: string): string[] {
  return useMemo(() => {
    if (pathname === "/") return [];
    const bases = Object.keys(BREADCRUMB_TRAILS).sort((a, b) => b.length - a.length);
    const base = bases.find((b) => pathname === b || pathname.startsWith(`${b}/`));
    if (!base) return [];
    const trail = [...BREADCRUMB_TRAILS[base]];
    const remainder = pathname.slice(base.length).split("/").filter(Boolean);
    for (const segment of remainder) {
      trail.push(SUFFIX_LABELS[segment] ?? "Details");
    }
    return trail;
  }, [pathname]);
}

// Everyone except agents (who get "My Appraisal" in their own nav). The HR
// and flag items are added per user by performanceItems().
function performanceItems(access: {
  hr: boolean; flags: boolean; appeals: boolean; findings: boolean; board: boolean; retention: boolean;
}): NavGroupItem[] {
  return [
    // `end`: /appraisal/cycles and a colleague's /appraisal/:id aren't "mine".
    { to: "/appraisal", label: "My Appraisal", end: true },
    { to: "/appraisal/team", label: "My Team" },
    { to: "/appraisal/feedback", label: "Feedback Requests" },
    { to: "/appraisal/pips", label: "Improvement Plans" },
    { to: "/appraisal/training", label: access.hr ? "Training & Certification" : "My Training" },
    ...(access.hr
      ? [
          { to: "/appraisal/cycles", label: "Appraisal Cycles" },
          { to: "/appraisal/reports", label: "Appraisal Reports" },
          { to: "/appraisal/templates", label: "Form Builder" },
        ]
      : []),
    ...(access.board ? [{ to: "/appraisal/board", label: "Board Summary" }] : []),
    ...(access.appeals ? [{ to: "/appraisal/queues", label: "Appeals & Adjustments" }] : []),
    ...(access.flags ? [{ to: "/appraisal/conduct-flags", label: "Conduct Flags" }] : []),
    ...(access.findings ? [{ to: "/appraisal/audit-findings", label: "Audit Findings" }] : []),
    ...(access.retention ? [{ to: "/appraisal/retention", label: "Retention Review" }] : []),
  ];
}

// Licensing, E&O, assets, pay and book reassignment (modules/hr). Each item shows only to people the API
// would let in (hrAccessFor mirrors it); everyone else sees just their own compliance file.
function hrOpsItems(user: { isAdmin: boolean; appraisalRoles?: string[] } | null): NavGroupItem[] {
  const a = hrAccessFor(user);
  return [
    { to: "/hr/me", label: "My Compliance File" },
    ...(a.manageCompliance ? [{ to: "/hr/licensing", label: "Licensing & E&O" }] : []),
    ...(a.managePay ? [{ to: "/hr/assets", label: "Corporate Assets" }] : []),
    ...(a.readPay ? [{ to: "/hr/pay", label: "Commission & Bonus Tiers" }] : []),
    ...(a.viewReassignments ? [{ to: "/hr/reassignments", label: "Book Reassignment" }] : []),
  ];
}

// HR or admin only (backend lib/orgAccess.js).
const ORG_ITEMS = [
  { to: "/org/employees", label: "Employees" },
  { to: "/org/departments", label: "Departments" },
  { to: "/org/attribution", label: "Record Attribution" },
];

function buildCommandItems(isAdmin: boolean, isAgent: boolean, isHr: boolean, performance: NavGroupItem[], hrOps: NavGroupItem[]): CommandItem[] {
  if (isAgent) return AGENT_NAV_ITEMS.map((i) => ({ to: i.to, label: i.label, group: "My book" }));
  const items: CommandItem[] = NAV_ITEMS.map((i) => ({ to: i.to, label: i.label, group: "General" }));
  for (const area of NAV_AREAS) {
    for (const item of area.items) if (isAdmin || !ADMIN_ONLY_PORTAL_PATHS.has(item.to)) items.push({ to: item.to, label: item.label, group: area.label });
  }
  for (const item of performance) items.push({ to: item.to, label: item.label, group: "Performance" });
  for (const item of hrOps) items.push({ to: item.to, label: item.label, group: "HR & Admin" });
  if (isHr) {
    for (const item of ORG_ITEMS) items.push({ to: item.to, label: item.label, group: "People & Org" });
  }
  if (isAdmin) {
    for (const item of ADMIN_ITEMS) items.push({ to: item.to, label: item.label, group: "Admin" });
  }
  return items;
}

export function AppShell({ children }: { children: ReactNode }) {
  useSignedInTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [manualOpenGroups, setManualOpenGroups] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastAreaKey, setLastAreaKey] = useState("overview");
  const narrow = useIsNarrow();
  const { data: summary } = useNavSummary(!!user);

  const breadcrumb = useBreadcrumb(location.pathname);
  // Reinsurance: shown only when the module is on and the person holds a reinsurance
  // role; an admin always gets the Administration link, which is how it is switched on.
  const ri = useReinsuranceStatus(!!user && !user.isAgent);
  const reinsurance = useMemo<NavGroupItem[]>(() => {
    const items: NavGroupItem[] = [];
    if (ri.can("ri.view")) {
      items.push({ to: "/reinsurance", label: "Overview" }, { to: "/reinsurance/placements", label: "Placements" }, { to: "/reinsurance/treaties", label: "Treaties" }, { to: "/reinsurance/renewals", label: "Renewals due" }, { to: "/reinsurance/claims", label: "Claims" }, { to: "/reinsurance/accounts", label: "Accounts" }, { to: "/reinsurance/billings", label: "Billings" }, { to: "/reinsurance/treaty-accounts", label: "Treaty accounts" }, { to: "/reinsurance/bordereaux", label: "Bordereaux" }, { to: "/reinsurance/ledger", label: "Ledger" }, { to: "/reinsurance/parties", label: "Reinsurers & parties" }, { to: "/reinsurance/rules", label: "Rules & approved list" });
      if (ri.can("ri.placement.approve") || ri.can("ri.sign.approve")) items.push({ to: "/reinsurance/approvals", label: "Approvals" });
    }
    if (user?.isAdmin) items.push({ to: "/reinsurance/admin", label: "Administration" });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ri.status, user?.isAdmin]);
  // Policy Bank: shown to anyone holding a Policy Bank permission (admins hold all). Agents never see it.
  const policyBank = usePbAccess(!!user && !user.isAgent);
  // General Ledger: shown to anyone holding an accounting role (admins hold all). Agents never see it.
  const ledger = useGlAccess(!!user && !user.isAgent);
  const access = appraisalAccess(user);
  const performance = useMemo(
    () => performanceItems({ hr: access.hr, flags: access.flags, appeals: access.appeals, findings: access.findings, board: access.board, retention: access.retention }),
    [access.hr, access.flags, access.appeals, access.findings, access.board, access.retention]
  );
  const hrOps = useMemo(() => hrOpsItems(user), [user]);
  const commandItems = useMemo(
    () => buildCommandItems(!!user?.isAdmin, !!user?.isAgent, !!user?.isHr, performance, hrOps),
    [user?.isAdmin, user?.isAgent, user?.isHr, performance, hrOps]
  );

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // The drawer (phones and small tablets): Esc closes it, the page behind it does not scroll, and it closes
  // by itself when the window widens past the breakpoint.
  useEffect(() => {
    if (!narrow) setSidebarOpen(false);
  }, [narrow]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("nav-open");
    };
  }, [sidebarOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const areas = useMemo<NavArea[]>(() => {
    const navAreas = user?.isAdmin ? NAV_AREAS : NAV_AREAS.map((a) => (a.key === "customer-portal" ? { ...a, items: a.items.filter((i) => !ADMIN_ONLY_PORTAL_PATHS.has(i.to)) } : a));
    const list: NavArea[] = [OVERVIEW_AREA, ...navAreas];
    if (reinsurance.length) list.push({ key: "reinsurance", label: "Reinsurance", items: reinsurance });
    if (policyBank.hasAny) list.push({ key: "policy-bank", label: "Policy Bank", items: PB_TABS });
    if (ledger.hasAny) list.push({ key: "ledger", label: "General Ledger", items: GL_TABS });
    list.push({ key: "people", label: "People & Performance", items: [...performance, ...(user?.isHr ? ORG_ITEMS : [])] });
    list.push({ key: "hr-admin", label: "HR & Admin", items: hrOps });
    if (user?.isAdmin) list.push({ key: "admin", label: "Admin", items: ADMIN_ITEMS });
    return list;
  }, [reinsurance, performance, hrOps, user?.isHr, user?.isAdmin, policyBank.hasAny, ledger.hasAny]);

  // Pages in no area (e.g. /account) keep the last area on screen instead of emptying the sidebar.
  const matchedAreaKey = areaForPath(areas, location.pathname);
  useEffect(() => {
    if (matchedAreaKey) setLastAreaKey(matchedAreaKey);
  }, [matchedAreaKey]);
  const activeArea = areas.find((a) => a.key === (matchedAreaKey ?? lastAreaKey)) ?? areas[0];

  useEffect(() => {
    setCreateOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!createOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest(".create-menu")) setCreateOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [createOpen]);

  function isGroupActive(items: NavGroupItem[]) {
    return items.some((item) => onPath(location.pathname, item.to));
  }

  function isGroupOpen(key: string, items: NavGroupItem[]) {
    return manualOpenGroups[key] ?? isGroupActive(items);
  }

  function toggleGroup(key: string) {
    const items = areas.find((a) => a.key === key)?.items ?? [];
    setManualOpenGroups((prev) => ({ ...prev, [key]: !isGroupOpen(key, items) }));
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      // Leave even if the server call fails, so the button never appears dead.
      navigate("/");
    }
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <button
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          className="btn-secondary btn-sm mobile-nav-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {sidebarOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <div className="topbar-brand">
          <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" />
          <span className="topbar-brand-text">Green Pacific</span>
        </div>
        <span className="topbar-date" title="Today's date">{new Date().toISOString().slice(0, 10)}</span>
        {!user?.isAgent && <TopbarHubs areas={areas} activeAreaKey={activeArea.key} />}
        <button type="button" className="btn-secondary btn-sm topbar-search" aria-label="Quick jump" title="Quick jump (Ctrl K)" onClick={() => setPaletteOpen(true)}>
          <span aria-hidden="true">🔍</span> <span className="topbar-label">Quick jump</span> <kbd>Ctrl K</kbd>
        </button>
        <div className="topbar-actions">
          {user?.canWrite && !user.isAgent && (
            <div className="create-menu">
              <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={createOpen} onClick={() => setCreateOpen((v) => !v)}>
                + <span className="create-label">Create</span>
              </button>
              {createOpen && (
                <div className="create-menu-list" role="menu">
                  <Link role="menuitem" to="/clients/new">New client</Link>
                  <Link role="menuitem" to="/transactions/new">New policy</Link>
                  <Link role="menuitem" to="/deals/new">New deal</Link>
                  <Link role="menuitem" to="/tasks/new">New task</Link>
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn-secondary btn-sm topbar-search-icon" aria-label="Quick jump" onClick={() => setPaletteOpen(true)}>
            <span aria-hidden="true">🔍</span>
          </button>
          <ThemeToggle className="btn-secondary btn-sm" />
        </div>
      </header>

      <aside id="app-sidebar" className={`sidebar${sidebarOpen ? " open" : ""}`} inert={narrow && !sidebarOpen}>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {user?.isAgent ? (
            AGENT_NAV_ITEMS.map((item) => <SidebarLink key={item.to} item={item} summary={summary} />)
          ) : narrow ? (
            // No room for the area tabs on a phone: every area is a collapsible group in the drawer.
            areas.map((area) => (
              <SidebarGroup
                key={area.key}
                groupKey={area.key}
                label={area.label}
                items={area.items}
                summary={summary}
                isActive={isGroupActive(area.items)}
                isOpen={isGroupOpen(area.key, area.items)}
                onToggle={toggleGroup}
              />
            ))
          ) : (
            <>
              <div className="sidebar-section-label">{activeArea.label}</div>
              {activeArea.items.map((item) => (
                <SidebarLink key={item.to} item={item} summary={summary} />
              ))}
            </>
          )}
        </nav>
        <StatsPanel summary={summary} />
        {user?.isAdmin && !narrow && (
          <NavLink to="/users" className={`sidebar-admin${activeArea.key === "admin" ? " active" : ""}`}>
            <span className="nav-label">Admin</span>
          </NavLink>
        )}
        {user && (
          <div className="user-menu sidebar-user">
            <NavLink to="/account" className="username">
              <span className="user-avatar">{(user.firstName || user.name).charAt(0).toUpperCase()}</span>
              <span className="user-name" title={user.email}>{user.name}</span>
            </NavLink>
            <button type="button" className="btn-secondary btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </aside>
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main id="main-content" className="main-content">
        <div className="container">
          {breadcrumb.length > 0 && (
            <div className="breadcrumb-bar">
              <button type="button" className="breadcrumb-back" onClick={() => navigate(-1)} aria-label="Go back">
                ←
              </button>
              <NavLink to="/">Home</NavLink>
              {breadcrumb.map((label, idx) => (
                <span key={`${label}-${idx}`}>
                  <span className="breadcrumb-sep">/</span>
                  <span className={idx === breadcrumb.length - 1 ? "breadcrumb-current" : ""}>{label}</span>
                </span>
              ))}
            </div>
          )}
          {children}
          <footer className="app-footer">
            <CompanyContact />
          </footer>
        </div>
      </main>

      <CommandPalette items={commandItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
