import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPrincipal } from "~/lib/rooms/principal.server";

vi.mock("~/lib/env.server", () => ({
  env: {
    PLEX_SERVER_URL: "http://plex.test:32400",
    PLEX_CLIENT_ID: "watchtower-test",
    PLEX_TOKEN: "owner-token-must-not-be-used",
  },
}));

import { authorizeMedia, resolveNextMedia } from "~/lib/rooms/media-access.server";

const principal: PlaybackPrincipal = {
  kind: "web",
  userId: "user-1",
  displayName: "Viewer",
  serverMachineId: "machine-1",
  serverToken: "effective-user-token",
  deviceSessionId: "device-1",
  identityVersion: 0,
};

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    MediaContainer: {
      Metadata: [{
        ratingKey: "42",
        key: "/library/metadata/42",
        guid: "plex://episode/42",
        type: "episode",
        title: "Synthetic",
        duration: 120_000,
        parentRatingKey: "10",
        grandparentRatingKey: "1",
        Media: [{ id: 101, Part: [{ id: 102, key: "/parts/102", duration: 120_000 }] }],
        ...overrides,
      }],
    },
  };
}

describe("room media access", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("authorizes the exact single-part edition with the effective user's token", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata()), { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const result = await authorizeMedia(principal, "42", { mediaId: "101", partId: "102" });
    expect(result).toMatchObject({ ok: true, value: { durationMs: 120_000, media: { serverMachineId: "machine-1", ratingKey: "42", mediaId: "101", partId: "102" } } });
    const headers = new Headers(upstream.mock.calls[0][1].headers);
    expect(headers.get("X-Plex-Token")).toBe("effective-user-token");
    expect(headers.get("X-Plex-Token")).not.toBe("owner-token-must-not-be-used");
  });

  it.each([
    ["non-playable type", { type: "show" }, "media_unsupported"],
    ["multipart media", { Media: [{ id: 101, Part: [{ id: 102 }, { id: 103 }] }] }, "media_unsupported"],
    ["missing duration", { duration: undefined, Media: [{ id: 101, Part: [{ id: 102 }] }] }, "media_unsupported"],
  ])("rejects %s", async (_label, overrides, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata(overrides)), { status: 200 })));
    expect(await authorizeMedia(principal, "42", { mediaId: "101", partId: "102" })).toMatchObject({ ok: false, code });
  });

  it("rejects a mismatched media or part identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata()), { status: 200 })));
    expect(await authorizeMedia(principal, "42", { mediaId: "999", partId: "102" })).toMatchObject({ ok: false, code: "media_mismatch" });
  });

  it("maps inaccessible joins without revealing whether media exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" })));
    expect(await authorizeMedia(principal, "42", undefined, true)).toEqual({ ok: false, code: "media_forbidden", message: "You do not have access to this media." });
    expect(await authorizeMedia(principal, "42", undefined, false)).toEqual({ ok: false, code: "not_found", message: "Media was not found." });
  });

  it("maps network and upstream failures to upstream_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("token-bearing URL must not escape")));
    expect(await authorizeMedia(principal, "42")).toEqual({ ok: false, code: "upstream_unavailable", message: "Plex is temporarily unavailable." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503, statusText: "Unavailable" })));
    expect(await authorizeMedia(principal, "42")).toEqual({ ok: false, code: "upstream_unavailable", message: "Plex is temporarily unavailable." });
  });

  it("resolves the next episode in season and authorizes its exact media", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ MediaContainer: { Metadata: [
        { ratingKey: "42", type: "episode", title: "One" },
        { ratingKey: "43", type: "episode", title: "Two" },
      ] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata({ ratingKey: "43", Media: [{ id: 201, Part: [{ id: 202, key: "/parts/202" }] }] })), { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    expect(await resolveNextMedia(principal, "42")).toMatchObject({ ok: true, value: { media: { ratingKey: "43", mediaId: "201", partId: "202" } } });
    expect(upstream.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/library/metadata/42",
      "/library/metadata/10/children",
      "/library/metadata/43",
    ]);
  });
});