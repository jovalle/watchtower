/**
 * Auto-redirect route - immediately initiates Plex OAuth flow.
 * Used when a user's session expires mid-session to skip the login button.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession, getPlexToken } from "~/lib/auth/session.server";
import { initiateLogin } from "~/lib/auth/plex.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already logged in, redirect to authenticated home
  const token = await getPlexToken(request);
  if (token) {
    return redirect("/app");
  }

  // Build the callback URL based on the request origin
  const url = new URL(request.url);
  const callbackUrl = `${url.origin}/auth/callback`;

  // Initiate the OAuth flow
  const { hostedUrl, pinId } = await initiateLogin(callbackUrl);

  // Store the pinId in the session for CSRF protection
  const session = await getSession(request);
  session.set("pendingPinId", pinId);

  // Redirect to Plex hosted login
  return redirect(hostedUrl, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}
