/**
 * Per-user Trakt account connection (device flow) and scrobble toggle.
 * GET  /api/trakt - connection status
 * POST /api/trakt - { intent: "start" | "poll" | "disconnect" | "scrobble", enabled? }
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/lib/auth/user.server";
import {
  getTraktApp,
  getTraktAccount,
  getTraktConnectionStatus,
  saveTraktAccount,
  startDeviceAuth,
  pollDeviceAuth,
  disconnectTrakt,
} from "~/lib/trakt/oauth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json(await getTraktConnectionStatus(user.id));
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const user = await requireUser(request);
  const body = (await request.json().catch(() => null)) as { intent?: string; enabled?: unknown } | null;
  const app = await getTraktApp();

  try {
    switch (body?.intent) {
      case "start":
        if (!app) return json({ error: "Trakt isn't set up on this server" }, { status: 400 });
        return json(await startDeviceAuth(user.id, app));
      case "poll":
        if (!app) return json({ error: "Trakt isn't set up on this server" }, { status: 400 });
        return json(await pollDeviceAuth(user.id, app));
      case "disconnect":
        await disconnectTrakt(user.id, app);
        return json({ ok: true });
      case "scrobble": {
        const account = await getTraktAccount(user.id);
        if (!account || typeof body.enabled !== "boolean") {
          return json({ error: "Not connected or invalid value" }, { status: 400 });
        }
        await saveTraktAccount(user.id, { ...account, scrobble: body.enabled });
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown intent" }, { status: 400 });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Trakt request failed" }, { status: 502 });
  }
}
