/**
 * Logout route - destroys session and redirects to main page.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, destroySession } from "~/lib/auth/session.server";
import { getCurrentUser } from "~/lib/auth/user.server";
import { leaveDeviceMemberships } from "~/lib/rooms/coordinator.server";
import { getWebDevice } from "~/lib/rooms/principal.server";

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  try {
    const [user, device] = await Promise.all([
      getCurrentUser(request),
      getWebDevice(request),
    ]);
    if (user) leaveDeviceMemberships(String(user.id), device.deviceSessionId);
  } catch {
    // Session destruction must still complete when room cleanup cannot resolve identity.
  }

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
