import { describe, it, expect, afterEach } from "vitest";
import { SeerrClient } from "~/lib/integrations/seerr.server";
import { normalizeServiceUrl } from "~/lib/integrations/storage.server";

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ) => {
    const url = String(input);
    calls.push({ url, init });
    return new Response(JSON.stringify(handler(url, init)), { status: 200 });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("SeerrClient", () => {
  it("maps a Plex account to its Seerr user and files the request as that user", async () => {
    const calls = stubFetch((url) =>
      url.endsWith("/user?take=1000")
        ? {
            results: [
              { id: 7, plexId: 42 },
              { id: 1, plexId: 99 },
            ],
          }
        : { id: 123 }
    );
    const client = new SeerrClient("http://seerr:5055", "key");

    const userId = await client.findUserIdByPlexId(42);
    await client.createRequest("tv", 1399, userId!);

    expect(userId).toBe(7);
    const request = calls.find(
      (c) => c.url === "http://seerr:5055/api/v1/request"
    )!;
    expect((request.init.headers as Record<string, string>)["X-Api-User"]).toBe(
      "7"
    );
    expect(JSON.parse(String(request.init.body))).toEqual({
      mediaType: "tv",
      mediaId: 1399,
      seasons: "all",
    });
  });

  it("returns null for Plex users that Seerr has not imported", async () => {
    stubFetch(() => ({ results: [{ id: 1, plexId: 99 }] }));
    expect(
      await new SeerrClient("http://seerr:5055", "key").findUserIdByPlexId(
        12345
      )
    ).toBeNull();
  });

  it.each([
    [5, "available"],
    [6, "blocklisted"],
    [7, "unknown"],
  ])("maps Seerr media status %i to %s", async (code, expected) => {
    stubFetch(() => ({ mediaInfo: { status: code } }));
    expect(
      await new SeerrClient("http://seerr:5055", "key").getStatus("movie", 603)
    ).toBe(expected);
  });
});

describe("normalizeServiceUrl", () => {
  it("trims trailing slashes and keeps sub-paths", () => {
    expect(normalizeServiceUrl(" https://example.com/seerr/ ")).toBe(
      "https://example.com/seerr"
    );
  });

  it("rejects non-http URLs", () => {
    expect(normalizeServiceUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeServiceUrl("not a url")).toBeNull();
  });
});

describe("Seerr pages", () => {
  it("scopes requests to their owner and issues to the signed-in user permissions", async () => {
    const calls = stubFetch(() => ({ results: [], pageInfo: { pages: 0 } }));
    const client = new SeerrClient("http://seerr:5055", "key");
    await client.getRequests(17, 3, "pending");
    await client.getIssues(17, 2, "open");
    expect(calls[0].url).toContain("skip=40&requestedBy=17&filter=pending");
    expect(calls[1].url).toContain("skip=20&filter=open");
    for (const call of calls)
      expect((call.init.headers as Record<string, string>)["X-Api-User"]).toBe(
        "17"
      );
  });

  it("does not cancel someone else's request or an approved request", async () => {
    const client = new SeerrClient("http://seerr:5055", "key");
    for (const item of [
      { requestedBy: { id: 18 }, status: 1 },
      { requestedBy: { id: 17 }, status: 2 },
    ]) {
      const calls = stubFetch(() => item);
      await expect(client.cancelRequest(50, 17)).rejects.toThrow(
        "Only your pending requests"
      );
      expect(calls).toHaveLength(1);
    }
  });

  it("handles Seerr's empty successful cancellation response", async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      methods.push(init?.method || "GET");
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ requestedBy: { id: 17 }, status: 1 }));
    }) as typeof fetch;
    await expect(
      new SeerrClient("http://seerr:5055", "key").cancelRequest(50, 17)
    ).resolves.toBeUndefined();
    expect(methods).toEqual(["GET", "DELETE"]);
  });

  it("checks issue ownership before posting comments or resolving", async () => {
    const calls = stubFetch(() => ({ createdBy: { id: 18 } }));
    const client = new SeerrClient("http://seerr:5055", "key");
    await expect(
      client.updateIssue(50, 17, "comment", "Hello")
    ).rejects.toThrow("another user");
    expect(calls).toHaveLength(1);
  });

  it("sends reports and comments as the signed-in Seerr user", async () => {
    const calls = stubFetch(() => ({ createdBy: { id: 17 } }));
    const client = new SeerrClient("http://seerr:5055", "key");
    await client.createIssue(23, 2, "No audio", 17);
    await client.updateIssue(50, 17, "comment", "Still happening");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      mediaId: 23,
      issueType: 2,
      message: "No audio",
    });
    expect(calls[2].url.endsWith("/issue/50/comment")).toBe(true);
    for (const call of calls)
      expect((call.init.headers as Record<string, string>)["X-Api-User"]).toBe(
        "17"
      );
  });
});

it("loads issues without the query parameter rejected by Seerr's API validator", async () => {
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.searchParams.has("createdBy"))
      return new Response(
        JSON.stringify({ message: "Unknown query parameter 'createdBy'" }),
        { status: 400 }
      );
    expect((init?.headers as Record<string, string>)["X-Api-User"]).toBe("17");
    return new Response(
      JSON.stringify({
        results: [{ id: 42 }],
        pageInfo: { page: 2, pages: 3, results: 45 },
      })
    );
  }) as typeof fetch;
  await expect(
    new SeerrClient("http://seerr:5055", "key").getIssues(17, 2, "open")
  ).resolves.toEqual({
    results: [{ id: 42 }],
    pageInfo: { page: 2, pages: 3, results: 45 },
  });
});

it("does not claim a request was created when Seerr returns its no-seasons response", async () => {
  globalThis.fetch = (async () => Response.json({ message: "No seasons available to request" }, { status: 202 })) as typeof fetch;
  await expect(new SeerrClient("http://seerr:5055", "key").createRequest("tv", 42, 7)).rejects.toThrow("No seasons available");
});
