/**
 * Session management using Remix cookie session storage.
 * Handles Plex authentication tokens securely in httpOnly cookies.
 */

import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { env } from "~/lib/env.server";

type SessionData = {
  plexToken: string;
  pendingPinId: number;
};

type SessionFlashData = {
  error: string;
};

const sessionStorage = createCookieSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: "__plex_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
    secrets: [env.SESSION_SECRET],
    secure: env.isProduction,
  },
});

/**
 * Get the session from the request's cookies.
 */
export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

/**
 * Commit the session and return the Set-Cookie header value.
 */
export async function commitSession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.commitSession(session);
}

/**
 * Destroy the session and return the Set-Cookie header value.
 */
export async function destroySession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.destroySession(session);
}

/**
 * Get the Plex token from the session, if it exists.
 */
export async function getPlexToken(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const token = session.get("plexToken");
  return token ?? null;
}

/**
 * Require a valid Plex token, redirecting to login if not present.
 */
export async function requirePlexToken(request: Request): Promise<string> {
  const token = await getPlexToken(request);
  if (!token) {
    throw redirect("/auth/redirect");
  }
  return token;
}

/**
 * Create a new user session with the Plex token and redirect.
 */
export async function createUserSession(plexToken: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("plexToken", plexToken);
  // Clear any pending auth state
  session.unset("pendingPinId");

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

/**
 * Store a pending PIN ID for CSRF protection during OAuth flow.
 */
export async function setPendingPinId(request: Request, pinId: number) {
  const session = await getSession(request);
  session.set("pendingPinId", pinId);
  return commitSession(session);
}

/**
 * Get and clear the pending PIN ID from the session.
 */
export async function getPendingPinId(request: Request): Promise<number | null> {
  const session = await getSession(request);
  const pinId = session.get("pendingPinId");
  return pinId ?? null;
}

/**
 * Clear the session and redirect to Plex login.
 * Used when token validation fails (e.g., user revoked access on plex.tv).
 * Redirects to /auth/redirect to skip the login button and go directly to Plex.
 */
export async function clearSession(request: Request) {
  const session = await getSession(request);
  return redirect("/auth/redirect", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
