import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CACHE_HEADERS } from '../src/lib/cache';

const root = resolve(import.meta.dirname, '..');

describe('static assets (robots.txt, _headers)', () => {
  it('serves a robots.txt that allows crawling and references the sitemap', () => {
    const robots = readFileSync(resolve(root, 'public/robots.txt'), 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://ratemygov.in/sitemap.xml');
  });

  it('applies the public cache header to the prerendered pages via _headers', () => {
    const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');
    const cacheValue = CACHE_HEADERS['Cache-Control'];

    // Splat rules cover both the bare path and the trailing-slash form that
    // Cloudflare Assets redirects to when serving index.html.
    for (const page of ['/methodology*', '/privacy*']) {
      const rule = headers
        .split('\n')
        .findIndex((line) => line.trim() === page);
      expect(rule, `${page} should have a headers rule`).toBeGreaterThanOrEqual(
        0
      );
      const following = headers
        .split('\n')
        .slice(rule + 1, rule + 2)
        .join('')
        .trim();
      expect(following).toBe(`Cache-Control: ${cacheValue}`);
    }
  });
});

describe('prerendered static pages', () => {
  for (const page of ['methodology', 'privacy']) {
    it(`${page}.astro is prerendered and linked in the footer`, () => {
      const source = readFileSync(
        resolve(root, `src/pages/${page}.astro`),
        'utf8'
      );
      expect(source).toContain('export const prerender = true;');
      expect(source).toContain('import Base from');

      const base = readFileSync(resolve(root, 'src/layouts/Base.astro'), 'utf8');
      expect(base).toContain(`<a href="/${page}">`);
    });
  }
});

describe('favicon', () => {
  it('Base.astro includes an inline SVG favicon data URI', () => {
    const base = readFileSync(resolve(root, 'src/layouts/Base.astro'), 'utf8');
    const match = base.match(/rel="icon"\s+href="(data:image\/svg\+xml,[^"]+)"/);

    expect(match).not.toBeNull();
    const href = match?.[1] ?? '';

    // The encoded payload decodes to a well-formed standalone SVG.
    const svg = decodeURIComponent(href.replace(/^data:image\/svg\+xml,/, ''));
    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain("xmlns='http://www.w3.org/2000/svg'");
    expect(svg).toContain("viewBox='0 0 32 32'");
    expect(svg.endsWith('</svg>')).toBe(true);
    // The data URI itself must not contain a raw `#` (which would start a URL fragment).
    expect(href).not.toContain('#');
  });
});