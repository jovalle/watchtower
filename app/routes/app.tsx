/**
 * Authenticated layout - requires valid Plex token AND server access.
 * All routes under _app/ are protected and require authentication.
 *
 * SECURITY: This layout performs TWO critical checks:
 * 1. Valid Plex account (token validation against plex.tv)
 * 2. Access to THIS specific Plex server (server access verification)
 *
 * A user must pass BOTH checks to access the application.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { Header } from "~/components/layout";
import { requirePlexToken, clearSession, getServerToken, getSession, commitSession } from "~/lib/auth/session.server";
import { getPlexUser, verifyServerAccess, type PlexUser } from "~/lib/auth/plex.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication - redirects to Plex login if no token
  const token = await requirePlexToken(request);

  // Validate token by fetching user profile from plex.tv
  // This ensures the token is still valid (not revoked on plex.tv)
  const user = await getPlexUser(token);
  console.log(`[App Loader] User: ${user?.username} (ID: ${user?.id})`);

  if (!user) {
    // Token is invalid or expired - clear session and redirect to login
    throw await clearSession(request);
  }

  // Check if we already have a server token
  let serverToken = await getServerToken(request);

  // If no server token, verify access and get one
  if (!serverToken) {
    // SECURITY CHECK: Verify user has access to THIS Plex server's libraries
    const serverAccess = await verifyServerAccess(token);

    if (!serverAccess.hasAccess) {
      // User is a valid Plex user but NOT authorized for this server
      const errorMessage = encodeURIComponent(
        serverAccess.error || "You do not have access to this Plex server."
      );
      throw redirect(`/access-denied?error=${errorMessage}`);
    }

    // Store server token and owner status in session
    serverToken = serverAccess.serverToken || token;
    const session = await getSession(request);
    session.set("serverToken", serverToken);
    session.set("isOwner", serverAccess.isOwner === true);

    // Redirect to same URL with updated session
    const url = new URL(request.url);
    throw redirect(url.pathname + url.search, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
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
