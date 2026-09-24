/**
 * User context helpers for getting the current authenticated Plex user.
 * Provides convenient access to user identity for settings and personalization.
 */

import { redirect } from "@remix-run/node";
import { LRUCache } from "lru-cache";
import { getPlexToken } from "./session.server";
import { getPlexUser, type PlexUser } from "./plex.server";

export type { PlexUser };

// Avoids a plex.tv round trip on every loader that needs the user's ID.
const userCache = new LRUCache<string, PlexUser>({ max: 500, ttl: 5 * 60 * 1000 });

/**
 * Get the current authenticated Plex user from session.
 * Returns null if not authenticated or token is invalid.
 */
export async function getCurrentUser(request: Request): Promise<PlexUser | null> {
  const token = await getPlexToken(request);
  if (!token) return null;
  const cached = userCache.get(token);
  if (cached) return cached;
  const user = await getPlexUser(token);
  if (user) userCache.set(token, user);
  return user;
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
