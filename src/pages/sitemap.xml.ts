import type { APIRoute } from 'astro';
import { STATES } from '../lib/states';
import { CACHE_HEADERS } from '../lib/cache';

export const prerender = false;

/**
 * Sitemap covering every public page: the home page, the trends page, the
 * static pages (/methodology, /privacy), and all 36 state/UT results pages.
 * Do not list API endpoints.
 */
export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  const urls = [
    { path: '/', lastmod: new Date().toISOString().slice(0, 10) },
    { path: '/trends', lastmod: new Date().toISOString().slice(0, 10) },
    { path: '/methodology', lastmod: new Date().toISOString().slice(0, 10) },
    { path: '/privacy', lastmod: new Date().toISOString().slice(0, 10) },
    ...STATES.map((state) => ({
      path: `/state/${state.slug}`,
      lastmod: new Date().toISOString().slice(0, 10),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${origin}${u.path}</loc><lastmod>${u.lastmod}</lastmod></url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      ...CACHE_HEADERS,
    },
  });
};