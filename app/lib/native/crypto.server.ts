import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, open, readFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { getDataPath } from "~/lib/config/server-config.server";

export interface SealedValue {
  iv: string;
  ciphertext: string;
  tag: string;
}

let cachedDeviceKey: Buffer | undefined;
let deviceKeyPromise: Promise<Buffer> | undefined;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createDeviceToken(): string {
  return `wtd_${randomBytes(32).toString("base64url")}`;
}

export function createPollingSecret(): string {
  return `wtp_${randomBytes(32).toString("base64url")}`;
}

async function writeNewPrivateFile(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export async function getDeviceKey(): Promise<Buffer> {
  if (cachedDeviceKey) return cachedDeviceKey;
  deviceKeyPromise ??= loadDeviceKey().catch((error) => {
    deviceKeyPromise = undefined;
    throw error;
  });
  return deviceKeyPromise;
}

async function loadDeviceKey(): Promise<Buffer> {
  const directory = path.join(getDataPath(), "config");
  const file = path.join(directory, "device-key");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  try {
    const encoded = (await readFile(file, "utf8")).trim();
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error("Invalid device key");
    cachedDeviceKey = key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const key = randomBytes(32);
    try {
      await writeNewPrivateFile(file, key.toString("base64"));
      cachedDeviceKey = key;
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      cachedDeviceKey = Buffer.from((await readFile(file, "utf8")).trim(), "base64");
    }
  }
  return cachedDeviceKey;
}

function deriveKey(deviceKey: Buffer, bearerToken: string): Buffer {
  return createHmac("sha256", deviceKey).update(`wtd-v1:${bearerToken}`).digest();
}

export function sealWithKey(value: string, key: Buffer, aad: string): SealedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function openWithKey(value: SealedValue, key: Buffer, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function sealCredential(
  value: string,
  bearerToken: string,
  sessionId: string,
  field: string,
): Promise<SealedValue> {
  return sealWithKey(value, deriveKey(await getDeviceKey(), bearerToken), `${sessionId}:${field}`);
}

export async function openCredential(
  value: SealedValue,
  bearerToken: string,
  sessionId: string,
  field: string,
): Promise<string> {
  return openWithKey(value, deriveKey(await getDeviceKey(), bearerToken), `${sessionId}:${field}`);
}

export function resetNativeCryptoForTests(): void {
  cachedDeviceKey = undefined;
  deviceKeyPromise = undefined;
}
