import { afterEach, describe, expect, it, vi } from "vitest";
import { PlexClient } from "~/lib/plex/client.server";

afterEach(() => vi.unstubAllGlobals());

describe("Plex library recommendations", () => {
  it("reads the real section hubs with the effective profile token", async () => {
    const hubs = [{ hubIdentifier: "movie.recentlyadded.4", title: "Recently Added", type: "movie", Metadata: [] }];
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { Hub: hubs } }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "https://plex.test", token: "profile-token", clientId: "test" });
    await expect(client.getLibraryHubs("4")).resolves.toEqual({ success: true, data: hubs });
    const [input, options] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.pathname).toBe("/hubs/sections/4");
    expect(url.searchParams.get("count")).toBe("20");
    expect(new Headers(options.headers).get("X-Plex-Token")).toBe("profile-token");
  });
});
