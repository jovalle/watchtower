import { describe, expect, it } from "vitest";
import { plexData } from "~/lib/native/catalog.server";

describe("required Plex metadata error classification", () => {
  it.each([
    ["HTTP outage", { code: 503, status: 503, message: "Unavailable" }],
    ["network failure", { code: -1, message: "Connection failed" }],
    ["HTTP status overriding legacy code", { code: 404, status: 503, message: "Unavailable" }],
  ])("keeps %s retryable instead of claiming the media was deleted", (_name, error) => {
    expect(() => plexData({ success: false, error }, true)).toThrowError(expect.objectContaining({
      status: 503, code: "upstream_unavailable", retryable: true, retryAfterSeconds: 15,
    }));
  });

  it.each([
    ["HTTP not found", { code: 404, status: 404, message: "Not found" }],
    ["legacy statusless not found", { code: 404, message: "Not found" }],
  ])("preserves %s for a required metadata lookup", (_name, error) => {
    expect(() => plexData({ success: false, error }, true)).toThrowError(expect.objectContaining({
      status: 404, code: "not_found", retryable: false,
    }));
  });

  it("keeps revoked authorization distinct from missing metadata", () => {
    expect(() => plexData({ success: false, error: { code: 401, status: 401, message: "Unauthorized" } }, true))
      .toThrowError(expect.objectContaining({ status: 401, code: "upstream_auth_failed", retryable: false }));
  });

  it("does not change statusless error handling for other Plex reads", () => {
    expect(() => plexData({ success: false, error: { code: 404, message: "Not found" } }))
      .toThrowError(expect.objectContaining({ status: 503, code: "upstream_unavailable", retryable: true }));
  });
});
