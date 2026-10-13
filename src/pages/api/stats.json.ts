import type { APIRoute } from 'astro';
import { getAllTotals } from '../../lib/votes';
import { STATES } from '../../lib/states';
import { CACHE_HEADERS } from '../../lib/cache';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const allTotals = await getAllTotals(locals.runtime.env);
    const totalsByCode = new Map(allTotals.map((t) => [t.stateCode, t]));

    const states = STATES.map((state) => {
      const entry = totalsByCode.get(state.code);
      return {
        slug: state.slug,
        satisfied: entry?.satisfied ?? 0,
        dissatisfied: entry?.dissatisfied ?? 0,
      };
    });

    const total = states.reduce(
      (sum, s) => sum + s.satisfied + s.dissatisfied,
      0
    );

    const payload = {
      generatedAt: new Date().toISOString(),
      states,
      total,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CACHE_HEADERS,
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Service Temporarily Unavailable' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
};
