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
import { Button, buttonStyles } from "~/components/ui";
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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">Sign-In Was Cancelled or Expired</h1>
        <p className="mt-3 text-foreground-secondary">Try signing in again, or return to the home page.</p>
        <Form method="post" action={`/auth/redirect?redirectTo=${encodeURIComponent(redirectTo)}`}>
          <Button type="submit" className="mt-6">Try Again</Button>
        </Form>
        <Link className={buttonStyles({ variant: "ghost", className: "mt-4" })} to="/">Go Home</Link>
      </div>
    </main>
  );
}
