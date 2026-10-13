import type { APIRoute } from 'astro';
import { getStateBySlug } from '../lib/states';
import { CACHE_HEADERS } from '../lib/cache';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const stateSlug = url.searchParams.get('state')?.trim().toLowerCase();

  if (!stateSlug) {
    return new Response('Missing state parameter', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const state = getStateBySlug(stateSlug);
  if (!state) {
    return new Response('State not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Deterministic navigational redirect to a public results page; safe to
  // cache at the edge with the standard public policy.
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/state/${state.slug}`,
      ...CACHE_HEADERS,
    },
  });
};
