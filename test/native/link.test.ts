import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env.server", () => ({ env: { SESSION_SECRET: "test-session-secret" } }));

import { linkCsrfToken, requireLinkCsrf, sanitizeUserCode } from "~/lib/native/link.server";

describe("browser device linking security", () => {
  it("sanitizes only complete pairing codes", () => {
    expect(sanitizeUserCode("bcdf-gh23")).toBe("BCDFGH23");
    expect(sanitizeUserCode("AAAA-AAAA")).toBe("");
  });

  it("rejects missing and incorrect CSRF tokens", () => {
    const request = new Request("https://watchtower.test/app/link", { method: "POST", headers: { Origin: "https://watchtower.test" } });
    const expected = linkCsrfToken("plex-token");
    expect(() => requireLinkCsrf(request, null, expected)).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireLinkCsrf(request, "wrong", expected)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("rejects cross-origin requests and permits the same-origin fallback", () => {
    const expected = linkCsrfToken("plex-token");
    expect(() => requireLinkCsrf(new Request("https://watchtower.test/app/link", { method: "POST", headers: { Origin: "https://attacker.test" } }), expected, expected)).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireLinkCsrf(new Request("https://watchtower.test/app/link", { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }), expected, expected)).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireLinkCsrf(new Request("https://watchtower.test/app/link", { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } }), expected, expected)).not.toThrow();
  });
});