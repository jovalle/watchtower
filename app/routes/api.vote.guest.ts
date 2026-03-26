/**
 * API: Guest name management
 * POST   /api/vote/guest — Claim a guest name (returns ownership token)
 * DELETE /api/vote/guest — Release a guest name (by token)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { claimGuestName, releaseGuestName } from "~/lib/vote/storage.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "Name is required" }, { status: 400 });
    if (name.length > 30)
      return json({ error: "Name too long" }, { status: 400 });

    const token = typeof body.token === "string" ? body.token : undefined;
    const result = await claimGuestName(name, token);

    if (!result.success) return json({ error: result.error }, { status: 409 });
    return json({ success: true, token: result.token });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return json({ error: "Token is required" }, { status: 400 });

    await releaseGuestName(token);
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
