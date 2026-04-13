/**
 * OAuth callback route - handles return from Plex login.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  getSession,
  commitSession,
  createUserSession,
  sanitizeRedirectTo,
} from "~/lib/auth/session.server";
import { completeLogin } from "~/lib/auth/plex.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Signing In | Watchtower" },
    { name: "description", content: "Completing your Plex sign-in" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  const pinId = session.get("pendingPinId");
  const redirectTo = sanitizeRedirectTo(session.get("pendingRedirectTo")) ?? "/app";

  // No pending auth flow - redirect to login
  if (!pinId) {
    return redirect("/auth/redirect");
  }

  // Check if user completed authentication
  const authToken = await completeLogin(pinId);

  if (!authToken) {
    // User cancelled or timeout - clear pending state and redirect to login
    session.unset("pendingPinId");
    return redirect(`/auth/redirect?redirectTo=${encodeURIComponent(redirectTo)}`, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  // Success! Create user session and redirect to authenticated home
  return createUserSession(authToken, redirectTo, session);
}

export default function AuthCallback() {
  // This component shouldn't render - loader always redirects
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-foreground-muted">Completing authentication...</div>
    </div>
  );
}
