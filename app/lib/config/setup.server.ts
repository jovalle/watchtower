/**
 * Admin onboarding helpers: one-time setup code, access guard, and connection probing.
 */

import { randomInt, timingSafeEqual } from "crypto";
import { getServerConfig } from "~/lib/config/server-config.server";

// No 0/O/1/I to keep the code easy to read from logs.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const PROBE_TIMEOUT_MS = 4000;

let setupCode: string | null = null;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Current setup code, generated on first use and printed by the startup checks.
 */
export function getSetupCode(): string {
  if (!setupCode) {
    setupCode = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    ).join("");
  }
  return setupCode;
}

export function formatSetupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function verifySetupCode(input: string): boolean {
  const expected = Buffer.from(getSetupCode());
  const actual = Buffer.from(normalizeCode(input));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function rotateSetupCode(): void {
  setupCode = null;
}

/**
 * Before setup, only the user who entered the setup code; after setup, only the saved admin.
 */
export function canManageServer(
  userId: number,
  claimedUserId: number | undefined
): boolean {
  const config = getServerConfig();
  return config ? config.adminUserId === userId : claimedUserId === userId;
}

export interface ProbeResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Check that a connection URI reaches the expected Plex server.
 */
export async function probeConnection(
  uri: string,
  machineIdentifier: string
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${uri.replace(/\/$/, "")}/identity`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const data = await response.json();
    if (data?.MediaContainer?.machineIdentifier !== machineIdentifier) {
      return { ok: false, error: "Different server responded" };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, error: timedOut ? "Timed out" : "Unreachable" };
  }
}
