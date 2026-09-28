import type { LoaderFunctionArgs } from "@remix-run/node";
import packageJson from "../../package.json";
import { getServerConfig } from "~/lib/config/server-config.server";
import type { InstanceResponse } from "~/lib/native/contract";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const response = {
      apiVersion: 1,
      product: "Watchtower",
      serverVersion: packageJson.version,
      configured: getServerConfig() !== null,
      features: {
        pairing: true,
        profiles: process.env.WATCHTOWER_PLEX_HOME_PROFILES === "1",
        rooms: false,
      },
      compatibility: { minClientVersionCode: null, upgradeMessage: null },
      pairing: { verificationPath: "/link" },
    } satisfies InstanceResponse;
    return nativeJson(response, requestId);
  });
}