import { describe, expect, it, vi } from "vitest";

const markPrincipalForVerification = vi.hoisted(() => vi.fn());

vi.mock("~/lib/native/principal.server", () => ({
  markPrincipalForVerification,
}));

import { requireNativePlexResponse } from "~/lib/native/catalog.server";

describe("native Plex authorization failures", () => {
  it("marks the principal for re-verification and returns upstream_auth_failed", async () => {
    const principal = { deviceSessionId: "device-1" } as never;

    await expect(
      requireNativePlexResponse(new Response(null, { status: 401 }), principal),
    ).rejects.toMatchObject({ status: 401, code: "upstream_auth_failed" });
    expect(markPrincipalForVerification).toHaveBeenCalledWith(principal);
  });
});