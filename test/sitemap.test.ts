import { describe, expect, it } from 'vitest';
import { GET } from '../src/pages/sitemap.xml';
import { CACHE_HEADERS } from '../src/lib/cache';
import { STATES } from '../src/lib/states';

describe('sitemap.xml endpoint', () => {
  it('returns XML with public cache headers', async () => {
    const req = new Request('https://ratemygov.in/sitemap.xml');
    const res = await GET({ request: req } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(res.headers.get('Cache-Control')).toBe(
      CACHE_HEADERS['Cache-Control']
    );
  });

  it('lists the home, trends, static pages, and every state/UT results page', async () => {
    const req = new Request('https://ratemygov.in/sitemap.xml');
    const res = await GET({ request: req } as never);
    const body = await res.text();

    expect(body).toContain('<loc>https://ratemygov.in/</loc>');
    expect(body).toContain('<loc>https://ratemygov.in/trends</loc>');
    expect(body).toContain('<loc>https://ratemygov.in/methodology</loc>');
    expect(body).toContain('<loc>https://ratemygov.in/privacy</loc>');

    for (const state of STATES) {
      expect(body).toContain(
        `<loc>https://ratemygov.in/state/${state.slug}</loc>`
      );
    }

    // Home + trends + 2 static pages + 36 state/UT pages.
    const locs = body.match(/<loc>/g) ?? [];
    expect(locs).toHaveLength(40);
  });

  it('does not expose API endpoints', async () => {
    const req = new Request('https://ratemygov.in/sitemap.xml');
    const res = await GET({ request: req } as never);
    const body = await res.text();

    expect(body).not.toContain('/api/');
    expect(body).not.toContain('<loc>https://ratemygov.in/go</loc>');
  });
});