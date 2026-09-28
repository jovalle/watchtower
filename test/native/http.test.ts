import { describe, expect, it } from "vitest";
import { NativeError, nativeErrorResponse, readJsonObject } from "~/lib/native/http.server";

describe("native HTTP boundaries", () => {
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
});