/**
 * Access Denied page - shown when a user has a valid Plex account
 * but is NOT authorized to access this specific Plex server.
 *
 * This is a CRITICAL security boundary - it ensures that only users
 * who have been explicitly granted access to the server can view content.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { ShieldX, LogOut, HelpCircle } from "lucide-react";
import { getPlexToken } from "~/lib/auth/session.server";
import { getPlexUser } from "~/lib/auth/plex.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Access Denied - Watchtower" },
    { name: "description", content: "You do not have access to this server" },
  ];
};

interface LoaderData {
  username: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Try to get user info to personalize the message
  const token = await getPlexToken(request);
  let username: string | null = null;

  if (token) {
    const user = await getPlexUser(token);
    username = user?.username || user?.title || null;
  }

  return json<LoaderData>({ username });
}

export default function AccessDenied() {
  const { username } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const errorMessage = searchParams.get("error") || "You do not have access to this Plex server.";

  return (
    <div className="flex min-h-screen flex-col bg-background-primary">
      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-6">
          {/* Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
            <ShieldX className="h-10 w-10 text-red-500" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground-primary">Access Denied</h1>

          {/* Personalized message if we know the user */}
          {username && (
            <p className="text-lg text-foreground-secondary">
              Hi <span className="font-semibold text-foreground-primary">{username}</span>,
            </p>
          )}

          {/* Error message */}
          <p className="text-foreground-secondary">{errorMessage}</p>

          {/* Explanation */}
          <div className="rounded-lg bg-background-elevated p-4 text-left">
            <div className="flex items-start gap-3">
              <HelpCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-foreground-muted" />
              <div className="text-sm text-foreground-secondary">
                <p className="mb-2">
                  <strong className="text-foreground-primary">Why am I seeing this?</strong>
                </p>
                <p>
                  Watchtower is a private streaming service. To access the content,
                  you need to be invited to the Plex server by the owner.
                </p>
                <p className="mt-2">
                  If you believe you should have access, please contact the server
                  administrator.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4">
            {/* Logout and try different account */}
            <Form method="post" action="/auth/logout">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-primary px-6 py-3 font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                <LogOut className="h-4 w-4" />
                Try a Different Account
              </button>
            </Form>

            {/* Back to home */}
            <a
              href="/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-foreground-muted/20 bg-transparent px-6 py-3 font-semibold text-foreground-primary transition-colors hover:bg-background-elevated"
            >
              Return Home
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-background-elevated py-6">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-foreground-muted">
          <p>Watchtower - Private Streaming</p>
        </div>
      </footer>
    </div>
  );
}
