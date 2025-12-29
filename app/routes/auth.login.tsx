/**
 * Login route - initiates Plex OAuth flow.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { getPlexToken, getSession, commitSession } from "~/lib/auth/session.server";
import { initiateLogin } from "~/lib/auth/plex.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already logged in, redirect to authenticated home
  const token = await getPlexToken(request);
  if (token) {
    return redirect("/app");
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
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

export default function Login() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground-primary">
            Welcome to Watchtower
          </h1>
          <p className="mt-3 text-foreground-muted">
            Sign in with your Plex account to continue
          </p>
        </div>

        <Form method="post" className="mt-8">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-accent-primary px-6 py-4 text-lg font-semibold text-foreground-primary transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Connecting to Plex...
              </>
            ) : (
              "Sign in with Plex"
            )}
          </button>
        </Form>
      </div>
    </main>
  );
}
