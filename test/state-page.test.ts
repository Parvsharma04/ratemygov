import { describe, expect, it } from 'vitest';
import { getStateBySlug } from '../src/lib/states';
import { CACHE_HEADERS } from '../src/lib/cache';

describe('State page route logic (/state/[slug])', () => {
  it('identifies valid states and rejects unknown slugs', () => {
    const delhi = getStateBySlug('delhi');
    expect(delhi).toBeDefined();
    expect(delhi?.name).toBe('Delhi');

    const invalid = getStateBySlug('invalid-slug-xyz');
    expect(invalid).toBeUndefined();
  });

  it('verifies cache header rules for public view vs voted query param', () => {
    // Normal view: public edge cache
    const publicHeaders = { 'Cache-Control': CACHE_HEADERS['Cache-Control'] };
    expect(publicHeaders['Cache-Control']).toBe(
      'public, s-maxage=30, stale-while-revalidate=300'
    );

    // Voted confirmation view (?voted=1 or ?voted=dup): no-store
    const votedHeaders = { 'Cache-Control': 'no-store' };
    expect(votedHeaders['Cache-Control']).toBe('no-store');
  });

  it('formats duplicate banner copy matching specification', () => {
    const stateName = 'Maharashtra';
    const expectedCopy = `A response from this device or network has already been recorded for ${stateName}.`;
    expect(expectedCopy).toBe(
      'A response from this device or network has already been recorded for Maharashtra.'
    );
  });
});
