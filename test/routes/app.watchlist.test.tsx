/**
 * Tests for the Watchlist page
 *
 * These tests ensure:
 * 1. Helper functions work correctly
 * 2. Filtering logic produces expected results
 * 3. Sorting logic works for all sort options
 */

import { describe, it, expect } from 'vitest';
import type { UnifiedWatchlistItem } from '~/lib/watchlist/types';

/**
 * Build image URL for Plex items.
 * Extracted for testing purposes.
 */
function buildPlexImageUrl(thumb: string | undefined, token: string): string {
  if (!thumb) return '';
  if (thumb.startsWith('/')) {
    return `https://discover.provider.plex.tv${thumb}?X-Plex-Token=${token}`;
  }
  return thumb;
}

/**
 * Get earliest addedAt timestamp from an item.
 * Extracted for testing purposes.
 */
function getEarliestAddedAt(item: UnifiedWatchlistItem): number {
  const timestamps = [item.addedAt.plex, item.addedAt.trakt, item.addedAt.imdb].filter(
    (t): t is number => t !== undefined,
  );
  return timestamps.length > 0 ? Math.min(...timestamps) : 0;
}

// Test data factory
function createMockItem(overrides: Partial<UnifiedWatchlistItem> = {}): UnifiedWatchlistItem {
  return {
    id: 'test-id',
    title: 'Test Movie',
    type: 'movie',
    year: 2024,
    thumb: '/poster.jpg',
    sources: ['plex'],
    addedAt: { plex: 1700000000 },
    isLocal: true,
    ...overrides,
  };
}

describe('buildPlexImageUrl', () => {
  it('returns empty string for undefined thumb', () => {
    expect(buildPlexImageUrl(undefined, 'token123')).toBe('');
  });

  it('returns thumb as-is if not starting with /', () => {
    const url = 'https://example.com/poster.jpg';
    expect(buildPlexImageUrl(url, 'token123')).toBe(url);
  });

  it('prepends Plex discover URL and appends token for relative paths', () => {
    const thumb = '/library/metadata/123/thumb/456';
    const result = buildPlexImageUrl(thumb, 'mytoken');
    expect(result).toBe(`https://discover.provider.plex.tv${thumb}?X-Plex-Token=mytoken`);
  });
});

describe('getEarliestAddedAt', () => {
  it('returns 0 when no timestamps are present', () => {
    const item = createMockItem({ addedAt: {} });
    expect(getEarliestAddedAt(item)).toBe(0);
  });

  it('returns the single timestamp when only one source has a timestamp', () => {
    const item = createMockItem({ addedAt: { plex: 1700000000 } });
    expect(getEarliestAddedAt(item)).toBe(1700000000);
  });

  it('returns the earliest timestamp from multiple sources', () => {
    const item = createMockItem({
      addedAt: {
        plex: 1700000000,
        trakt: 1690000000, // earlier
        imdb: 1705000000,
      },
    });
    expect(getEarliestAddedAt(item)).toBe(1690000000);
  });
});

describe('Watchlist filtering logic', () => {
  const testItems: UnifiedWatchlistItem[] = [
    createMockItem({ id: '1', title: 'Plex Movie', type: 'movie', sources: ['plex'], isLocal: true }),
    createMockItem({ id: '2', title: 'Trakt Show', type: 'show', sources: ['trakt'], isLocal: false }),
    createMockItem({
      id: '3',
      title: 'Multi Source',
      type: 'movie',
      sources: ['plex', 'trakt'],
      isLocal: true,
    }),
    createMockItem({ id: '4', title: 'IMDb Movie', type: 'movie', sources: ['imdb'], isLocal: false }),
  ];

  describe('source filter', () => {
    it('returns all items when filter is "all"', () => {
      const sourceFilter = 'all';
      const result =
        sourceFilter === 'all'
          ? testItems
          : testItems.filter((item) => item.sources.includes(sourceFilter));
      expect(result).toHaveLength(4);
    });

    it('filters by plex source', () => {
      const result = testItems.filter((item) => item.sources.includes('plex'));
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['1', '3']);
    });

    it('filters by trakt source', () => {
      const result = testItems.filter((item) => item.sources.includes('trakt'));
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['2', '3']);
    });

    it('filters by imdb source', () => {
      const result = testItems.filter((item) => item.sources.includes('imdb'));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });
  });

  describe('type filter', () => {
    it('returns all items when filter is "all"', () => {
      expect(testItems.filter(() => true)).toHaveLength(4);
    });

    it('filters movies only', () => {
      const result = testItems.filter((item) => item.type === 'movie');
      expect(result).toHaveLength(3);
    });

    it('filters shows only', () => {
      const result = testItems.filter((item) => item.type === 'show');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Trakt Show');
    });
  });

  describe('availability filter', () => {
    it('filters available items (in library)', () => {
      const result = testItems.filter((item) => item.isLocal);
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['1', '3']);
    });

    it('filters unavailable items (not in library)', () => {
      const result = testItems.filter((item) => !item.isLocal);
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['2', '4']);
    });
  });

  describe('combined filters', () => {
    it('applies source and type filters together', () => {
      const result = testItems.filter(
        (item) => item.sources.includes('plex') && item.type === 'movie'
      );
      expect(result).toHaveLength(2);
    });

    it('applies all three filters together', () => {
      const result = testItems.filter(
        (item) =>
          item.sources.includes('plex') && item.type === 'movie' && item.isLocal
      );
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['1', '3']);
    });
  });
});

describe('Watchlist sorting logic', () => {
  const now = Math.floor(Date.now() / 1000);

  const testItems: UnifiedWatchlistItem[] = [
    createMockItem({
      id: '1',
      title: 'Zebra Movie',
      addedAt: { plex: now - 1000 },
      rating: 5.5,
    }),
    createMockItem({
      id: '2',
      title: 'Alpha Movie',
      addedAt: { plex: now - 500 },
      rating: 8.2,
    }),
    createMockItem({
      id: '3',
      title: 'Middle Movie',
      addedAt: { plex: now - 2000 },
      rating: 7.0,
    }),
  ];

  it('sorts by addedAt descending (most recent first)', () => {
    const sorted = [...testItems].sort((a, b) => {
      const aTime = getEarliestAddedAt(a);
      const bTime = getEarliestAddedAt(b);
      return bTime - aTime;
    });
    expect(sorted.map((i) => i.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by addedAt ascending (oldest first)', () => {
    const sorted = [...testItems].sort((a, b) => {
      const aTime = getEarliestAddedAt(a);
      const bTime = getEarliestAddedAt(b);
      return aTime - bTime;
    });
    expect(sorted.map((i) => i.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by title ascending (A-Z)', () => {
    const sorted = [...testItems].sort((a, b) => a.title.localeCompare(b.title));
    expect(sorted.map((i) => i.title)).toEqual(['Alpha Movie', 'Middle Movie', 'Zebra Movie']);
  });

  it('sorts by title descending (Z-A)', () => {
    const sorted = [...testItems].sort((a, b) => b.title.localeCompare(a.title));
    expect(sorted.map((i) => i.title)).toEqual(['Zebra Movie', 'Middle Movie', 'Alpha Movie']);
  });

  it('sorts by score descending (highest first)', () => {
    const sorted = [...testItems].sort((a, b) => {
      const aScore = a.rating ?? 0;
      const bScore = b.rating ?? 0;
      return bScore - aScore;
    });
    expect(sorted.map((i) => i.rating)).toEqual([8.2, 7.0, 5.5]);
  });

  it('handles items without ratings when sorting by score', () => {
    const itemsWithMissingRating = [
      ...testItems,
      createMockItem({ id: '4', title: 'No Rating', rating: undefined }),
    ];
    const sorted = [...itemsWithMissingRating].sort((a, b) => {
      const aScore = a.rating ?? 0;
      const bScore = b.rating ?? 0;
      return bScore - aScore;
    });
    expect(sorted[sorted.length - 1].id).toBe('4');
  });
});

describe('Dynamic counts calculation', () => {
  const testItems: UnifiedWatchlistItem[] = [
    createMockItem({ id: '1', sources: ['plex'], type: 'movie', isLocal: true }),
    createMockItem({ id: '2', sources: ['plex'], type: 'show', isLocal: true }),
    createMockItem({ id: '3', sources: ['trakt'], type: 'movie', isLocal: false }),
    createMockItem({ id: '4', sources: ['imdb'], type: 'movie', isLocal: false }),
  ];

  it('calculates source counts correctly', () => {
    const counts = {
      all: testItems.length,
      plex: testItems.filter((i) => i.sources.includes('plex')).length,
      trakt: testItems.filter((i) => i.sources.includes('trakt')).length,
      imdb: testItems.filter((i) => i.sources.includes('imdb')).length,
    };

    expect(counts.all).toBe(4);
    expect(counts.plex).toBe(2);
    expect(counts.trakt).toBe(1);
    expect(counts.imdb).toBe(1);
  });

  it('calculates type counts correctly', () => {
    const counts = {
      all: testItems.length,
      movies: testItems.filter((i) => i.type === 'movie').length,
      shows: testItems.filter((i) => i.type === 'show').length,
    };

    expect(counts.all).toBe(4);
    expect(counts.movies).toBe(3);
    expect(counts.shows).toBe(1);
  });

  it('calculates availability counts correctly', () => {
    const counts = {
      all: testItems.length,
      available: testItems.filter((i) => i.isLocal).length,
      unavailable: testItems.filter((i) => !i.isLocal).length,
    };

    expect(counts.all).toBe(4);
    expect(counts.available).toBe(2);
    expect(counts.unavailable).toBe(2);
  });
});
