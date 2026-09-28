import { randomBytes } from "node:crypto";
import type {
  CreateDeviceAuthorizationRequest,
  DeviceAuthorizationResponse,
  MeResponse,
  PollDeviceAuthorizationResponse,
} from "./contract";
import { createPollingSecret, openWithKey, sealWithKey, sha256 } from "./crypto.server";
import { createDeviceSession, type NewDeviceSession } from "./device-store.server";
import { NativeError } from "./http.server";
import { enforceRateLimit } from "./rate-limit.server";

const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
const EXPIRY_MS = 10 * 60 * 1000;
const INTERVAL_MS = 5 * 1000;
const REPLAY_MS = 60 * 1000;
const MAX_PENDING = 200;

type PairingState = "pending" | "approved" | "denied" | "claiming" | "claimed";

export interface LinkAuthorization {
  input: CreateDeviceAuthorizationRequest;
  code: string;
  pollingHash: string;
  createdAtMs: number;
  expiresAtMs: number;
  lastPollAtMs: number | null;
  state: PairingState;
}

interface PairingRecord extends LinkAuthorization {
  approvalKey?: Buffer;
  approval?: ReturnType<typeof sealWithKey>;
  replayKey?: Buffer;
  replay?: ReturnType<typeof sealWithKey>;
  replayUntilMs?: number;
  claim?: Promise<PollDeviceAuthorizationResponse>;
}

const byCode = new Map<string, PairingRecord>();
const byPollingHash = new Map<string, PairingRecord>();

function randomCode(): string {
  let code = "";
  do {
    const bytes = randomBytes(8);
    code = [...bytes].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
  } while (byCode.has(code));
  return code;
}

function sanitizeString(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 64) {
    throw new NativeError(400, "invalid_request", `${field} must be between 1 and 64 characters.`);
  }
  return value.trim();
}

export function parseCreateAuthorization(body: Record<string, unknown>): CreateDeviceAuthorizationRequest {
  if (body.platform !== "android-tv") {
    throw new NativeError(400, "invalid_request", "platform must be android-tv.");
  }
  return {
    deviceName: sanitizeString(body.deviceName, "deviceName") as string,
    platform: "android-tv",
    model: sanitizeString(body.model, "model", true),
    appVersion: sanitizeString(body.appVersion, "appVersion", true),
  };
}

export function createAuthorization(
  input: CreateDeviceAuthorizationRequest,
  origin: string,
  clientIp: string,
): DeviceAuthorizationResponse {
  const now = Date.now();
  enforceRateLimit("pair-create", clientIp, 10, EXPIRY_MS, now);
  const pending = [...byCode.values()].filter(
    (record) => record.state === "pending" && record.expiresAtMs > now,
  );
  if (pending.length >= MAX_PENDING) {
    throw new NativeError(503, "upstream_unavailable", "Pairing is temporarily unavailable.", true, 30);
  }
  const code = randomCode();
  const pollingSecret = createPollingSecret();
  const record: PairingRecord = {
    input,
    code,
    pollingHash: sha256(pollingSecret),
    createdAtMs: now,
    expiresAtMs: now + EXPIRY_MS,
    lastPollAtMs: null,
    state: "pending",
  };
  byCode.set(code, record);
  byPollingHash.set(record.pollingHash, record);
  const verificationUri = `${origin}/link`;
  return {
    userCode: `${code.slice(0, 4)}-${code.slice(4)}`,
    verificationUri,
    verificationUriComplete: `${verificationUri}?code=${code}`,
    pollingSecret,
    expiresInMs: EXPIRY_MS,
    intervalMs: INTERVAL_MS,
  };
}

export function lookupAuthorization(code: string): Readonly<LinkAuthorization> | null {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const record = byCode.get(normalized);
  if (!record || record.expiresAtMs <= Date.now() || record.state !== "pending") return null;
  return Object.freeze({ ...record });
}

export function approveAuthorization(code: string, approved: NewDeviceSession): boolean {
  const record = byCode.get(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (!record || record.expiresAtMs <= Date.now() || record.state !== "pending") return false;
  const key = randomBytes(32);
  record.approvalKey = key;
  record.approval = sealWithKey(JSON.stringify(approved), key, `pairing:${record.pollingHash}`);
  record.state = "approved";
  return true;
}

export function denyAuthorization(code: string): boolean {
  const record = byCode.get(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (!record || record.expiresAtMs <= Date.now() || record.state !== "pending") return false;
  record.state = "denied";
  byCode.delete(record.code);
  return true;
}

function meFor(record: Awaited<ReturnType<typeof createDeviceSession>>["record"]): MeResponse {
  return {
    deviceSessionId: record.deviceSessionId,
    identityVersion: record.identityVersion,
    expiresAtMs: record.expiresAtMs,
    server: { machineId: record.serverMachineId, name: record.serverName },
    account: record.account,
    profile: record.profile,
    features: {
      profiles: process.env.WATCHTOWER_PLEX_HOME_PROFILES === "1",
      requests: true,
      discovery: true,
      rooms: false,
    },
  };
}

async function claimApproved(record: PairingRecord): Promise<PollDeviceAuthorizationResponse> {
  const approved = JSON.parse(
    openWithKey(record.approval!, record.approvalKey!, `pairing:${record.pollingHash}`),
  ) as NewDeviceSession;
  const created = await createDeviceSession(createdInput(record, approved));
  const response: PollDeviceAuthorizationResponse = {
    status: "approved",
    session: {
      accessToken: created.accessToken,
      tokenType: "Bearer",
      deviceSessionId: created.record.deviceSessionId,
      expiresAtMs: created.record.expiresAtMs,
      expiresInMs: created.record.expiresAtMs - Date.now(),
      identityVersion: created.record.identityVersion,
    },
    me: meFor(created.record),
  };
  const key = randomBytes(32);
  record.replayKey = key;
  record.replay = sealWithKey(JSON.stringify(response), key, `replay:${record.pollingHash}`);
  record.replayUntilMs = Date.now() + REPLAY_MS;
  record.approval = undefined;
  record.approvalKey = undefined;
  record.state = "claimed";
  byCode.delete(record.code);
  return response;
}

function createdInput(record: PairingRecord, approved: NewDeviceSession): NewDeviceSession {
  return { ...approved, ...record.input, name: record.input.deviceName };
}

export async function pollAuthorization(pollingSecret: string): Promise<PollDeviceAuthorizationResponse> {
  if (!/^wtp_[A-Za-z0-9_-]{43}$/.test(pollingSecret)) {
    throw new NativeError(404, "authorization_not_found", "Authorization not found.");
  }
  const record = byPollingHash.get(sha256(pollingSecret));
  const now = Date.now();
  if (!record) throw new NativeError(404, "authorization_not_found", "Authorization not found.");
  if (record.state === "claimed") {
    if (record.replay && record.replayKey && (record.replayUntilMs ?? 0) >= now) {
      return JSON.parse(openWithKey(record.replay, record.replayKey, `replay:${record.pollingHash}`));
    }
    byPollingHash.delete(record.pollingHash);
    throw new NativeError(404, "authorization_not_found", "Authorization not found.");
  }
  if (record.state === "claiming") return record.claim!;
  if (record.lastPollAtMs !== null && now - record.lastPollAtMs < INTERVAL_MS) {
    throw new NativeError(429, "slow_down", "Polling too quickly.", false, Math.ceil((INTERVAL_MS - (now - record.lastPollAtMs)) / 1000));
  }
  record.lastPollAtMs = now;
  if (record.expiresAtMs <= now) {
    record.state = "claimed";
    record.replayUntilMs = 0;
    return { status: "expired" };
  }
  if (record.state === "denied") {
    record.state = "claimed";
    record.replayUntilMs = 0;
    return { status: "denied" };
  }
  if (record.state === "pending") {
    return { status: "pending", intervalMs: INTERVAL_MS, expiresInMs: record.expiresAtMs - now };
  }
  record.state = "claiming";
  record.claim = claimApproved(record);
  return record.claim;
}

export function resetPairingForTests(): void {
  byCode.clear();
  byPollingHash.clear();
}