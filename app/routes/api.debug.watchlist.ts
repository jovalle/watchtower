/**
 * Debug endpoint to test the Plex Watchlist API directly.
 * GET /api/debug/watchlist
 *
 * Tests multiple configurations to find what works.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PLEX_HEADERS } from "~/lib/plex/constants";
import { env } from "~/lib/env.server";

async function testEndpoint(
  url: string,
  headers: Record<string, string>,
  name: string
): Promise<{
  name: string;
  status: number;
  statusText: string;
  size?: number;
  totalSize?: number;
  itemCount?: number;
  error?: string;
  firstItemTitle?: string;
}> {
  try {
    const response = await fetch(url, { method: "GET", headers });
    const text = await response.text();

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON
    }

    return {
      name,
      status: response.status,
      statusText: response.statusText,
      size: parsed?.MediaContainer?.size,
      totalSize: parsed?.MediaContainer?.totalSize,
      itemCount: parsed?.MediaContainer?.Metadata?.length ?? 0,
      firstItemTitle: parsed?.MediaContainer?.Metadata?.[0]?.title,
      error: response.ok ? undefined : text.substring(0, 200),
    };
  } catch (error) {
    return {
      name,
      status: 0,
      statusText: "Network Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);

  // Test 1: metadata.provider.plex.tv (old endpoint)
  const metadataUrl = `https://metadata.provider.plex.tv/library/sections/watchlist/all?X-Plex-Token=${token}`;

  // Test 2: discover.provider.plex.tv (new endpoint)
  const discoverUrl = `https://discover.provider.plex.tv/library/sections/watchlist/all?X-Plex-Token=${token}`;

  // Test 3: discover with full params
  const discoverFullParams = new URLSearchParams();
  discoverFullParams.set("includeCollections", "1");
  discoverFullParams.set("includeExternalMedia", "1");
  discoverFullParams.set("X-Plex-Container-Size", "20");
  discoverFullParams.set("X-Plex-Container-Start", "0");
  discoverFullParams.set("X-Plex-Token", token);
  const discoverFullUrl = `https://discover.provider.plex.tv/library/sections/watchlist/all?${discoverFullParams.toString()}`;

  const baseHeaders = {
    ...PLEX_HEADERS,
    "X-Plex-Client-Identifier": env.PLEX_CLIENT_ID,
  };

  const headersWithToken = {
    ...baseHeaders,
    "X-Plex-Token": token,
  };

  // Run all tests in parallel
  const [test1, test2, test3, test4] = await Promise.all([
    testEndpoint(metadataUrl, baseHeaders, "metadata.provider (old) - token in URL"),
    testEndpoint(discoverUrl, baseHeaders, "discover.provider - token in URL only"),
    testEndpoint(discoverUrl, headersWithToken, "discover.provider - token in URL + header"),
    testEndpoint(discoverFullUrl, headersWithToken, "discover.provider - full params"),
  ]);

  // Also test if token is valid by checking plex.tv user info
  let userInfo = null;
  try {
    const userResponse = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        ...baseHeaders,
        "X-Plex-Token": token,
        "Accept": "application/json",
      },
    });
    if (userResponse.ok) {
      const userData = await userResponse.json();
      userInfo = {
        username: userData.username,
        email: userData.email,
        uuid: userData.uuid,
      };
    } else {
      userInfo = { error: `${userResponse.status} ${userResponse.statusText}` };
    }
  } catch (error) {
    userInfo = { error: error instanceof Error ? error.message : "Unknown error" };
  }

  return json({
    tokenInfo: {
      length: token.length,
      prefix: token.substring(0, 10) + "...",
    },
    userInfo,
    tests: [test1, test2, test3, test4],
  });
}
