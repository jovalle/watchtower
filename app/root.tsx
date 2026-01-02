import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import "./tailwind.css";
import { Shell } from "~/components/layout";
import { InstallPrompt } from "~/components/pwa";
import { getPlexToken } from "~/lib/auth/session.server";
import { runStartupChecks } from "~/lib/startup.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Run startup checks on first request
  const token = await getPlexToken(request);
  await runStartupChecks(token ?? undefined);
  return json({});
}

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-background-primary">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased bg-background-primary text-foreground-primary">
        {children}
        <ScrollRestoration />
        <Scripts />
        <InstallPrompt />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message || "The page you requested could not be found.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <Shell>
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground-primary">{title}</h1>
          <p className="mt-4 text-foreground-muted">{message}</p>
          <a
            href="/"
            className="mt-8 inline-block rounded-md bg-accent-primary px-6 py-3 text-white transition-colors hover:bg-accent-hover"
          >
            Go Home
          </a>
        </div>
      </div>
    </Shell>
  );
}
