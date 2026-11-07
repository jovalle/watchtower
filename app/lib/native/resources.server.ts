import type { MeResponse } from "./contract";
import type { NativePrincipal } from "./principal.server";
import type { DeviceSessionRecord } from "./device-store.server";
import { getIntegrations } from "~/lib/integrations/storage.server";
import {
  DEFAULT_PREFERENCES,
  getUserSettings,
} from "~/lib/settings/storage.server";

export async function meResponse(
  principal: Pick<
    NativePrincipal,
    | "deviceSessionId"
    | "identityVersion"
    | "serverMachineId"
    | "userId"
    | "profile"
  >,
  record: DeviceSessionRecord,
): Promise<MeResponse> {
  const [settings, integrations] = await Promise.all([
    getUserSettings(Number(principal.userId)),
    getIntegrations(),
  ]);
  const preferences = {
    ...DEFAULT_PREFERENCES,
    ...settings?.preferences,
  };
  return {
    deviceSessionId: principal.deviceSessionId,
    identityVersion: principal.identityVersion,
    expiresAtMs: record.expiresAtMs,
    server: { machineId: principal.serverMachineId, name: record.serverName },
    account: record.account,
    profile: principal.profile,
    features: {
      profiles: process.env.WATCHTOWER_PLEX_HOME_PROFILES === "1",
      requests: Boolean(integrations.seerr),
      discovery: !preferences.discoveryDisabled,
      rooms: false,
    },
  };
}