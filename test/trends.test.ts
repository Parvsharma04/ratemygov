import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fixture snapshots for state 1 over 12 days (cumulative totals)
const FIXTURE_SNAPSHOTS = [
  { day: '2026-09-01', state_code: 1, satisfied: 100, dissatisfied: 50 },
  { day: '2026-09-02', state_code: 1, satisfied: 115, dissatisfied: 55 },   // +15 sat, +5 dis = 20 total, 75%
  { day: '2026-09-03', state_code: 1, satisfied: 125, dissatisfied: 70 },   // +10 sat, +15 dis = 25, 40%
  { day: '2026-09-04', state_code: 1, satisfied: 128, dissatisfied: 72 },   // +3 sat, +2 dis = 5, <10 → skip
  { day: '2026-09-05', state_code: 1, satisfied: 140, dissatisfied: 80 },   // +12 sat, +8 dis = 20, 60%
  { day: '2026-09-06', state_code: 1, satisfied: 160, dissatisfied: 90 },   // +20 sat, +10 dis = 30, 67%
  { day: '2026-09-07', state_code: 1, satisfied: 180, dissatisfied: 100 },  // +20 sat, +10 dis = 30, 67%
  { day: '2026-09-08', state_code: 1, satisfied: 190, dissatisfied: 120 },  // +10 sat, +20 dis = 30, 33%
  { day: '2026-09-09', state_code: 1, satisfied: 200, dissatisfied: 140 },  // +10 sat, +20 dis = 30, 33%
  { day: '2026-09-10', state_code: 1, satisfied: 220, dissatisfied: 150 },  // +20 sat, +10 dis = 30, 67%
  { day: '2026-09-11', state_code: 1, satisfied: 240, dissatisfied: 160 },  // +20 sat, +10 dis = 30, 67%
  { day: '2026-09-12', state_code: 1, satisfied: 260, dissatisfied: 170 },  // +20 sat, +10 dis = 30, 67%
];

// Mock db.ts before importing trends
vi.mock('../src/lib/db', () => {
  const handler = {
    apply(_target: any, _thisArg: any, argArray: any[]) {
      const tag = argArray[0] as TemplateStringsArray;
      const raw = tag.raw.join('').trim();

      // getStateSeries query
      if (raw.includes('from daily_snapshots') && raw.includes('order by day')) {
        const stateCode = argArray[1];
        const rows = FIXTURE_SNAPSHOTS.filter(
          (r) => r.state_code === stateCode
        ).sort((a, b) => a.day.localeCompare(b.day));
        return Promise.resolve(rows);
      }

      // getSnapshotCount query
      if (raw.includes('count(*)') && raw.includes('daily_snapshots')) {
        const stateCode = argArray[1];
        const cnt = FIXTURE_SNAPSHOTS.filter(
          (r) => r.state_code === stateCode
        ).length;
        return Promise.resolve([{ cnt }]);
      }

      // getSnapshotDayCount query
      if (raw.includes('count(distinct day)') && raw.includes('daily_snapshots')) {
        const distinctDays = new Set(FIXTURE_SNAPSHOTS.map((r) => r.day)).size;
        return Promise.resolve([{ cnt: distinctDays }]);
      }

      // getWindowSentiment – distinct on base snapshot
      if (raw.includes('distinct on') && raw.includes('daily_snapshots')) {
        const days = argArray[1];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const grouped = new Map<
          number,
          { state_code: number; satisfied: number; dissatisfied: number }
        >();
        for (const r of FIXTURE_SNAPSHOTS) {
          if (r.day <= cutoffStr) {
            const existing = grouped.get(r.state_code);
            if (!existing || r.day > (existing as any).day) {
              grouped.set(r.state_code, { ...r });
            }
          }
        }
        return Promise.resolve(Array.from(grouped.values()));
      }

      // getWindowSentiment – live totals from vote_counts
      if (
        raw.includes('sum(satisfied)') &&
        raw.includes('vote_counts') &&
        raw.includes('group by state_code')
      ) {
        // Return the latest snapshot values as "live" totals
        const latest = FIXTURE_SNAPSHOTS[FIXTURE_SNAPSHOTS.length - 1];
        return Promise.resolve([
          {
            state_code: latest.state_code,
            satisfied: BigInt(latest.satisfied),
            dissatisfied: BigInt(latest.dissatisfied),
          },
        ]);
      }

      return Promise.resolve([]);
    },
    get(_target: any, prop: string | symbol) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string') {
        return (..._args: any[]) => Promise.resolve([]);
      }
      return undefined;
    },
  };

  const proxy = new Proxy((() => {}) as any, handler);
  return { sql: proxy, getDb: () => proxy, closeDb: async () => {} };
});

import {
  getStateSeries,
  getSnapshotCount,
  getSnapshotDayCount,
  getWindowSentiment,
  normalizeTrendWindow,
  buildTrendRows,
} from '../src/lib/trends';

describe('Trends helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStateSeries', () => {
    it('computes daily deltas and skips days with fewer than 10 new votes', async () => {
      const series = await getStateSeries(1, 30);

      // Day 2026-09-04 has only 5 total new votes and should be skipped
      expect(series.find((p) => p.day === '2026-09-04')).toBeUndefined();

      // Day 2026-09-02: +15 sat / 20 total = 75%
      const day2 = series.find((p) => p.day === '2026-09-02');
      expect(day2).toBeDefined();
      expect(day2!.satPct).toBe(75);

      // Day 2026-09-03: +10 sat / 25 total = 40%
      const day3 = series.find((p) => p.day === '2026-09-03');
      expect(day3).toBeDefined();
      expect(day3!.satPct).toBe(40);

      // Day 2026-09-05: +12 sat / 20 total = 60%
      const day5 = series.find((p) => p.day === '2026-09-05');
      expect(day5).toBeDefined();
      expect(day5!.satPct).toBe(60);
    });

    it('returns at most `days` points', async () => {
      const series = await getStateSeries(1, 5);
      expect(series.length).toBeLessThanOrEqual(5);
    });

    it('returns empty for a state with no snapshots', async () => {
      const series = await getStateSeries(999, 30);
      expect(series).toEqual([]);
    });

    it('returns exactly 10 valid data points from 12-day fixture', async () => {
      const series = await getStateSeries(1, 30);
      // 11 deltas, 1 skipped (day 4), so 10 valid points
      expect(series.length).toBe(10);
    });
  });

  describe('getSnapshotCount', () => {
    it('returns the correct count for a state with snapshots', async () => {
      const count = await getSnapshotCount(1);
      expect(count).toBe(12);
    });

    it('returns 0 for a state with no snapshots', async () => {
      const count = await getSnapshotCount(999);
      expect(count).toBe(0);
    });
  });

  describe('getSnapshotDayCount', () => {
    it('returns the number of distinct snapshot days', async () => {
      const days = await getSnapshotDayCount();
      expect(days).toBe(12);
    });
  });

  describe('normalizeTrendWindow', () => {
    it('accepts only the whitelisted windows', () => {
      expect(normalizeTrendWindow('7')).toEqual({ days: 7, redirect: false });
      expect(normalizeTrendWindow('30')).toEqual({ days: 30, redirect: false });
    });

    it('defaults a missing window to 7 days without redirecting', () => {
      expect(normalizeTrendWindow(null)).toEqual({ days: 7, redirect: false });
    });

    it('redirects any other provided value to the default 7-day window', () => {
      expect(normalizeTrendWindow('5')).toEqual({ days: 7, redirect: true });
      expect(normalizeTrendWindow('100')).toEqual({ days: 7, redirect: true });
      expect(normalizeTrendWindow('')).toEqual({ days: 7, redirect: true });
      expect(normalizeTrendWindow('thirty')).toEqual({ days: 7, redirect: true });
    });
  });

  describe('buildTrendRows', () => {
    const states = [
      { code: 1, slug: 'state-a', name: 'State A' },
      { code: 2, slug: 'state-b', name: 'State B' },
      { code: 3, slug: 'state-c', name: 'State C' },
    ] as const;

    const allTotals = [
      { stateCode: 1, satisfied: 90, dissatisfied: 10 }, // all-time 90%
      { stateCode: 2, satisfied: 50, dissatisfied: 50 }, // all-time 50%
    ];

    it('computes change as window minus all-time and sorts by absolute change', () => {
      const sentiment = new Map([
        [1, { stateCode: 1, newSat: 80, newDis: 20, share: 80 }], // change -10
        [2, { stateCode: 2, newSat: 95, newDis: 5, share: 95 }], // change +45
        [3, null],
      ]);

      const rows = buildTrendRows(states, allTotals, sentiment);

      // Sorted by |change| descending; state without change last.
      expect(rows.map((r) => r.code)).toEqual([2, 1, 3]);

      expect(rows[0].change).toBe(45);
      expect(rows[0].windowPct).toBe(95);
      expect(rows[0].allTimePct).toBe(50);
      expect(rows[1].change).toBe(-10);
      expect(rows[2].change).toBeNull();
      expect(rows[2].windowPct).toBeNull();
    });

    it('keeps states without change data at the end in original order', () => {
      const sentiment = new Map([
        [1, { stateCode: 1, newSat: 60, newDis: 40, share: 60 }], // change -30
        [2, null],
        [3, null],
      ]);

      const rows = buildTrendRows(states, allTotals, sentiment);
      expect(rows.map((r) => r.code)).toEqual([1, 2, 3]);
      expect(rows[0].change).toBe(-30);
    });

    it('handles zero responses and null shares without throwing', () => {
      const rows = buildTrendRows(states, [], new Map());
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.change === null)).toBe(true);
      expect(rows.every((r) => r.windowTotal === 0)).toBe(true);
    });
  });

  describe('getWindowSentiment', () => {
    it('returns null for states without sufficient history', async () => {
      // Use a window larger than our fixture range
      const result = await getWindowSentiment(365);
      // State 1 won't have a base snapshot 365 days old
      const s1 = result.get(1);
      expect(s1).toBeNull();
    });
  });
});
