/**
 * Server-owner integration settings.
 * GET  /api/integrations - current settings without secrets
 * POST /api/integrations - { intent: "save" | "test" | "detect", service: "seerr" | "trakt", ...fields }
 */

import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { requirePlexToken, isServerOwner } from "~/lib/auth/session.server";
import {
  getIntegrations,
  saveIntegrations,
  toPublicIntegrations,
  normalizeServiceUrl,
} from "~/lib/integrations/storage.server";
import { SeerrClient, detectSeerrUrl } from "~/lib/integrations/seerr.server";
import { traktFetch } from "~/lib/trakt/oauth.server";

async function requireOwner(request: Request) {
  await requirePlexToken(request);
  if (!(await isServerOwner(request))) {
    throw json(
      { error: "Only the server owner can manage integrations" },
      { status: 403 }
    );
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireOwner(request);
  return json(toPublicIntegrations(await getIntegrations()));
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  await requireOwner(request);

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const intent = body?.intent;
  const service = body?.service;
  const str = (key: string) =>
    typeof body?.[key] === "string" ? (body[key] as string).trim() : "";

  if (service === "seerr") {
    if (intent === "detect") {
      return json({ url: await detectSeerrUrl() });
    }

    const current = (await getIntegrations()).seerr;
    const rawUrl = str("url");
    if (intent === "save" && !rawUrl) {
      await saveIntegrations({ seerr: undefined });
      return json({
        ok: true,
        integrations: toPublicIntegrations(await getIntegrations()),
      });
    }

    const url = normalizeServiceUrl(rawUrl);
    const apiKey = str("apiKey") || current?.apiKey || "";
    if (!url)
      return json(
        { ok: false, error: "Enter a valid http(s) URL" },
        { status: 400 }
      );
    if (!apiKey)
      return json(
        { ok: false, error: "Enter the Seerr API key" },
        { status: 400 }
      );

    if (intent === "test" || intent === "save") {
      try {
        const info = await new SeerrClient(url, apiKey).testConnection();
        if (intent === "test") {
          return json({
            ok: true,
            message: `Connected to ${info.applicationTitle || "Seerr"}`,
          });
        }
      } catch (error) {
        return json({
          ok: false,
          error: error instanceof Error ? error.message : "Connection failed",
        });
      }
      await saveIntegrations({ seerr: { url, apiKey } });
      return json({
        ok: true,
        integrations: toPublicIntegrations(await getIntegrations()),
      });
    }
  }

  if (service === "trakt") {
    const current = (await getIntegrations()).trakt;
    const clientId = str("clientId");
    const clientSecret = str("clientSecret") || current?.clientSecret || "";
    if (intent === "save" && !clientId) {
      await saveIntegrations({ trakt: undefined });
      return json({
        ok: true,
        integrations: toPublicIntegrations(await getIntegrations()),
      });
    }
    if (!clientId)
      return json(
        { ok: false, error: "Enter the Trakt client ID" },
        { status: 400 }
      );

    if (intent === "test" || intent === "save") {
      // Requesting a device code is the only check Trakt offers without a user; it validates the client ID.
      const response = await traktFetch("/oauth/device/code", clientId, {
        body: { client_id: clientId },
      }).catch(() => null);
      if (!response?.ok) {
        return json({
          ok: false,
          error: `Trakt rejected the client ID${
            response ? ` (HTTP ${response.status})` : ""
          }`,
        });
      }
      if (intent === "test")
        return json({ ok: true, message: "Client ID accepted by Trakt" });
      if (!clientSecret)
        return json(
          { ok: false, error: "Enter the Trakt client secret" },
          { status: 400 }
        );
      await saveIntegrations({ trakt: { clientId, clientSecret } });
      return json({
        ok: true,
        integrations: toPublicIntegrations(await getIntegrations()),
      });
    }
  }

  return json({ error: "Unknown intent or service" }, { status: 400 });
}
