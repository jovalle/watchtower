import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isTraktAvailable } from '~/lib/trakt/client.server';
import { saveIntegrations } from '~/lib/integrations/storage.server';

const realDataPath = process.env.DATA_PATH;
const realClientId = process.env.TRAKT_CLIENT_ID;
let dataPath: string;

beforeEach(async () => {
  await fs.mkdir('tmp', { recursive: true });
  dataPath = await fs.mkdtemp(path.join('tmp', 'trakt-client-'));
  process.env.DATA_PATH = dataPath;
  delete process.env.TRAKT_CLIENT_ID;
});

afterEach(async () => {
  for (const [key, value] of [['DATA_PATH', realDataPath], ['TRAKT_CLIENT_ID', realClientId]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(dataPath, { recursive: true, force: true });
});

describe('isTraktAvailable', () => {
  it('uses the client ID saved in Integrations without TRAKT_CLIENT_ID', async () => {
    expect(await isTraktAvailable()).toBe(false);
    await saveIntegrations({ trakt: { clientId: 'from-settings', clientSecret: 'secret' } });
    expect(await isTraktAvailable()).toBe(true);
  });
});
