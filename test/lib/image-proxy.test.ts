import { describe, it, expect } from 'vitest';
import { resolveImageUrl } from '~/lib/plex/image-proxy.server';

const SERVER = 'http://plex:32400';

describe('resolveImageUrl', () => {
  it('adds the token to Plex library image paths', () => {
    expect(resolveImageUrl('/library/metadata/1/thumb/2?width=400', 'tok', SERVER)).toBe(
      'http://plex:32400/library/metadata/1/thumb/2?width=400&X-Plex-Token=tok',
    );
  });

  it('never sends the token to external hosts', () => {
    const url = resolveImageUrl('https://metadata-static.plex.tv/a/b.jpg?X-Plex-Token=x', 'tok', SERVER);
    expect(url).toBe('https://metadata-static.plex.tv/a/b.jpg');
  });

  it.each([
    'https://attacker.example/x.jpg',
    'https://plex.tv.attacker.example/x.jpg',
    'http://image.tmdb.org/t/p/w500/x.jpg',
    'http://192.168.1.10:8080/admin',
    '/:/prefs',
    '/accounts',
    '/library/../:/prefs',
    '/library/metadata/1?X-Plex-Token=other',
    'library/metadata/1/thumb',
  ])('rejects %s', (path) => {
    expect(resolveImageUrl(path, 'tok', SERVER)).toBeNull();
  });
});
