import { describe, it, expect, afterEach } from 'vitest';
import { SeerrClient } from '~/lib/integrations/seerr.server';
import { normalizeServiceUrl } from '~/lib/integrations/storage.server';

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return new Response(JSON.stringify(handler(url, init)), { status: 200 });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('SeerrClient', () => {
  it('maps a Plex account to its Seerr user and files the request as that user', async () => {
    const calls = stubFetch((url) =>
      url.endsWith('/user?take=1000') ? { results: [{ id: 7, plexId: 42 }, { id: 1, plexId: 99 }] } : {},
    );
    const client = new SeerrClient('http://seerr:5055', 'key');

    const userId = await client.findUserIdByPlexId(42);
    await client.createRequest('tv', 1399, userId!);

    expect(userId).toBe(7);
    const request = calls.find((c) => c.url === 'http://seerr:5055/api/v1/request')!;
    expect((request.init.headers as Record<string, string>)['X-Api-User']).toBe('7');
    expect(JSON.parse(String(request.init.body))).toEqual({ mediaType: 'tv', mediaId: 1399, seasons: 'all' });
  });

  it('returns null for Plex users that Seerr has not imported', async () => {
    stubFetch(() => ({ results: [{ id: 1, plexId: 99 }] }));
    expect(await new SeerrClient('http://seerr:5055', 'key').findUserIdByPlexId(12345)).toBeNull();
  });

  it('maps Seerr media status codes', async () => {
    stubFetch(() => ({ mediaInfo: { status: 5 } }));
    expect(await new SeerrClient('http://seerr:5055', 'key').getStatus('movie', 603)).toBe('available');
  });
});

describe('normalizeServiceUrl', () => {
  it('trims trailing slashes and keeps sub-paths', () => {
    expect(normalizeServiceUrl(' https://example.com/seerr/ ')).toBe('https://example.com/seerr');
  });

  it('rejects non-http URLs', () => {
    expect(normalizeServiceUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeServiceUrl('not a url')).toBeNull();
  });
});
