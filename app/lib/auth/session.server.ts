/**
 * Session management using Remix cookie session storage.
 * Handles Plex authentication tokens securely in httpOnly cookies.
 */

import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { env } from "~/lib/env.server";

type SessionData = {
  plexToken: string;      // OAuth token for plex.tv API calls
  serverToken: string;    // Server-specific token for Plex server API calls
  isOwner: boolean;       // Whether the user owns this Plex server
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
    secure: env.SECURE_COOKIES,
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
 * Get the server-specific token from the session, if it exists.
 * This token should be used for Plex server API calls.
 */
export async function getServerToken(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const token = session.get("serverToken");
  return token ?? null;
}

/**
 * Require a valid server token, redirecting to login if not present.
 * Use this for routes that need to access the Plex server directly.
 */
export async function requireServerToken(request: Request): Promise<string> {
  const token = await getServerToken(request);
  if (!token) {
    throw redirect("/auth/redirect");
  }
  return token;
}

/**
 * Set the server-specific token and owner status in the session.
 */
export async function setServerToken(request: Request, serverToken: string, isOwner: boolean = false): Promise<string> {
  const session = await getSession(request);
  session.set("serverToken", serverToken);
  session.set("isOwner", isOwner);
  return commitSession(session);
}

/**
 * Check if the current user is the server owner.
 */
export async function isServerOwner(request: Request): Promise<boolean> {
  const session = await getSession(request);
  return session.get("isOwner") === true;
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
