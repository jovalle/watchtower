/**
 * Startup health checks and logging.
 * Runs once on server start to verify configuration.
 */

import { env } from "./env.server";

interface HealthCheckResult {
  plexReachable: boolean;
  plexAuthenticated: boolean;
  plexServerUrl: string;
  error?: string;
}

let startupCheckDone = false;
let lastCheckResult: HealthCheckResult | null = null;

/**
 * Check if Plex server is reachable and authenticated.
 */
async function checkPlexHealth(token: string): Promise<HealthCheckResult> {
  const serverUrl = env.PLEX_SERVER_URL;
  const result: HealthCheckResult = {
    plexReachable: false,
    plexAuthenticated: false,
    plexServerUrl: serverUrl,
  };

  try {
    // First check if server is reachable (without auth)
    const reachableCheck = await fetch(serverUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!reachableCheck) {
      result.error = `Plex server not reachable at ${serverUrl}`;
      return result;
    }

    result.plexReachable = true;

    // Now check authentication
    const authCheck = await fetch(`${serverUrl}/library/sections`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": token,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (authCheck.status === 401) {
      result.error = "Plex token is invalid or expired";
      return result;
    }

    if (!authCheck.ok) {
      result.error = `Plex API error: ${authCheck.status} ${authCheck.statusText}`;
      return result;
    }

    result.plexAuthenticated = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * Run startup health checks and log results.
 * Called automatically on first request.
 */
export async function runStartupChecks(token?: string): Promise<void> {
  if (startupCheckDone) return;
  startupCheckDone = true;

  console.log("\n" + "=".repeat(60));
  console.log("🗼 WATCHTOWER STARTUP");
  console.log("=".repeat(60));

  // Log configuration
  console.log("\n📋 Configuration:");
  console.log(`   PLEX_SERVER_URL: ${env.PLEX_SERVER_URL}`);
  console.log(`   PLEX_CLIENT_ID:  ${env.PLEX_CLIENT_ID}`);
  console.log(`   NODE_ENV:        ${env.NODE_ENV}`);
  console.log(`   DATA_PATH:       ${env.DATA_PATH}`);

  // Check Plex connectivity if we have a token
  if (token) {
    console.log("\n🔍 Checking Plex connectivity...");
    const result = await checkPlexHealth(token);
    lastCheckResult = result;

    if (result.plexReachable && result.plexAuthenticated) {
      console.log(`   ✅ Plex server is reachable and authenticated`);
    } else if (result.plexReachable) {
      console.log(`   ⚠️  Plex server reachable but NOT authenticated`);
      console.log(`   ❌ ${result.error}`);
    } else {
      console.log(`   ❌ Plex server NOT reachable`);
      console.log(`   ❌ ${result.error}`);
      console.log(`\n   💡 Hints:`);
      console.log(`      - Check if PLEX_SERVER_URL is correct`);
      console.log(`      - If using Docker, ensure containers are on the same network`);
      console.log(`      - Try using host IP instead of container name`);
    }
  } else {
    console.log("\n⏳ Plex connectivity will be checked on first authenticated request");
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Get the last health check result.
 */
export function getLastHealthCheck(): HealthCheckResult | null {
  return lastCheckResult;
}

/**
 * Log a Plex connection error with helpful hints.
 */
export function logPlexError(context: string, error: unknown): void {
  const serverUrl = env.PLEX_SERVER_URL;
  console.error(`\n❌ [${context}] Plex connection error:`);
  console.error(`   Server URL: ${serverUrl}`);
  console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n   💡 Troubleshooting:`);
  console.error(`      1. Verify PLEX_SERVER_URL is correct (currently: ${serverUrl})`);
  console.error(`      2. Check if Plex server is running`);
  console.error(`      3. Ensure network connectivity between containers`);
  console.error(`      4. Verify PLEX_TOKEN is valid\n`);
}
