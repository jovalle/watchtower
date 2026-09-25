import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getTraktAccessToken,
  getTraktAccount,
  saveTraktAccount,
} from "~/lib/trakt/oauth.server";

const realFetch = globalThis.fetch;
const realDataPath = process.env.DATA_PATH;
const app = { clientId: "client", clientSecret: "secret" };
let dataPath: string;

beforeEach(async () => {
  await fs.mkdir("tmp", { recursive: true });
  dataPath = await fs.mkdtemp(path.join("tmp", "trakt-oauth-"));
  process.env.DATA_PATH = dataPath;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  if (realDataPath === undefined) delete process.env.DATA_PATH;
  else process.env.DATA_PATH = realDataPath;
  await fs.rm(dataPath, { recursive: true, force: true });
});

describe("getTraktAccessToken", () => {
  it("spends a single-use refresh token once when requests race", async () => {
    await saveTraktAccount(1, {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1000,
      username: "jay",
      scrobble: true,
    });
    const refreshCalls: Array<{ url: string; body: Record<string, string> }> =
      [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init: RequestInit = {}
    ) => {
      refreshCalls.push({
        url: String(input),
        body: JSON.parse(String(init.body)),
      });
      const created_at = Math.floor(Date.now() / 1000);
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 86400,
          created_at,
        })
      );
    }) as typeof fetch;

    const tokens = await Promise.all([
      getTraktAccessToken(1, app),
      getTraktAccessToken(1, app),
    ]);

    expect(tokens).toEqual(["new-access", "new-access"]);
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0].url).toBe("https://auth.trakt.tv/oauth/token");
    expect(refreshCalls[0].body.refresh_token).toBe("old-refresh");
    expect((await getTraktAccount(1))?.refreshToken).toBe("new-refresh");
  });
});
