import type { APIRoute } from 'astro';
import { STATES } from '../../lib/states';
import { getRecentVoteCounts } from '../../lib/votes';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const cronSecret =
    import.meta.env.CRON_SECRET ||
    (typeof process !== 'undefined' ? process.env.CRON_SECRET : undefined);

  // Protected by CRON_SECRET header
  const authHeader =
    request.headers.get('cron_secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!cronSecret || authHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const recentCounts = await getRecentVoteCounts(locals.runtime.env, 5);
    const countMap = new Map<number, number>(
      recentCounts.map((r) => [r.stateCode, r.count])
    );

    let totalRecentVotes = 0;
    const states = STATES.map((state) => {
      const votesLast5Min = countMap.get(state.code) ?? 0;
      totalRecentVotes += votesLast5Min;
      return {
        code: state.code,
        slug: state.slug,
        name: state.name,
        votesLast5Min,
      };
    });

    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        windowMinutes: 5,
        totalVotesLast5Min: totalRecentVotes,
        states,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Database query failed',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
};
