import { afterEach, describe, it, expect, vi } from "vitest";
import { dedupeByGuid, PlexClient } from "~/lib/plex/client.server";
import type { PlexMediaItem } from "~/lib/plex/types";

const item = (ratingKey: string, guid: string, lastViewedAt?: number) =>
  ({
    ratingKey,
    guid,
    lastViewedAt,
    title: ratingKey,
    type: "movie",
  } as PlexMediaItem);

describe("dedupeByGuid", () => {
  it("keeps the most recently viewed version of the same title", () => {
    const result = dedupeByGuid([
      item("4k", "plex://movie/a", 100),
      item("other", "plex://movie/b", 150),
      item("1080p", "plex://movie/a", 200),
    ]);
    expect(result.map((i) => i.ratingKey)).toEqual(["1080p", "other"]);
  });

  it("falls back to ratingKey when GUID is missing", () => {
    const result = dedupeByGuid([item("1", ""), item("2", "")]);
    expect(result).toHaveLength(2);
  });
});


describe("Plex transcode negotiation identity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recognizes an explicit direct-play part without a legacy general decision code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ MediaContainer: {
      Metadata: [{ Media: [{ Part: [{ decision: "directplay" }] }] }],
    } })));
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "playback-client" });
    const result = await client.getTranscodeDecision("http://plex.test/video/:/transcode/universal/decision?directPlay=1");
    expect(result).toMatchObject({ success: true, data: { directPlayApproved: true } });
  });

  it("negotiates with the startup client identity in both header and query", async () => {
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { generalDecisionCode: 1001 } }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "shared-catalog-client" });
    await client.getTranscodeDecision("http://plex.test/video/:/transcode/universal/start.m3u8?session=playback-session&X-Plex-Client-Identifier=unique-playback-client");
    const [input, options] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.pathname).toBe("/video/:/transcode/universal/decision");
    expect(new Headers(options.headers).get("X-Plex-Client-Identifier")).toBe(url.searchParams.get("X-Plex-Client-Identifier"));
  });
});

describe("Plex timeline transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["playing", "paused", "stopped"] as const)("reports %s using POST with the playback identity", async (state) => {
    const upstream = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "isolated-playback-client" });

    expect(await client.reportTimeline({ ratingKey: "42", state, time: 36_000, duration: 9_670_000 }))
      .toEqual({ success: true, data: undefined });

    const [input, options] = upstream.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/:/timeline");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ratingKey: "42", key: "/library/metadata/42", state, time: "36000", duration: "9670000", identifier: "com.plexapp.plugins.library",
    });
    const headers = new Headers(options?.headers);
    expect(headers.get("X-Plex-Token")).toBe("profile-token");
    expect(headers.get("X-Plex-Client-Identifier")).toBe("isolated-playback-client");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.method).toBe("POST");
  });

  it.each([[401, "Unauthorized"], [503, "Service Unavailable"]] as const)("preserves HTTP %i failures", async (status, statusText) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status, statusText })));
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "isolated-playback-client" });
    expect(await client.reportTimeline({ ratingKey: "42", state: "stopped", time: 36_000, duration: 9_670_000 }))
      .toEqual({ success: false, error: { code: status, status, message: `HTTP ${status}: ${statusText}` } });
  });

  it("preserves timeout failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }));
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "isolated-playback-client" });
    expect(await client.reportTimeline({ ratingKey: "42", state: "stopped", time: 36_000, duration: 9_670_000 }))
      .toEqual({ success: false, error: { code: -1, message: "Request timed out" } });
  });
});

describe("Plex metadata selector validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["", "..", "42/children", "../../../:/scrobble?key=42", "42?includeMarkers=1", "42%2fchildren", "42#fragment", "42,43", " 42"])("rejects malformed selector %j without contacting Plex", async (ratingKey) => {
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42" }] } }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "test-client" });
    expect(await client.getMetadata(ratingKey)).toMatchObject({ success: false, error: { code: 400, status: 400 } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["42", "a12b34cd-5678-90ab-cdef-1234567890ab", "opaque_UUID-42"])("preserves valid numeric or opaque selector %j", async (ratingKey) => {
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { Metadata: [{ ratingKey }] } }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "http://plex.test", token: "profile-token", clientId: "test-client" });
    expect(await client.getMetadata(ratingKey, { includeMarkers: true })).toMatchObject({ success: true, data: { ratingKey } });
    const url = new URL(String((upstream.mock.calls[0] as unknown as [string])[0]));
    expect(url.pathname).toBe(`/library/metadata/${ratingKey}`);
    expect(url.searchParams.get("includeMarkers")).toBe("1");
  });
});

describe("Plex continue-watching dismissal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the dedicated PUT action with the profile token and accepts an empty success", async () => {
    const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "https://plex.test", token: "profile-token", clientId: "tv-client" });
    expect(await client.removeFromContinueWatching("42")).toEqual({ success: true, data: undefined });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [input, init] = upstream.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/actions/removeFromContinueWatching");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ratingKey: "42" });
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("X-Plex-Token")).toBe("profile-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([401, 503])("preserves HTTP %i failure and verifies expired upstream authorization", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
    const onUnauthorized = vi.fn();
    const client = new PlexClient({ serverUrl: "https://plex.test", token: "profile-token", clientId: "tv-client", onUnauthorized });
    expect(await client.removeFromContinueWatching("42")).toMatchObject({ success: false, error: { code: status, status } });
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it("retains timeout errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }));
    const client = new PlexClient({ serverUrl: "https://plex.test", token: "profile-token", clientId: "tv-client" });
    expect(await client.removeFromContinueWatching("42")).toEqual({ success: false, error: { code: -1, message: "Request timed out" } });
  });

  it.each(["", "../42", "42&ratingKey=43", "42,43"])("rejects malformed selector %j before a write", async (ratingKey) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const client = new PlexClient({ serverUrl: "https://plex.test", token: "profile-token", clientId: "tv-client" });
    expect(await client.removeFromContinueWatching(ratingKey)).toMatchObject({ success: false, error: { code: 400, status: 400 } });
    expect(upstream).not.toHaveBeenCalled();
  });
});
