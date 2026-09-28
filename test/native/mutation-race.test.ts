import { describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";

const plex = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  scrobble: vi.fn(),
}));
const principal = vi.hoisted(() => ({
  requireNativePrincipal: vi.fn(),
  recheckPrincipal: vi.fn(),
}));

vi.mock("~/lib/native/catalog.server", () => ({
  nativePlexClient: () => plex,
  plexData: <T>(result: { success: true; data: T }) => result.data,
}));
vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: principal.requireNativePrincipal,
  recheckPrincipal: principal.recheckPrincipal,
}));

import { action } from "~/routes/api.v1.media.$ratingKey.watched";

describe("native mutation identity races", () => {
  it("rejects a profile switch before the Plex write", async () => {
    principal.requireNativePrincipal.mockResolvedValue({
      deviceSessionId: "device-1",
      identityVersion: 1,
    });
    principal.recheckPrincipal.mockRejectedValue(
      new NativeError(
        409,
        "identity_version_mismatch",
        "The active profile changed.",
      ),
    );
    plex.getMetadata.mockResolvedValue({ success: true, data: {} });

    const response = await action({
      request: new Request("https://watchtower.test/api/v1/media/1/watched", {
        method: "PUT",
      }),
      params: { ratingKey: "1" },
      context: {},
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "identity_version_mismatch" },
    });
    expect(plex.scrobble).not.toHaveBeenCalled();
  });
});