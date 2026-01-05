/**
 * Trakt username validation endpoint.
 * GET /api/validate/trakt?username=xxx
 *
 * Validates that a Trakt username exists and has a public watchlist.
 * Caches the validation result for the current user.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createTraktClient, isTraktAvailable } from "~/lib/trakt/client.server";
import { requireUser } from "~/lib/auth/user.server";
import { setTraktValidation } from "~/lib/settings/storage.server";
import type { TraktValidationCache } from "~/lib/settings/types";

interface ValidationResult {
  valid: boolean;
  itemCount?: number;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const username = url.searchParams.get("username");

  // Check if Trakt is configured
  if (!isTraktAvailable()) {
    return json<ValidationResult>(
      { valid: false, error: "Trakt integration not configured on server" },
      { status: 503 }
    );
  }

  // Validate username parameter
  if (!username || username.trim() === "") {
    // Clear cached validation when username is empty
    await setTraktValidation(user.id, null);
    return json<ValidationResult>(
      { valid: false, error: "Username is required" },
      { status: 400 }
    );
  }

  const client = createTraktClient();
  if (!client) {
    return json<ValidationResult>(
      { valid: false, error: "Trakt client initialization failed" },
      { status: 503 }
    );
  }

  // Attempt to fetch the user's public watchlist
  const result = await client.getPublicWatchlist(username.trim());

  if (result.success) {
    // Cache the successful validation
    const cache: TraktValidationCache = {
      username: username.trim(),
      status: "valid",
      itemCount: result.data.length,
      validatedAt: Date.now(),
    };
    await setTraktValidation(user.id, cache);

    return json<ValidationResult>({
      valid: true,
      itemCount: result.data.length,
    });
  }

  // Handle specific error cases
  let errorMessage: string;
  if (result.error.status === 404) {
    errorMessage = "User not found or watchlist is private";
  } else {
    errorMessage = result.error.message;
  }

  // Cache the failed validation
  const cache: TraktValidationCache = {
    username: username.trim(),
    status: "invalid",
    message: errorMessage,
    validatedAt: Date.now(),
  };
  await setTraktValidation(user.id, cache);

  return json<ValidationResult>({
    valid: false,
    error: errorMessage,
  });
}
