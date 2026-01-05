/**
 * IMDB list validation endpoint.
 * GET /api/validate/imdb?listId=xxx
 *
 * Validates that an IMDB list ID is valid and accessible.
 * Caches the validation result for the current user.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { validateIMDBList } from "~/lib/imdb/client.server";
import { requireUser } from "~/lib/auth/user.server";
import { getValidationCache, setIMDBValidations } from "~/lib/settings/storage.server";
import type { IMDBValidationCache } from "~/lib/settings/types";

interface ValidationResult {
  valid: boolean;
  itemCount?: number;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const listId = url.searchParams.get("listId");

  // Validate listId parameter
  if (!listId || listId.trim() === "") {
    return json<ValidationResult>(
      { valid: false, error: "List ID is required" },
      { status: 400 }
    );
  }

  // Validate the list
  const result = await validateIMDBList(listId.trim());

  // Update the cached validation for this specific list ID
  const cache = await getValidationCache(user.id);
  const trimmedId = listId.trim();

  // Create new validation entry
  const newValidation: IMDBValidationCache = {
    listId: trimmedId,
    status: result.valid ? "valid" : "invalid",
    itemCount: result.itemCount,
    message: result.error,
    validatedAt: Date.now(),
  };

  // Update or add this list ID's validation (replace if exists, add if new)
  const existingIndex = cache.imdb.findIndex(v => v.listId === trimmedId);
  if (existingIndex >= 0) {
    cache.imdb[existingIndex] = newValidation;
  } else {
    cache.imdb.push(newValidation);
  }

  await setIMDBValidations(user.id, cache.imdb);

  return json<ValidationResult>(result);
}
