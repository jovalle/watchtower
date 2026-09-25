import { describe, it, expect } from 'vitest';
import { toScrobbleTarget, nextScrobbleAction } from '~/lib/trakt/scrobble.server';

describe('toScrobbleTarget', () => {
  it('builds a movie target from Plex external GUIDs', () => {
    expect(
      toScrobbleTarget({
        type: 'movie',
        Guid: [{ id: 'imdb://tt0133093' }, { id: 'tmdb://603' }, { id: 'plex://movie/5d77' }],
      }),
    ).toEqual({ movie: { ids: { imdb: 'tt0133093', tmdb: 603 } } });
  });

  it('builds an episode target from episode-level IDs', () => {
    expect(toScrobbleTarget({ type: 'episode', Guid: [{ id: 'tvdb://349232' }] })).toEqual({
      episode: { ids: { tvdb: 349232 } },
    });
  });

  it('returns null without usable IDs or for non-playable types', () => {
    expect(toScrobbleTarget({ type: 'movie', Guid: [{ id: 'plex://movie/5d77' }] })).toBeNull();
    expect(toScrobbleTarget({ type: 'show', Guid: [{ id: 'tmdb://1399' }] })).toBeNull();
  });
});

describe('nextScrobbleAction', () => {
  it('starts on first play and ignores repeated progress reports', () => {
    expect(nextScrobbleAction(undefined, 'playing')).toBe('start');
    expect(nextScrobbleAction('playing', 'playing')).toBeNull();
  });

  it('pauses, resumes, and stops on transitions', () => {
    expect(nextScrobbleAction('playing', 'paused')).toBe('pause');
    expect(nextScrobbleAction('paused', 'playing')).toBe('start');
    expect(nextScrobbleAction('paused', 'stopped')).toBe('stop');
  });

  it('ignores a stop or pause with no prior playback', () => {
    expect(nextScrobbleAction(undefined, 'stopped')).toBeNull();
    expect(nextScrobbleAction(undefined, 'paused')).toBeNull();
  });
});
