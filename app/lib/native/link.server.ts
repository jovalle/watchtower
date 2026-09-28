import { createHmac } from "node:crypto";
import { env } from "~/lib/env.server";
import { constantTimeEqual, sha256 } from "./crypto.server";
import { NativeError } from "./http.server";

export function sanitizeUserCode(value: string | null): string {
  const code = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[BCDFGHJKLMNPQRSTVWXZ23456789]{8}$/.test(code) ? code : "";
}

export function linkCsrfToken(plexToken: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`link-csrf:${sha256(plexToken)}`)
    .digest("base64url");
}

export function requireLinkCsrf(request: Request, supplied: FormDataEntryValue | null, expected: string): void {
  const origin = request.headers.get("Origin");
  if (origin) {
    if (origin !== new URL(request.url).origin) {
      throw new NativeError(403, "forbidden", "This request did not originate from Watchtower.");
    }
  } else if (request.headers.get("Sec-Fetch-Site") !== "same-origin") {
    throw new NativeError(403, "forbidden", "This request did not originate from Watchtower.");
  }
  if (typeof supplied !== "string" || !constantTimeEqual(supplied, expected)) {
    throw new NativeError(403, "forbidden", "The form expired. Refresh and try again.");
  }
}