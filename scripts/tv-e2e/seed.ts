/** Local isolated test seeder only. Never point DATA_PATH or the generated credential at a real server. */
import { rm } from "node:fs/promises";
import path from "node:path";
import { saveServerConfig, getSessionSecret } from "../../app/lib/config/server-config.server";
import { createDeviceSession, resetDeviceStoreForTests } from "../../app/lib/native/device-store.server";
import { resetNativeCryptoForTests } from "../../app/lib/native/crypto.server";

const dataPath = path.resolve(process.env.DATA_PATH ?? "tmp/tv-e2e/data");
process.env.DATA_PATH = dataPath;
await rm(dataPath, { recursive: true, force: true });
resetNativeCryptoForTests(); resetDeviceStoreForTests();
saveServerConfig({ serverUrl: "http://127.0.0.1:32499", machineIdentifier: "fake-machine", serverName: "Fake PMS", token: "fake-owner-token", adminUserId: 1001, adminUsername: "Test Owner" });
getSessionSecret();
const created = await createDeviceSession({ name: "Harness TV", platform: "android-tv", model: "Local Harness", appVersion: "test", account: { userId: "1001", title: "Test Owner" }, profile: { userId: "1001", title: "Test Owner", restricted: false, owner: true, protected: false }, serverMachineId: "fake-machine", serverName: "Fake PMS", accountPlexToken: "fake-account-token", plexToken: "fake-account-token", serverToken: "fake-owner-token", isOwner: true });
process.stdout.write(`${created.accessToken}\n`);
process.stderr.write(`${JSON.stringify({ dataPath, deviceSessionId: created.record.deviceSessionId, identityVersion: 1 })}\n`);