import { describe, it, expect } from 'vitest';
import { toPlaybackMarkers, findActiveMarker, findNextEpisode } from '~/lib/plex/markers';

describe('toPlaybackMarkers', () => {
  it('converts intro/credits markers to seconds and drops other or empty markers', () => {
    const markers = toPlaybackMarkers([
      { type: 'intro', startTimeOffset: 5000, endTimeOffset: 65000 },
      { type: 'commercial', startTimeOffset: 100000, endTimeOffset: 130000 },
      { type: 'credits', startTimeOffset: 1200000, endTimeOffset: 1200000 },
      { type: 'credits', startTimeOffset: 1250000, endTimeOffset: 1300000, final: true },
    ]);
    expect(markers).toEqual([
      { type: 'intro', start: 5, end: 65 },
      { type: 'credits', start: 1250, end: 1300 },
    ]);
  });
});

describe('findActiveMarker', () => {
  const markers = [{ type: 'intro' as const, start: 5, end: 65 }];

  it('matches from start up to but not including end', () => {
    expect(findActiveMarker(markers, 5)?.type).toBe('intro');
    expect(findActiveMarker(markers, 64.9)?.type).toBe('intro');
    expect(findActiveMarker(markers, 65)).toBeNull();
    expect(findActiveMarker(markers, 4.9)).toBeNull();
  });
});

describe('findNextEpisode', () => {
  const eps = [{ ratingKey: 'a' }, { ratingKey: 'b' }, { ratingKey: 'c' }];

  it('returns the following episode', () => {
    expect(findNextEpisode(eps, 'b')).toEqual({ ratingKey: 'c' });
  });

  it('returns null for the last or an unknown episode', () => {
    expect(findNextEpisode(eps, 'c')).toBeNull();
    expect(findNextEpisode(eps, 'zzz')).toBeNull();
  });
});
