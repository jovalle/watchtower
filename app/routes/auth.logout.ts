/**
 * Logout route - destroys session and redirects to main page.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, destroySession } from "~/lib/auth/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);

  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export async function loader() {
  // Logout should only be POST - redirect GET requests to home
  return redirect("/");
}
