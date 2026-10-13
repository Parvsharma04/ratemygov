import postgres from 'postgres';

/**
 * Non-production demo seed for Rate My Gov.
 *
 * SAFETY: this script refuses to run unless:
 *   1. DEMO_SEED=1 is set explicitly, and
 *   2. DATABASE_URL points at localhost/127.0.0.1/::1 or at a host explicitly
 *      allow-listed via DEMO_ALLOWED_HOST.
 *
 * It writes synthetic (random) vote totals and daily snapshots so the map,
 * state tables and trend sparklines can be previewed locally. It never
 * touches the production database unless DEMO_ALLOWED_HOST is deliberately
 * pointed at it, which is strongly discouraged.
 *
 * Usage:
 *   DEMO_SEED=1 DATABASE_URL=postgresql://... node scripts/seed-demo.ts
 */

const DEMO_DAYS = 14;
const MIN_RESPONSES = 50;
const STATE_CODES = Array.from({ length: 36 }, (_, i) => i + 1);

// States/UTs deliberately left below MIN_RESPONSES so the grey hatch
// treatment and low-sample indicators can be reviewed.
const LOW_SAMPLE_CODES = new Set([19, 27, 6, 8]);

function fail(message: string): never {
  console.error(`\nRefusing to seed: ${message}\n`);
  process.exit(1);
}

function assertSafeTarget(databaseUrl: string): string {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    fail('DATABASE_URL is not a valid connection string.');
  }

  const allowed = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const extra = process.env.DEMO_ALLOWED_HOST?.trim();
  if (extra) allowed.add(extra);

  if (!allowed.has(host)) {
    fail(
      `DATABASE_URL host "${host}" is not localhost and is not listed in DEMO_ALLOWED_HOST. ` +
        'Set DEMO_ALLOWED_HOST to the exact host you intend to seed.'
    );
  }

  return host;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface DayTotals {
  offset: number;
  satisfied: number;
  dissatisfied: number;
}

/** Returns an ISO `YYYY-MM-DD` date string for `offset` days before today (UTC). */
function isoDaysAgo(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function buildSeries(code: number): DayTotals[] {
  const lowSample = LOW_SAMPLE_CODES.has(code);

  let satisfied = lowSample ? randInt(0, 3) : randInt(300, 4000);
  let dissatisfied = lowSample ? randInt(0, 3) : randInt(300, 4000);

  const series: DayTotals[] = [];

  for (let i = 0; i < DEMO_DAYS; i++) {
    // Increments are >= 10 for normal states so getStateSeries keeps the
    // day (its MIN_WINDOW_RESPONSES threshold is 10).
    satisfied += lowSample ? randInt(0, 1) : randInt(6, 40);
    dissatisfied += lowSample ? randInt(0, 1) : randInt(6, 40);

    series.push({ offset: DEMO_DAYS - 1 - i, satisfied, dissatisfied });
  }

  return series;
}

async function seed(): Promise<void> {
  if (process.env.DEMO_SEED !== '1') {
    fail('DEMO_SEED=1 was not set. This guard prevents accidental data writes.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('DATABASE_URL is required (example: postgresql://user:pass@localhost:5432/ratemygov).');
  }

  const host = assertSafeTarget(databaseUrl);

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });

  try {
    console.log(`Seeding demo data into ${host} (${DEMO_DAYS} days)...`);

    await sql.begin(async (tx) => {
      // Reset synthetic counters; leave individual `votes` rows untouched.
      await tx`update vote_counts set satisfied = 0, dissatisfied = 0`;

      const latest = new Map<number, DayTotals>();

      for (const code of STATE_CODES) {
        const series = buildSeries(code);
        latest.set(code, series[series.length - 1]);

        for (const point of series) {
          await tx`
            insert into daily_snapshots (day, state_code, satisfied, dissatisfied)
            values (${isoDaysAgo(point.offset)}, ${code}, ${point.satisfied}, ${point.dissatisfied})
            on conflict (day, state_code)
            do update set satisfied = excluded.satisfied, dissatisfied = excluded.dissatisfied
          `;
        }
      }

      // Put the latest cumulative totals into shard 0 so live totals and the
      // final snapshot agree.
      for (const [code, totals] of latest) {
        await tx`
          update vote_counts
          set satisfied = ${totals.satisfied}, dissatisfied = ${totals.dissatisfied}
          where state_code = ${code} and shard = 0
        `;
      }
    });

    console.log(`Done. Seeded ${STATE_CODES.length} states/UTs (low-sample: ${[...LOW_SAMPLE_CODES].join(', ')}).`);
    console.log(`Map threshold MIN_RESPONSES is ${MIN_RESPONSES} in this script; runtime uses the env value.`);
  } catch (error) {
    console.error('Demo seed failed:', error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((error) => {
  console.error('Fatal demo seed error:', error);
  process.exit(1);
});
