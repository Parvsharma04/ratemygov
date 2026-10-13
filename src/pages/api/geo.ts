import type { APIRoute } from 'astro';
import { getGeoLocation } from '../../lib/vote-security';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const geo = getGeoLocation(request);

  return new Response(
    JSON.stringify({
      state: geo.geoStateSlug,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    }
  );
};
