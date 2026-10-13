import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const cronSecret =
    import.meta.env.CRON_SECRET ||
    (typeof process !== 'undefined' ? process.env.CRON_SECRET : undefined);

  const authHeader =
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
    await getDb(locals.runtime.env)
      .prepare(
        `INSERT INTO daily_snapshots (day, state_code, satisfied, dissatisfied)
         SELECT date('now'), state_code, SUM(satisfied), SUM(dissatisfied)
         FROM vote_counts
         GROUP BY state_code
         ON CONFLICT (day, state_code) DO UPDATE SET
           satisfied = excluded.satisfied,
           dissatisfied = excluded.dissatisfied`
      )
      .run();

    return new Response(
      JSON.stringify({
        status: 'ok',
        day: new Date().toISOString().slice(0, 10),
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
    console.error('Snapshot failed:', error);
    return new Response(
      JSON.stringify({ status: 'error', message: 'Snapshot failed' }),
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
