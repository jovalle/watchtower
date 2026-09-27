import { describe, expect, it } from "vitest";
import { PlexClient } from "~/lib/plex/client.server";

const client = new PlexClient({
  serverUrl: "http://plex.test:32400",
  token: "test-token",
  clientId: "shared-watchtower-client",
});

describe("HLS playback sessions", () => {
  it("uses HLS seeking semantics instead of claiming the original file is being played", () => {
    const info = client.getPlaybackInfo("42");
    expect(info.method).toBe("direct_stream");
    expect(new URL(info.streamUrl).searchParams.get("directPlay")).toBe("0");
    expect(new URL(info.streamUrl).searchParams.get("directStream")).toBe("1");
  });
  it("isolates concurrent starts and retries of the same media", () => {
    const first = new URL(client.getPlaybackInfo("42", { offsetSeconds: 351 }).streamUrl);
    const second = new URL(client.getPlaybackInfo("42", { offsetSeconds: 351 }).streamUrl);
    expect(first.searchParams.get("session")).toMatch(/^[\da-f-]{36}$/);
    expect(second.searchParams.get("session")).toMatch(/^[\da-f-]{36}$/);
    expect(second.searchParams.get("session")).not.toBe(first.searchParams.get("session"));
    expect(first.searchParams.get("offset")).toBe("351");
    expect(first.searchParams.get("X-Plex-Client-Identifier")).toBe(`shared-watchtower-client-${first.searchParams.get("session")}`);
    expect(second.searchParams.get("X-Plex-Client-Identifier")).not.toBe(first.searchParams.get("X-Plex-Client-Identifier"));
  });
});
