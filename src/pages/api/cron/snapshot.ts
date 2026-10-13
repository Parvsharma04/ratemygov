import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
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
    await sql`
      insert into daily_snapshots (day, state_code, satisfied, dissatisfied)
      select current_date, state_code, sum(satisfied), sum(dissatisfied)
      from vote_counts
      group by state_code
      on conflict (day, state_code)
      do update set
        satisfied = excluded.satisfied,
        dissatisfied = excluded.dissatisfied
    `;

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
  } catch {
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
