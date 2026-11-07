import { describe, expect, it } from "vitest";
import { NativeError, nativeErrorResponse, nativeMethodNotAllowed, readJsonObject } from "~/lib/native/http.server";
import { loader as nativeNotFound } from "~/routes/api.v1.$";

describe("native HTTP boundaries", () => {
  it("cancels an oversized chunked body before consuming the remaining stream", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (++pulls === 100) controller.close();
        else controller.enqueue(new Uint8Array(8192));
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const request = new Request("http://test/api/v1/device-authorizations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half",
    } as RequestInit & { duplex: string });
    await expect(readJsonObject(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(100);
  });

  it("rejects non-JSON and oversized bodies with the contract envelope", async () => {
    await expect(readJsonObject(new Request("http://test", { method: "POST", body: "{}" })))
      .rejects.toMatchObject({ status: 415, code: "unsupported_media_type" });
    await expect(readJsonObject(new Request("http://test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(16 * 1024) }),
    }))).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
  });

  it("sets request and retry headers on errors", async () => {
    const response = nativeErrorResponse(
      new NativeError(429, "slow_down", "Polling too quickly.", false, 5),
      "request-1",
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Request-Id")).toBe("request-1");
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(await response.json()).toEqual({
      error: { code: "slow_down", message: "Polling too quickly.", retryable: false, requestId: "request-1" },
    });
  });

  it("returns native JSON envelopes for unsupported and unknown routes", async () => {
    const unsupported = await nativeMethodNotAllowed({
      request: new Request("http://test/api/v1/playback"),
    });
    expect(unsupported.status).toBe(405);
    expect(await unsupported.json()).toMatchObject({
      error: { code: "method_not_allowed", retryable: false },
    });

    const missing = await nativeNotFound({
      request: new Request("http://test/api/v1/unknown"),
      params: { "*": "unknown" },
      context: {},
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });
});
