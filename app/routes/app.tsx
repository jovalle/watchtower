/**
 * Authenticated layout - requires valid Plex token.
 * All routes under _app/ are protected and require authentication.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { Header } from "~/components/layout";
import { requirePlexToken, clearSession } from "~/lib/auth/session.server";
import { getPlexUser, type PlexUser } from "~/lib/auth/plex.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication - redirects to Plex login if no token
  const token = await requirePlexToken(request);

  // Validate token by fetching user profile from plex.tv
  // This ensures the token is still valid (not revoked on plex.tv)
  const user = await getPlexUser(token);

  if (!user) {
    // Token is invalid or expired - clear session and redirect to login
    throw await clearSession(request);
  }

  return json({ user });
}

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen">
      {/* Header with navigation */}
      <Header user={user} />

      {/* Main content - add top padding to account for fixed header */}
      <main className="pt-16">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}

/**
 * Hook to access authenticated user from child routes.
 */
export function useUser(): PlexUser {
  const { user } = useLoaderData<typeof loader>();
  return user;
}
