/**
 * Admin onboarding: connect Watchtower to a Plex server.
 * Before setup, requires the one-time code from the server logs; afterwards, only the saved admin.
 */

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { CheckCircle, KeyRound, LogOut, Server, XCircle } from "lucide-react";
import {
  clearSession,
  commitSession,
  getPlexToken,
  getSession,
} from "~/lib/auth/session.server";
import { getPlexUser, listOwnedServers } from "~/lib/auth/plex.server";
import {
  getServerConfig,
  saveServerConfig,
} from "~/lib/config/server-config.server";
import {
  canManageServer,
  probeConnection,
  rotateSetupCode,
  verifySetupCode,
  type ProbeResult,
} from "~/lib/config/setup.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import {
  getIntegrations,
  toPublicIntegrations,
} from "~/lib/integrations/storage.server";
import type { PublicIntegrationsConfig } from "~/lib/integrations/types";
import { IntegrationsSection } from "~/components/settings/IntegrationsSection";

export const meta: MetaFunction = () => [
  { title: "Server Setup | Watchtower" },
];

type ConnectionOption = {
  uri: string;
  local: boolean;
  relay: boolean;
} & ProbeResult;

type LoaderData =
  | { step: "code"; username: string }
  | {
      step: "services";
      username: string;
      integrations: PublicIntegrationsConfig;
    }
  | {
      step: "select";
      username: string;
      current: { serverName: string; serverUrl: string } | null;
      servers: {
        machineIdentifier: string;
        name: string;
        connections: ConnectionOption[];
      }[];
      error?: string;
    };

async function requireSetupUser(request: Request) {
  const token = await getPlexToken(request);
  if (!token) throw redirect("/auth/redirect?redirectTo=/setup");
  const user = await getPlexUser(token);
  if (!user) throw await clearSession(request);

  const config = getServerConfig();
  if (config && config.adminUserId !== user.id) throw redirect("/app");

  const session = await getSession(request);
  return {
    token,
    user,
    session,
    authorized: canManageServer(user.id, session.get("setupClaimUserId")),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { token, user, authorized } = await requireSetupUser(request);
  if (!authorized) {
    return json<LoaderData>({ step: "code", username: user.username });
  }

  const config = getServerConfig();
  if (config && new URL(request.url).searchParams.get("step") === "services") {
    return json<LoaderData>({
      step: "services",
      username: user.username,
      integrations: toPublicIntegrations(await getIntegrations()),
    });
  }
  const current = config
    ? { serverName: config.serverName, serverUrl: config.serverUrl }
    : null;
  try {
    const servers = await Promise.all(
      (
        await listOwnedServers(token)
      ).map(async (server) => ({
        machineIdentifier: server.machineIdentifier,
        name: server.name,
        connections: await Promise.all(
          server.connections.map(async (c) => ({
            ...c,
            ...(await probeConnection(c.uri, server.machineIdentifier)),
          }))
        ),
      }))
    );
    return json<LoaderData>({
      step: "select",
      username: user.username,
      current,
      servers,
    });
  } catch (error) {
    console.error("[Setup] Failed to list Plex servers:", error);
    return json<LoaderData>({
      step: "select",
      username: user.username,
      current,
      servers: [],
      error: "Could not load your servers from plex.tv. Try again.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { token, user, session, authorized } = await requireSetupUser(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "verify-code") {
    if (getServerConfig()) throw redirect("/setup");
    if (!verifySetupCode(String(form.get("code") ?? ""))) {
      console.warn(
        `[Setup] Invalid setup code entered by ${user.username} (${user.id})`
      );
      return json({ error: "That setup code is not valid." }, { status: 400 });
    }
    session.set("setupClaimUserId", user.id);
    return redirect("/setup", {
      headers: { "Set-Cookie": await commitSession(session) },
    });
  }

  if (intent !== "select")
    return json({ error: "Unknown action." }, { status: 400 });
  if (!authorized)
    return json(
      { error: "You are not allowed to configure this server." },
      { status: 403 }
    );

  // Value is "<machineIdentifier> <uri>"; both are re-validated against plex.tv below.
  const [machineIdentifier, uri] = String(form.get("connection") ?? "").split(
    " "
  );
  const server = (await listOwnedServers(token)).find(
    (s) => s.machineIdentifier === machineIdentifier
  );
  if (!server || !uri || !server.connections.some((c) => c.uri === uri)) {
    return json({ error: "Pick a connection from the list." }, { status: 400 });
  }

  const identity = await new PlexClient({
    serverUrl: uri,
    token: server.accessToken,
    clientId: env.PLEX_CLIENT_ID,
  }).getServerIdentity();
  if (
    !identity.success ||
    identity.data.machineIdentifier !== server.machineIdentifier
  ) {
    return json(
      {
        error: `Could not reach ${server.name} at ${uri}. Pick another connection.`,
      },
      { status: 400 }
    );
  }

  saveServerConfig({
    serverUrl: uri,
    machineIdentifier: server.machineIdentifier,
    serverName: server.name,
    token: server.accessToken,
    adminUserId: user.id,
    adminUsername: user.username,
  });
  rotateSetupCode();
  console.log(
    `[Setup] ${user.username} connected Plex server ${server.name} (${uri})`
  );

  session.unset("setupClaimUserId");
  session.set("serverToken", server.accessToken);
  session.set("isOwner", true);
  session.set("serverMachineId", server.machineIdentifier);
  return redirect("/setup?step=services", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

const buttonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-primary px-6 py-3 font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

export default function Setup() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const error =
    actionData && "error" in actionData
      ? actionData.error
      : data.step === "select"
      ? data.error
      : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-primary px-6 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Server className="h-8 w-8 text-accent-primary" />
          <h1 className="text-3xl font-bold text-foreground-primary">
            Server Setup
          </h1>
        </div>

        {data.step === "code" ? (
          <Form method="post" className="space-y-4">
            <p className="text-foreground-secondary">
              Hi{" "}
              <span className="font-semibold text-foreground-primary">
                {data.username}
              </span>
              , this Watchtower instance is not connected to a Plex server yet.
            </p>
            <p className="text-sm text-foreground-secondary">
              If you run this server, enter the setup code printed in the
              Watchtower server logs (for Docker:{" "}
              <code>docker compose logs watchtower</code>). Otherwise, ask the
              administrator to finish setup.
            </p>
            <input type="hidden" name="intent" value="verify-code" />
            <label className="block text-sm font-medium text-foreground-primary">
              Setup code
              <input
                name="code"
                required
                autoComplete="off"
                placeholder="XXXX-XXXX-XXXX"
                className="mt-1 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 font-mono uppercase tracking-widest text-foreground-primary"
              />
            </label>
            <button type="submit" disabled={busy} className={buttonClass}>
              <KeyRound className="h-4 w-4" />
              Continue
            </button>
          </Form>
        ) : data.step === "services" ? (
          <div className="space-y-4">
            <p className="text-foreground-secondary">
              Plex is connected. Optionally connect Seerr so users can request
              missing titles, and a Trakt app so users can scrobble. You can
              change these later in Settings.
            </p>
            <IntegrationsSection initial={data.integrations} />
            <Link to="/app" className={buttonClass}>
              Continue to Watchtower
            </Link>
          </div>
        ) : (
          <Form method="post" className="space-y-4">
            {data.current ? (
              <p className="text-sm text-foreground-secondary">
                Currently connected to{" "}
                <span className="font-semibold text-foreground-primary">
                  {data.current.serverName}
                </span>{" "}
                at <code>{data.current.serverUrl}</code>. Pick a connection to
                change it.
              </p>
            ) : (
              <p className="text-foreground-secondary">
                Pick the server and connection Watchtower should use.
              </p>
            )}
            <input type="hidden" name="intent" value="select" />
            {data.servers.length === 0 && !data.error && (
              <p className="text-sm text-foreground-secondary">
                No Plex servers owned by {data.username} were found.
              </p>
            )}
            {data.servers.map((server) => (
              <fieldset
                key={server.machineIdentifier}
                className="rounded-lg bg-background-elevated p-4"
              >
                <legend className="px-1 font-semibold text-foreground-primary">
                  {server.name}
                </legend>
                {server.connections.map((c) => (
                  <label
                    key={c.uri}
                    className="flex items-center gap-3 py-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="connection"
                      value={`${server.machineIdentifier} ${c.uri}`}
                      required
                      disabled={!c.ok}
                    />
                    {c.ok ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="break-all font-mono text-foreground-primary">
                      {c.uri}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-foreground-muted">
                      {c.relay ? "relay" : c.local ? "local" : "remote"} ·{" "}
                      {c.ok ? `${c.latencyMs} ms` : c.error}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button
              type="submit"
              disabled={busy || data.servers.length === 0}
              className={buttonClass}
            >
              Use this connection
            </button>
          </Form>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Form method="post" action="/auth/logout">
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground-primary"
          >
            <LogOut className="h-4 w-4" />
            Sign in with a different account
          </button>
        </Form>
      </div>
    </main>
  );
}
