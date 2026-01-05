/**
 * User context helpers for getting the current authenticated Plex user.
 * Provides convenient access to user identity for settings and personalization.
 */

import { redirect } from "@remix-run/node";
import { getPlexToken } from "./session.server";
import { getPlexUser, type PlexUser } from "./plex.server";

export type { PlexUser };

/**
 * Get the current authenticated Plex user from session.
 * Returns null if not authenticated or token is invalid.
 */
export async function getCurrentUser(request: Request): Promise<PlexUser | null> {
  const token = await getPlexToken(request);
  if (!token) return null;
  return getPlexUser(token);
}

/**
 * Require authenticated user, redirect to login if not present.
 * Use in loaders that need user identity.
 */
export async function requireUser(request: Request): Promise<PlexUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw redirect("/auth/redirect");
  }
  return user;
}
