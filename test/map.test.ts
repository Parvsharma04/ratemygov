import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MAP_VIEWBOX, STATE_PATHS } from '../src/lib/map-paths';
import { STATES } from '../src/lib/states';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('India map paths', () => {
  it('exports a valid four-number viewBox', () => {
    const parts = MAP_VIEWBOX.split(/\s+/).map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every((n) => Number.isFinite(n))).toBe(true);
    expect(parts[2]).toBeGreaterThan(0);
    expect(parts[3]).toBeGreaterThan(0);
  });

  it('contains a path for every state and Union Territory slug', () => {
    expect(Object.keys(STATE_PATHS)).toHaveLength(36);
    for (const state of STATES) {
      expect(STATE_PATHS[state.slug], `missing path for ${state.slug}`).toBeTruthy();
    }
  });

  it('only emits absolute move/line commands with one-decimal coordinates', () => {
    for (const [slug, d] of Object.entries(STATE_PATHS)) {
      expect(d.startsWith('M '), `${slug} must start with a move`).toBe(true);
      // Portability: generated coordinates are rounded to one decimal place.
      const coords = d.match(/-?\d+(\.\d+)?/g) ?? [];
      for (const c of coords) {
        expect(c, `${slug} has over-precise coordinate ${c}`).toMatch(/^-?\d+(\.\d)?$/);
      }
    }
  });

  it('keeps the generated module under the 40 KB raw budget', () => {
    const path = resolve(__dirname, '../src/lib/map-paths.ts');
    const bytes = readFileSync(path).byteLength;
    expect(bytes).toBeLessThanOrEqual(40 * 1024);
  });

  it('keeps small territories as non-empty shapes', () => {
    for (const slug of [
      'lakshadweep',
      'andaman-and-nicobar-islands',
      'chandigarh',
      'delhi',
      'puducherry',
    ]) {
      expect(STATE_PATHS[slug].length).toBeGreaterThan(10);
    }
  });
});
