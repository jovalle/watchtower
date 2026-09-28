import type { MeResponse } from "./contract";
import type { NativePrincipal } from "./principal.server";
import type { DeviceSessionRecord } from "./device-store.server";

export function meResponse(
  principal: NativePrincipal,
  record: DeviceSessionRecord,
): MeResponse {
  return {
    deviceSessionId: principal.deviceSessionId,
    identityVersion: principal.identityVersion,
    expiresAtMs: record.expiresAtMs,
    server: { machineId: principal.serverMachineId, name: record.serverName },
    account: record.account,
    profile: principal.profile,
    features: {
      profiles: process.env.WATCHTOWER_PLEX_HOME_PROFILES === "1",
      requests: true,
      discovery: true,
      rooms: false,
    },
  };
}