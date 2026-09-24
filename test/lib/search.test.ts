import { describe, it, expect } from 'vitest';
import { excludeLibraryMatches } from '~/lib/search';

describe('excludeLibraryMatches', () => {
  const library = [
    { title: 'Amélie', type: 'movie', year: 2001 },
    { title: 'Law & Order', type: 'show', year: 1990 },
  ];

  it('drops titles already in the library, ignoring accents, punctuation and off-by-one years', () => {
    const external = [
      { title: 'Amelie', type: 'movie' as const, releaseDate: '2002-02-08' },
      { title: 'Law and Order', type: 'show' as const, releaseDate: '1990-09-13' },
    ];
    expect(excludeLibraryMatches(external, library)).toEqual([]);
  });

  it('keeps remakes, other media types, and unmatched titles', () => {
    const external = [
      { title: 'Amélie', type: 'movie' as const, releaseDate: '2025-01-01' },
      { title: 'Amélie', type: 'show' as const, releaseDate: '2001-01-01' },
      { title: 'Heat', type: 'movie' as const, releaseDate: '1995-12-15' },
    ];
    expect(excludeLibraryMatches(external, library)).toEqual(external);
  });
});
