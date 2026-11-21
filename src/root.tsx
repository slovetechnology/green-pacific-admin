import { DialogHost } from "@/shared/components/Dialogs";
import { QueryClientProvider } from "@tanstack/react-query";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { queryClient } from "@/app/providers/queryClient";
import { AuthProvider } from "@/features/platform/auth/AuthContext";
import { installApiLinkDownloads } from "@/shared/api/client";
import { applyTheme } from "@/shared/lib/theme";
import "@/shared/styles/app.css";
import "@/shared/styles/responsive.css";

export function links() {
  return [
    { rel: "icon", type: "image/png", href: "/logo.png" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap",
    },
  ];
}

export function meta() {
  return [{ title: "Green Pacific Insurance Brokers Ltd" }];
}

// Every page paints light first; dark mode is applied only inside a signed-in shell (useSignedInTheme).
const THEME_BOOT_SCRIPT = `document.documentElement.dataset.theme="light"`;

// The HTML shell. In SPA mode this is pre-rendered once at build time into index.html.
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#163229" />
        {/* Light before the page paints, so a dark device setting never flashes dark before sign-in. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

if (typeof window !== "undefined") {
  applyTheme("light");
  installApiLinkDownloads();
}

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
      <DialogHost />
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return <p style={{ padding: "2rem", fontFamily: "sans-serif" }}>Loading…</p>;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unexpected error";
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <a href="/">Back to the dashboard</a>
    </main>
  );
}
