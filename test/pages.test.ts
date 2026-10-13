import { describe, expect, it } from 'vitest';
import { GET as goHandler } from '../src/pages/go';
import { CACHE_HEADERS } from '../src/lib/cache';

describe('Navigation & Redirect Handler (/go)', () => {
  it('redirects valid state slug with 302 to /state/<slug> and caches it', async () => {
    const req = new Request('https://ratemygov.in/go?state=delhi');

    const res = await goHandler({ request: req } as never);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/state/delhi');
    expect(res.headers.get('Cache-Control')).toBe(
      CACHE_HEADERS['Cache-Control']
    );
  });

  it('redirects case-insensitively with 302 to lowercase slug', async () => {
    const req = new Request('https://ratemygov.in/go?state=MAHARASHTRA');

    const res = await goHandler({ request: req } as never);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/state/maharashtra');
  });

  it('returns 404 on unknown state slug', async () => {
    const req = new Request('https://ratemygov.in/go?state=atlantis');

    const res = await goHandler({ request: req } as never);
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 404 when state query parameter is missing', async () => {
    const req = new Request('https://ratemygov.in/go');

    const res = await goHandler({ request: req } as never);
    expect(res.status).toBe(404);
  });
});
