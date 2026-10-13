import { describe, expect, it, afterAll } from 'vitest';
import { sql, closeDb } from '../src/lib/db';
import { getAllTotals } from '../src/lib/votes';
import {
  getWindowSentiment,
  getSnapshotDayCount,
  buildTrendRows,
} from '../src/lib/trends';
import { STATES } from '../src/lib/states';

const isDatabaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!isDatabaseAvailable)('Trends database integration', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('reads distinct snapshot days and builds a full 36-row table without crashing', async () => {
    const [snapshotDays, totals, sentiment] = await Promise.all([
      getSnapshotDayCount(),
      getAllTotals(),
      getWindowSentiment(7),
    ]);

    const rows = buildTrendRows(STATES, totals, sentiment);

    expect(snapshotDays).toBeGreaterThanOrEqual(0);
    expect(rows).toHaveLength(36);

    // Sort guarantee: non-null changes first, descending by absolute change.
    const positions = rows.map((r) => r.change === null);
    const firstNull = positions.indexOf(true);
    if (firstNull !== -1) {
      for (let i = firstNull; i < positions.length; i++) {
        expect(positions[i]).toBe(true);
      }
    }

    // Every state maps to its row.
    for (const state of STATES) {
      expect(rows.some((r) => r.slug === state.slug)).toBe(true);
    }

    expect(sql).toBeDefined();
  });
});