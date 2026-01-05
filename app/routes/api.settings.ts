/**
 * User settings API endpoint.
 * GET /api/settings - Get current user's settings
 * PUT /api/settings - Update current user's settings
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/lib/auth/user.server";
import {
  getUserSettings,
  setUserSettings,
  getDefaultSettings,
  getValidationCache,
  getDefaultValidationCache,
} from "~/lib/settings/storage.server";

/**
 * GET /api/settings
 * Returns the current user's settings and validation cache.
 */
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const user = await requireUser(request);
  const settings = await getUserSettings(user.id);
  const validationCache = await getValidationCache(user.id);

  return json({
    settings: settings ?? getDefaultSettings(),
    validationCache: validationCache ?? getDefaultValidationCache(),
  });
}

/**
 * PUT /api/settings
 * Updates the current user's settings.
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await requireUser(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate body structure
  if (typeof body !== "object" || body === null) {
    return json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { traktUsername, imdbWatchlistIds } = body as Record<string, unknown>;

  // Validate traktUsername - must be string or null
  if (traktUsername !== undefined && traktUsername !== null && typeof traktUsername !== "string") {
    return json({ error: "traktUsername must be a string or null" }, { status: 400 });
  }

  // Validate imdbWatchlistIds - must be array of strings
  if (imdbWatchlistIds !== undefined) {
    if (!Array.isArray(imdbWatchlistIds)) {
      return json({ error: "imdbWatchlistIds must be an array" }, { status: 400 });
    }
    if (!imdbWatchlistIds.every((id) => typeof id === "string")) {
      return json({ error: "imdbWatchlistIds must contain only strings" }, { status: 400 });
    }
  }

  // Build update object with only provided fields
  const updates: { traktUsername?: string | null; imdbWatchlistIds?: string[] } = {};
  if (traktUsername !== undefined) {
    updates.traktUsername = traktUsername as string | null;
  }
  if (imdbWatchlistIds !== undefined) {
    updates.imdbWatchlistIds = imdbWatchlistIds as string[];
  }

  await setUserSettings(user.id, updates);

  // Return updated settings
  const updatedSettings = await getUserSettings(user.id);
  return json({ settings: updatedSettings ?? getDefaultSettings() });
}
