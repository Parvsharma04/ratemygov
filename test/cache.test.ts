import { describe, expect, it, vi } from 'vitest';
import zlib from 'node:zlib';
import { CACHE_HEADERS, pct } from '../src/lib/cache';
import * as votesDb from '../src/lib/votes';
import { GET as statsJsonHandler } from '../src/pages/api/stats.json';

describe('Cache configuration & pct() percentage calculator', () => {
  it('exports exact CACHE_HEADERS for public edge caching', () => {
    expect(CACHE_HEADERS).toEqual({
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
    });
  });

  describe('pct() largest remainder method', () => {
    it('returns null when there are zero votes', () => {
      expect(pct(0, 0)).toBeNull();
    });

    it('returns null on negative numbers', () => {
      expect(pct(-5, 10)).toBeNull();
      expect(pct(10, -5)).toBeNull();
    });

    it('handles 100% satisfied or dissatisfied cleanly', () => {
      const allSat = pct(15, 0);
      expect(allSat).not.toBeNull();
      expect(allSat?.satisfied).toBe(100);
      expect(allSat?.dissatisfied).toBe(0);
      expect(allSat!.satisfied + allSat!.dissatisfied).toBe(100);

      const allDis = pct(0, 25);
      expect(allDis).not.toBeNull();
      expect(allDis?.satisfied).toBe(0);
      expect(allDis?.dissatisfied).toBe(100);
      expect(allDis!.satisfied + allDis!.dissatisfied).toBe(100);
    });

    it('handles 50-50 splits', () => {
      const split1 = pct(1, 1);
      expect(split1?.satisfied).toBe(50);
      expect(split1?.dissatisfied).toBe(50);
      expect(split1!.satisfied + split1!.dissatisfied).toBe(100);

      const split50 = pct(50, 50);
      expect(split50?.satisfied).toBe(50);
      expect(split50?.dissatisfied).toBe(50);
    });

    it('applies largest remainder for 1 vs 2 (33.33% vs 66.67%)', () => {
      const result = pct(1, 2);
      expect(result).not.toBeNull();
      expect(result?.satisfied).toBe(33);
      expect(result?.dissatisfied).toBe(67);
      expect(result!.satisfied + result!.dissatisfied).toBe(100);
    });

    it('applies largest remainder for 2 vs 1 (66.67% vs 33.33%)', () => {
      const result = pct(2, 1);
      expect(result).not.toBeNull();
      expect(result?.satisfied).toBe(67);
      expect(result?.dissatisfied).toBe(33);
      expect(result!.satisfied + result!.dissatisfied).toBe(100);
    });

    it('supports array destructuring and object property access', () => {
      const res = pct(1, 2)!;
      // Object access
      expect(res.satisfied).toBe(33);
      expect(res.dissatisfied).toBe(67);

      // Array destructure
      const [sat, dis] = res;
      expect(sat).toBe(33);
      expect(dis).toBe(67);
    });

    it('always sums to exactly 100 across 200 random vote combinations', () => {
      for (let i = 1; i <= 200; i++) {
        const sat = Math.floor(Math.random() * 5000) + 1;
        const dis = Math.floor(Math.random() * 5000) + 1;
        const res = pct(sat, dis);
        expect(res).not.toBeNull();
        expect(res!.satisfied + res!.dissatisfied).toBe(100);
        expect(Number.isInteger(res!.satisfied)).toBe(true);
        expect(Number.isInteger(res!.dissatisfied)).toBe(true);
      }
    });
  });

  describe('GET /api/stats.json endpoint', () => {
    it('returns all 36 states with cache headers and compressed size under 4 KB', async () => {
      vi.spyOn(votesDb, 'getAllTotals').mockResolvedValue(
        Array.from({ length: 36 }, (_, i) => ({
          stateCode: i + 1,
          satisfied: (i + 1) * 10,
          dissatisfied: (i + 1) * 5,
          total: (i + 1) * 15,
        }))
      );

      const res = await statsJsonHandler({
        locals: { runtime: { env: { DB: {} } } },
      } as any);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(
        'public, s-maxage=30, stale-while-revalidate=300'
      );
      expect(res.headers.get('Content-Type')).toBe('application/json');

      const bodyText = await res.text();
      const uncompressedBytes = Buffer.byteLength(bodyText, 'utf8');
      const gzippedBytes = zlib.gzipSync(Buffer.from(bodyText, 'utf8')).byteLength;

      // Both uncompressed and compressed are under 4 KB
      expect(uncompressedBytes).toBeLessThan(4096);
      expect(gzippedBytes).toBeLessThan(4096);

      const json = JSON.parse(bodyText);
      expect(json.generatedAt).toBeDefined();
      expect(Array.isArray(json.states)).toBe(true);
      expect(json.states).toHaveLength(36);
      expect(json.states[0]).toHaveProperty('slug');
      expect(json.states[0]).toHaveProperty('satisfied');
      expect(json.states[0]).toHaveProperty('dissatisfied');
      expect(typeof json.total).toBe('number');
      expect(json.total).toBeGreaterThan(0);
    });
  });
});
