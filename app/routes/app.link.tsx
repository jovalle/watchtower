import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Container, PageHeader } from "~/components/layout";
import { buttonStyles } from "~/components/ui/Button";
import { Check, Trash2, X } from "lucide-react";
import { checkServerAccessDetailed, getPlexUser } from "~/lib/auth/plex.server";
import { getPlexToken } from "~/lib/auth/session.server";
import { getServerConfig } from "~/lib/config/server-config.server";
import { listAccountDevices, revokeDeviceSession, toDeviceSummary } from "~/lib/native/device-store.server";
import { NativeError, requestClientIp } from "~/lib/native/http.server";
import { linkCsrfToken, requireLinkCsrf, sanitizeUserCode } from "~/lib/native/link.server";
import { approveAuthorization, denyAuthorization, lookupAuthorization } from "~/lib/native/pairing.server";
import { enforceRateLimit } from "~/lib/native/rate-limit.server";

export const meta: MetaFunction = () => [{ title: "Link a TV | Watchtower" }];

async function browserIdentity(request: Request) {
  const plexToken = await getPlexToken(request);
  if (!plexToken) throw new Response("Authentication required", { status: 401 });
  const user = await getPlexUser(plexToken);
  const config = getServerConfig();
  if (!user || !config) throw new Response("Authentication required", { status: 401 });
  return { plexToken, user, config };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { plexToken, user } = await browserIdentity(request);
  const devices = await listAccountDevices(String(user.id));
  return json({
    code: sanitizeUserCode(new URL(request.url).searchParams.get("code")),
    csrf: linkCsrfToken(plexToken),
    devices: devices.map((device) => toDeviceSummary(device, "")),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const { plexToken, user, config } = await browserIdentity(request);
    const form = await request.formData();
    requireLinkCsrf(request, form.get("csrf"), linkCsrfToken(plexToken));
    const intent = form.get("intent");
    if (intent === "revoke") {
      const id = String(form.get("deviceSessionId") ?? "");
      const devices = await listAccountDevices(String(user.id));
      if (!devices.some((device) => device.deviceSessionId === id)) {
        throw new NativeError(404, "not_found", "Device not found.");
      }
      await revokeDeviceSession(id);
      return json({ ok: true, message: "Device revoked.", authorization: null });
    }
    const code = sanitizeUserCode(String(form.get("code") ?? ""));
    enforceRateLimit("pair-lookup-user", String(user.id), 10, 10 * 60 * 1000);
    enforceRateLimit("pair-lookup-ip", requestClientIp(request, context), 30, 10 * 60 * 1000);
    const authorization = lookupAuthorization(code);
    if (!authorization) {
      return json({ ok: false, message: "That code is invalid or has expired.", authorization: null }, { status: 404 });
    }
    if (intent === "lookup") {
      return json({ ok: true, message: null, authorization: {
        code,
        deviceName: authorization.input.deviceName,
        platform: authorization.input.platform,
        model: authorization.input.model,
        appVersion: authorization.input.appVersion,
        ageSeconds: Math.floor((Date.now() - authorization.createdAtMs) / 1000),
        origin: new URL(request.url).origin,
      } });
    }
    if (intent === "deny") {
      denyAuthorization(code);
      return json({ ok: true, message: "Link request denied.", authorization: null });
    }
    if (intent !== "approve") throw new NativeError(400, "invalid_request", "Unknown action.");
    const access = await checkServerAccessDetailed(plexToken);
    if (access.status === "unavailable") {
      throw new NativeError(503, "upstream_unavailable", "Plex is temporarily unavailable. Try again.", true, 60);
    }
    if (access.status === "denied") {
      throw new NativeError(403, "forbidden", "You no longer have access to this Plex server.");
    }
    const approved = approveAuthorization(code, {
      name: authorization.input.deviceName,
      platform: authorization.input.platform,
      model: authorization.input.model,
      appVersion: authorization.input.appVersion,
      account: { userId: String(user.id), title: user.title },
      profile: { userId: String(user.id), title: user.title, restricted: false, owner: access.isOwner === true, protected: false },
      serverMachineId: config.machineIdentifier,
      serverName: access.serverName ?? config.serverName,
      accountPlexToken: plexToken,
      plexToken,
      serverToken: access.serverToken,
      isOwner: access.isOwner === true,
    });
    if (!approved) return json({ ok: false, message: "That code is invalid or has expired.", authorization: null }, { status: 404 });
    return json({ ok: true, message: "TV linked. You can return to the device.", authorization: null });
  } catch (error) {
    if (error instanceof NativeError) return json({ ok: false, message: error.message, authorization: null }, { status: error.status });
    throw error;
  }
}

export default function LinkDevicePage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const authorization = actionData?.authorization;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <Container size="wide" className="pb-16 pt-8">
      <PageHeader title="Link a TV" />
      <div className="max-w-2xl" aria-busy={busy}>
      <section aria-labelledby="link-heading" className="border-b border-border-subtle pb-10">
        <h2 id="link-heading" className="mb-4 text-lg font-medium text-foreground-primary">Enter the Code Shown on Your TV</h2>
        <Form method="post" className="flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="csrf" value={data.csrf} />
          <input type="hidden" name="intent" value="lookup" />
          <label htmlFor="code" className="sr-only">TV Link Code</label>
          <input id="code" name="code" defaultValue={data.code} autoComplete="one-time-code" maxLength={9} required className="min-h-11 min-w-0 flex-1 rounded-md border border-border-emphasis bg-background-elevated px-4 py-3 uppercase text-foreground-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary" />
          <button type="submit" disabled={busy} className={buttonStyles()}>Continue</button>
        </Form>
        {actionData?.message && <p role={actionData.ok ? "status" : "alert"} className={`mt-3 break-words text-sm ${actionData.ok ? "text-foreground-secondary" : "text-red-400"}`}>{actionData.message}</p>}
        {authorization && (
          <div className="mt-6 rounded-lg border border-border-subtle bg-background-elevated p-5">
            <h3 className="break-words text-lg font-medium text-foreground-primary">{authorization.deviceName}</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 break-words text-sm [&>div]:min-w-0 text-foreground-muted sm:grid-cols-2">
              <div><dt className="font-medium text-foreground-primary">Platform</dt><dd>{authorization.platform}</dd></div>
              <div><dt className="font-medium text-foreground-primary">Model</dt><dd>{authorization.model ?? "Not reported"}</dd></div>
              <div><dt className="font-medium text-foreground-primary">App Version</dt><dd>{authorization.appVersion ?? "Not reported"}</dd></div>
              <div><dt className="font-medium text-foreground-primary">Requested</dt><dd>{authorization.ageSeconds} seconds ago</dd></div>
              <div className="sm:col-span-2"><dt className="font-medium text-foreground-primary">Watchtower Instance</dt><dd>{authorization.origin}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {(["approve", "deny"] as const).map((intent) => (
                <Form method="post" key={intent}>
                  <input type="hidden" name="csrf" value={data.csrf} />
                  <input type="hidden" name="intent" value={intent} />
                  <input type="hidden" name="code" value={authorization.code} />
                  <button type="submit" disabled={busy} className={buttonStyles({ variant: intent === "approve" ? "primary" : "secondary", size: "sm", className: "gap-2" })}>
                    {intent === "approve" ? <Check aria-hidden className="h-4 w-4" /> : <X aria-hidden className="h-4 w-4" />}
                    {intent === "approve" ? "Approve" : "Deny"}
                  </button>
                </Form>
              ))}
            </div>
          </div>
        )}
      </section>
      <section aria-labelledby="devices-heading" className="pt-10">
        <h2 id="devices-heading" className="mb-4 text-lg font-medium text-foreground-primary">Linked TVs</h2>
        {data.devices.length === 0 ? <p className="text-foreground-muted">No linked TVs.</p> : (
          <ul className="divide-y divide-border-subtle">
            {data.devices.map((device) => (
              <li key={device.deviceSessionId} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1 break-words"><p className="font-medium text-foreground-primary">{device.name}</p><p className="text-sm text-foreground-muted">{device.model ?? "Android TV"} · linked {new Date(device.createdAtMs).toLocaleDateString()} · last seen {device.lastSeenAtMs ? new Date(device.lastSeenAtMs).toLocaleString() : "never"} · expires {new Date(device.expiresAtMs).toLocaleDateString()}</p></div>
                <Form method="post">
                  <input type="hidden" name="csrf" value={data.csrf} /><input type="hidden" name="intent" value="revoke" /><input type="hidden" name="deviceSessionId" value={device.deviceSessionId} />
                  <button type="submit" disabled={busy} aria-label={`Revoke ${device.name}`} className={buttonStyles({ variant: "ghost", size: "sm", className: "!text-red-400 hover:!bg-red-500/10" })}><Trash2 aria-hidden className="h-5 w-5" /></button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </Container>
  );
}