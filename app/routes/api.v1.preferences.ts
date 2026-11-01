import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { DEFAULT_PREFERENCES, getUserSettings, setUserSettings } from "~/lib/settings/storage.server";
import type { Preferences } from "~/lib/native/contract";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

async function preferences(userId: string): Promise<Preferences> {
  const settings = await getUserSettings(Number(userId));
  return { ...DEFAULT_PREFERENCES, ...settings?.preferences };
}

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    return nativeJson(await preferences(principal.userId), requestId);
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "PATCH");
    const principal = await requireNativePrincipal(request);
    const body = await readJsonObject(request);
    const allowed = new Set(Object.keys(DEFAULT_PREFERENCES));
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key) || typeof value !== "boolean") throw new NativeError(400, "invalid_request", `Invalid preference: ${key}`);
    }
    const next = { ...(await preferences(principal.userId)), ...body } as Preferences;
    await recheckPrincipal(principal);
    await setUserSettings(Number(principal.userId), { preferences: next });
    return nativeJson(next, requestId);
  });
}