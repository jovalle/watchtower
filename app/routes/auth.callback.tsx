/**
 * OAuth callback route - handles return from Plex login.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
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
    return json({ redirectTo }, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  // Success! Create user session and redirect to authenticated home
  return createUserSession(authToken, redirectTo, session);
}

export default function AuthCallback() {
  const { redirectTo } = useLoaderData<typeof loader>();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center"><h1 className="text-2xl font-bold">Sign-in was cancelled or expired</h1><p className="mt-3 text-foreground-muted">Try signing in again, or return to the home page.</p><Form method="post" action={`/auth/redirect?redirectTo=${encodeURIComponent(redirectTo)}`}><button className="mt-6 rounded bg-accent-primary px-5 py-3 text-accent-foreground">Try again</button></Form><Link className="mt-4 inline-block underline" to="/">Go home</Link></div>
    </div>
  );
}
