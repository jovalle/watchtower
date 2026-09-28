import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimitFailures,
  clearRateLimit,
  recordRateLimitFailure,
  resetNativeRateLimitsForTests,
} from "~/lib/native/rate-limit.server";

describe("native failure rate limits", () => {
  beforeEach(() => resetNativeRateLimitsForTests());

  it("blocks after five rejected PINs and clears after success", () => {
    const recordFailure = () =>
      recordRateLimitFailure("profile-pin", "device:profile", 5, 15_000, 1_000);
    const checkFailures = () =>
      checkRateLimitFailures("profile-pin", "device:profile", 5, 15_000, 1_000);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(recordFailure).not.toThrow();
    }
    expect(checkFailures).toThrowError(
      expect.objectContaining({ status: 429, code: "rate_limited" }),
    );

    clearRateLimit("profile-pin", "device:profile");
    expect(checkFailures).not.toThrow();
  });
});