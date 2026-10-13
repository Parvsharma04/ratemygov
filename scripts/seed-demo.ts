import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEMO_DAYS = 14;
const STATE_CODES = Array.from({ length: 36 }, (_, index) => index + 1);
const LOW_SAMPLE_CODES = new Set([19, 27, 6, 8]);

function fail(message: string): never {
  console.error(`\nRefusing to seed: ${message}\n`);
  process.exit(1);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isoDaysAgo(offset: number): string {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

function buildSql(): string {
  const statements = [
    'BEGIN IMMEDIATE;',
    'UPDATE vote_counts SET satisfied = 0, dissatisfied = 0;',
  ];

  for (const stateCode of STATE_CODES) {
    const lowSample = LOW_SAMPLE_CODES.has(stateCode);
    let satisfied = lowSample ? randInt(0, 3) : randInt(300, 4000);
    let dissatisfied = lowSample ? randInt(0, 3) : randInt(300, 4000);

    for (let index = 0; index < DEMO_DAYS; index++) {
      satisfied += lowSample ? randInt(0, 1) : randInt(6, 40);
      dissatisfied += lowSample ? randInt(0, 1) : randInt(6, 40);
      const day = isoDaysAgo(DEMO_DAYS - 1 - index);
      statements.push(
        `INSERT INTO daily_snapshots (day, state_code, satisfied, dissatisfied)
         VALUES ('${day}', ${stateCode}, ${satisfied}, ${dissatisfied})
         ON CONFLICT (day, state_code) DO UPDATE SET
           satisfied = excluded.satisfied,
           dissatisfied = excluded.dissatisfied;`
      );
    }

    statements.push(
      `UPDATE vote_counts
       SET satisfied = ${satisfied}, dissatisfied = ${dissatisfied}
       WHERE state_code = ${stateCode} AND shard = 0;`
    );
  }

  statements.push('COMMIT;');
  return statements.join('\n');
}

function seed(): void {
  if (process.env.DEMO_SEED !== '1') {
    fail('DEMO_SEED=1 was not set. This guard prevents accidental data writes.');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ratemygov-demo-seed-'));
  const sqlPath = join(tempDir, 'seed.sql');

  try {
    writeFileSync(sqlPath, buildSql(), { encoding: 'utf8', flag: 'wx' });
    console.log(
      `Seeding local D1 demo data for ${STATE_CODES.length} states/UTs (${DEMO_DAYS} days)...`
    );
    execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        'rate-my-gov',
        '--local',
        '--file',
        sqlPath,
      ],
      { stdio: 'inherit' }
    );
    console.log('Demo seed completed.');
  } catch (error) {
    console.error('Demo seed failed.', error);
    process.exitCode = 1;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

seed();
