import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataPath } from "~/lib/config/server-config.server";
import type { DevicePlatform, DeviceSummary, ProfileSummary } from "./contract";
import {
  createDeviceToken,
  openCredential,
  sealCredential,
  sha256,
  type SealedValue,
} from "./crypto.server";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface DeviceSessionRecord {
  deviceSessionId: string;
  tokenHash: string;
  name: string;
  platform: DevicePlatform;
  model: string | null;
  appVersion: string | null;
  account: { userId: string; title: string };
  profile: ProfileSummary;
  identityVersion: number;
  serverMachineId: string;
  serverName: string;
  accountPlexToken: SealedValue;
  plexToken: SealedValue;
  serverToken: SealedValue;
  isOwner: boolean;
  createdAtMs: number;
  expiresAtMs: number;
  lastSeenAtMs: number | null;
  revokedAtMs: number | null;
  verifiedAtMs: number;
  verifyImmediately: boolean;
}

interface DeviceSessionFile {
  version: 1;
  sessions: DeviceSessionRecord[];
}

export interface NewDeviceSession {
  name: string;
  platform: DevicePlatform;
  model: string | null;
  appVersion: string | null;
  account: { userId: string; title: string };
  profile: ProfileSummary;
  serverMachineId: string;
  serverName: string;
  accountPlexToken?: string;
  plexToken: string;
  serverToken: string;
  isOwner: boolean;
}

let loadedPath: string | undefined;
let records = new Map<string, DeviceSessionRecord>();
let writeQueue = Promise.resolve();

function sessionsFile(): string {
  return path.join(getDataPath(), "devices", "sessions.json");
}

async function ensureLoaded(): Promise<void> {
  const file = sessionsFile();
  if (loadedPath === file) return;
  records = new Map();
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as DeviceSessionFile;
    if (parsed.version === 1 && Array.isArray(parsed.sessions)) {
      const now = Date.now();
      for (const record of parsed.sessions) {
        const inactiveAt = record.revokedAtMs ?? record.expiresAtMs;
        if (inactiveAt + PRUNE_AFTER_MS > now) records.set(record.tokenHash, record);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Losing either this file or device-key intentionally signs every TV out.
      records = new Map();
    }
  }
  loadedPath = file;
}

async function persist(): Promise<void> {
  const file = sessionsFile();
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ version: 1, sessions: [...records.values()] }, null, 2),
    { mode: 0o600 },
  );
  await rename(temporary, file);
  await chmod(file, 0o600);
}

function queuePersist(): Promise<void> {
  const next = writeQueue.then(persist, persist);
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function createDeviceSession(input: NewDeviceSession): Promise<{
  accessToken: string;
  record: DeviceSessionRecord;
}> {
  await ensureLoaded();
  const accessToken = createDeviceToken();
  const deviceSessionId = randomUUID();
  const now = Date.now();
  const record: DeviceSessionRecord = {
    deviceSessionId,
    tokenHash: sha256(accessToken),
    name: input.name,
    platform: input.platform,
    model: input.model,
    appVersion: input.appVersion,
    account: input.account,
    profile: input.profile,
    identityVersion: 1,
    serverMachineId: input.serverMachineId,
    serverName: input.serverName,
    accountPlexToken: await sealCredential(
      input.accountPlexToken ?? input.plexToken,
      accessToken,
      deviceSessionId,
      "accountPlexToken",
    ),
    plexToken: await sealCredential(input.plexToken, accessToken, deviceSessionId, "plexToken"),
    serverToken: await sealCredential(input.serverToken, accessToken, deviceSessionId, "serverToken"),
    isOwner: input.isOwner,
    createdAtMs: now,
    expiresAtMs: now + SESSION_LIFETIME_MS,
    lastSeenAtMs: null,
    revokedAtMs: null,
    verifiedAtMs: now,
    verifyImmediately: false,
  };
  records.set(record.tokenHash, record);
  await queuePersist();
  return { accessToken, record: structuredClone(record) };
}

export async function findDeviceSession(accessToken: string): Promise<DeviceSessionRecord | null> {
  await ensureLoaded();
  const record = records.get(sha256(accessToken));
  return record ? structuredClone(record) : null;
}

export async function updateDeviceSession(
  tokenHash: string,
  update: (record: DeviceSessionRecord) => void,
): Promise<DeviceSessionRecord | null> {
  await ensureLoaded();
  const record = records.get(tokenHash);
  if (!record) return null;
  update(record);
  await queuePersist();
  return structuredClone(record);
}

export async function revokeDeviceSession(deviceSessionId: string): Promise<boolean> {
  await ensureLoaded();
  for (const record of records.values()) {
    if (record.deviceSessionId === deviceSessionId && record.revokedAtMs === null) {
      record.revokedAtMs = Date.now();
      await queuePersist();
      return true;
    }
  }
  return false;
}

export async function listAccountDevices(accountUserId: string): Promise<DeviceSessionRecord[]> {
  await ensureLoaded();
  const now = Date.now();
  return [...records.values()]
    .filter(
      (record) =>
        record.account.userId === accountUserId &&
        record.revokedAtMs === null &&
        record.expiresAtMs > now,
    )
    .map((record) => structuredClone(record));
}

export function toDeviceSummary(record: DeviceSessionRecord, currentId: string): DeviceSummary {
  return {
    deviceSessionId: record.deviceSessionId,
    name: record.name,
    platform: record.platform,
    model: record.model,
    appVersion: record.appVersion,
    createdAtMs: record.createdAtMs,
    lastSeenAtMs: record.lastSeenAtMs,
    expiresAtMs: record.expiresAtMs,
    current: record.deviceSessionId === currentId,
  };
}

export async function unsealDeviceCredentials(record: DeviceSessionRecord, accessToken: string) {
  return {
    plexToken: await openCredential(record.plexToken, accessToken, record.deviceSessionId, "plexToken"),
    serverToken: await openCredential(record.serverToken, accessToken, record.deviceSessionId, "serverToken"),
  };
}

export async function unsealAccountToken(
  record: DeviceSessionRecord,
  accessToken: string,
): Promise<string> {
  return openCredential(
    record.accountPlexToken,
    accessToken,
    record.deviceSessionId,
    "accountPlexToken",
  );
}

export async function replaceDeviceProfile(
  accessToken: string,
  expectedIdentityVersion: number,
  input: {
    profile: ProfileSummary;
    plexToken: string;
    serverToken: string;
    isOwner: boolean;
  },
): Promise<DeviceSessionRecord | null | "stale"> {
  await ensureLoaded();
  const tokenHash = sha256(accessToken);
  const current = records.get(tokenHash);
  if (!current) return null;
  const [plexToken, serverToken] = await Promise.all([
    sealCredential(input.plexToken, accessToken, current.deviceSessionId, "plexToken"),
    sealCredential(input.serverToken, accessToken, current.deviceSessionId, "serverToken"),
  ]);
  const record = records.get(tokenHash);
  if (!record) return null;
  if (record.identityVersion !== expectedIdentityVersion) return "stale";
  record.profile = input.profile;
  record.plexToken = plexToken;
  record.serverToken = serverToken;
  record.isOwner = input.isOwner;
  record.identityVersion += 1;
  record.verifiedAtMs = Date.now();
  record.verifyImmediately = false;
  await queuePersist();
  return structuredClone(record);
}

export async function replaceServerToken(
  accessToken: string,
  serverToken: string,
): Promise<void> {
  await ensureLoaded();
  const tokenHash = sha256(accessToken);
  const current = records.get(tokenHash);
  if (!current) return;
  const sealed = await sealCredential(serverToken, accessToken, current.deviceSessionId, "serverToken");
  const record = records.get(tokenHash);
  if (!record) return;
  record.serverToken = sealed;
  record.verifiedAtMs = Date.now();
  record.verifyImmediately = false;
  await queuePersist();
}

export function resetDeviceStoreForTests(): void {
  loadedPath = undefined;
  records = new Map();
  writeQueue = Promise.resolve();
}