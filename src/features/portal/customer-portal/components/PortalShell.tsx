import { type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { usePortalAuth } from "../PortalAuthContext";
import { initials } from "./format";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { useSignedInTheme } from "@/shared/lib/theme";
import "@/shared/styles/portal-tailwind.css";
import "@/shared/styles/portal-theme.css";
import { COMPANY } from "@/shared/lib/company";

const NAV_ITEMS = [
  { to: "/portal", label: "Overview", end: true },
  { to: "/portal/policies", label: "My Policies" },
  { to: "/portal/claims", label: "Claims" },
  { to: "/portal/billing", label: "Premiums" },
  { to: "/portal/documents", label: "Documents" },
  { to: "/portal/quotes", label: "Request a Quote" },
  { to: "/portal/marketplace", label: "Insurance Marketplace" },
  { to: "/portal/faq", label: "Insurance FAQ" },
  { to: "/portal/messages", label: "Messages" },
  { to: "/portal/account", label: "My Details" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  useSignedInTheme();
  const { customer, client, logout } = usePortalAuth();
  const navigate = useNavigate();
  const unread = useQuery({
    queryKey: ["portal", "messages-unread"],
    queryFn: () => api.get<{ unread: number }>("/api/portal/messages/unread"),
    enabled: Boolean(customer),
    refetchInterval: 60_000,
  }).data?.unread ?? 0;
  async function handleLogout() {
    await logout();
    navigate("/portal/login");
  }

  return (
    <div className="customer-portal">
      <div className="cp-shell">
        <a className="cp-skip-link" href="#portal-main-content">Skip to main content</a>
        <nav className="cp-rail" aria-label="Portal sections">
          <div className="cp-brandbox">
            <div className="cp-brand">Green Pacific</div>
            <div className="cp-brandsub">Client portal</div>
          </div>
          <div className="cp-navlist">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `cp-navbtn${isActive ? " active" : ""}`}
              >
                {item.label}
                {item.to === "/portal/messages" && unread > 0 && (
                  <span className="cp-navcount" aria-label={`${unread} unread`}>{unread}</span>
                )}
              </NavLink>
            ))}
          </div>
          {client && (
            <div className="cp-railfoot">
              <b>{client.name}</b>
              Your account officer<br />{COMPANY.mobiles.join(", ")}<br />{COMPANY.email}
            </div>
          )}
        </nav>

        <main id="portal-main-content">
          <header className="cp-topbar">
            <div>
              <h1>Welcome{customer ? `, ${customer.name.split(" ")[0]}` : ""}</h1>
              <div className="cp-sub">
                {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
            <div className="cp-spacer" />
            <ThemeToggle className="cp-btn cp-btn--ghost cp-btn--sm cp-theme-toggle" />
            <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={handleLogout}>
              Sign out
            </button>
            <div className="cp-avatar" aria-hidden="true">
              {initials(customer?.name)}
            </div>
          </header>
          <div className="cp-wrap">{children}</div>
        </main>
      </div>
    </div>
  );
}
